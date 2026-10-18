// Reads the text of a nutrition label photo on the phone with Tesseract (nothing leaves the
// device). Its files are published with the app under ocr/ (see vite.config.ts) and loaded only here.

import { parseLabel, reconcile, type LabelValues } from './labelReader';

/** Small label text needs pixels: photos are read at up to 3200 px, small images are enlarged to 2400 px. */
const MAX_SIDE = 3200;
const MIN_SIDE = 2400;

/** The photo, upright, sized for reading, in high-contrast grey. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.max(bitmap.width, bitmap.height);
  const scale = side > MAX_SIDE ? MAX_SIDE / side : side < MIN_SIDE ? MIN_SIDE / side : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // Grey, then stretch the contrast between the darkest and lightest 2 %.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    d[i] = g;
    hist[g]++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.02; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.02; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The same picture with light and dark swapped (labels with white text on a coloured band). */
function inverted(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  // Pixel by pixel: older iPhones do not support canvas filters.
  const img = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

const count = (v: LabelValues) => Object.values(v).filter((x) => x !== undefined).length;

/** Values of the better reading, completed with the other one. */
export function mergeReadings(a: LabelValues, b: LabelValues): LabelValues {
  const [main, extra] = count(a) >= count(b) ? [a, b] : [b, a];
  const out: LabelValues = { ...main };
  for (const k of Object.keys(extra) as (keyof LabelValues)[]) out[k] ??= extra[k];
  return reconcile(out);
}

export interface LabelReading {
  values: LabelValues;
  text: string;
}

/** Read a label photo. `onProgress` gets 0…1. */
export async function readLabelPhoto(file: Blob, onProgress?: (p: number) => void): Promise<LabelReading> {
  const [{ createWorker }, canvas] = await Promise.all([import('tesseract.js'), prepare(file)]);
  const base = new URL('ocr/', document.baseURI).href;
  // Progress: loading 0–0.2, first reading 0.2–0.6, second reading 0.6–1.
  let stage = 0;
  const worker = await createWorker('ita', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: `${base}lang`,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(0.2 + stage * 0.4 + m.progress * 0.4);
      else if (stage === 0) onProgress?.(Math.min(0.2, m.progress * 0.2));
    },
  });
  try {
    const first = await worker.recognize(canvas);
    const a = parseLabel(first.data.text);
    // Dark labels (white text) read badly the normal way: read them again with colours swapped.
    if (count(a) >= 7) return { values: a, text: first.data.text };
    stage = 1;
    const second = await worker.recognize(inverted(canvas));
    return { values: mergeReadings(a, parseLabel(second.data.text)), text: `${first.data.text}\n---\n${second.data.text}` };
  } finally {
    await worker.terminate();
  }
}
