// Reads the text of a nutrition label photo on the phone with Tesseract (nothing leaves the
// device). Its files are published with the app under ocr/ (see vite.config.ts) and loaded only here.

import { parseLabel, type LabelValues } from './labelReader';

const MAX_SIDE = 2000;

/** The photo, upright, at most 2000 px, in high-contrast grey (easier to read). */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
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

export interface LabelReading {
  values: LabelValues;
  text: string;
}

/** Read a label photo. `onProgress` gets 0…1. */
export async function readLabelPhoto(file: Blob, onProgress?: (p: number) => void): Promise<LabelReading> {
  const [{ createWorker }, canvas] = await Promise.all([import('tesseract.js'), prepare(file)]);
  const base = new URL('ocr/', document.baseURI).href;
  const worker = await createWorker('ita', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: `${base}lang`,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      // Loading takes the first part of the bar, reading the rest.
      if (m.status === 'recognizing text') onProgress?.(0.3 + m.progress * 0.7);
      else onProgress?.(Math.min(0.3, m.progress * 0.3));
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { values: parseLabel(data.text), text: data.text };
  } finally {
    await worker.terminate();
  }
}
