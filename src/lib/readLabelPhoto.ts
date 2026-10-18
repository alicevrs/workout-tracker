// Reads a nutrition label photo with Claude, through the app's own Cloudflare Worker (the API key
// stays there). The photo (the framed part) is reduced and sent; nothing is stored.

import { SYNC_URL } from './sync/config';

/** Values per 100 g read from a label. */
export interface LabelValues {
  kcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbs?: number;
  sugars?: number;
  fiber?: number;
  protein?: number;
  /** mg */
  sodium?: number;
  portionG?: number;
}

/** Names of the values found, for the message after reading. */
export const LABEL_NAMES: Record<keyof LabelValues, string> = {
  kcal: 'energy',
  fat: 'fat',
  saturatedFat: 'saturated fat',
  carbs: 'carbohydrates',
  sugars: 'sugars',
  fiber: 'fibre',
  protein: 'protein',
  sodium: 'salt',
  portionG: 'portion',
};

export interface LabelReading {
  values: LabelValues;
  name?: string;
  brand?: string;
}

export class LabelError extends Error {}

/** Longest side sent: enough for small print, as recommended for images sent to Claude. */
const MAX_SIDE = 1568;

/** The photo as a JPEG (base64), upright, at most 1568 px. */
export async function encodePhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL('image/jpeg', 0.88);
  return url.slice(url.indexOf(',') + 1);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The Worker's answer turned into the food's fields (salt → sodium in mg). */
export function readingFromResponse(body: { found?: boolean; values?: Record<string, unknown> }): LabelReading {
  const v = body.values ?? {};
  const num = (k: string) => (typeof v[k] === 'number' ? (v[k] as number) : undefined);
  const values: LabelValues = {};
  const kcal = num('kcal');
  if (kcal !== undefined) values.kcal = Math.round(kcal);
  for (const k of ['fat', 'saturatedFat', 'carbs', 'sugars', 'fiber', 'protein'] as const) {
    const n = num(k);
    if (n !== undefined) values[k] = round1(n);
  }
  const salt = num('salt');
  if (salt !== undefined) values.sodium = Math.round((salt / 2.5) * 1000);
  const portion = num('portionG');
  if (portion !== undefined) values.portionG = Math.round(portion);
  return { values, name: typeof v.name === 'string' ? v.name : undefined, brand: typeof v.brand === 'string' ? v.brand : undefined };
}

const MESSAGES: Record<string, string> = {
  not_configured: 'Label reading is not set up yet (the service key is missing). Type the values for now.',
  limit: 'Too many label photos today. Try again tomorrow, or type the values.',
  busy: 'The reading service is busy. Try again in a minute.',
  refused: 'This photo could not be read. Try another photo of the table.',
};

/** Send a label photo to be read. Throws LabelError with a message for the person. */
export async function readLabelPhoto(file: Blob, fetchFn: typeof fetch = fetch): Promise<LabelReading> {
  const image = await encodePhoto(file);
  return sendLabel(image, fetchFn);
}

/** The network part of readLabelPhoto (separate so it can be tested without a canvas). */
export async function sendLabel(image: string, fetchFn: typeof fetch = fetch): Promise<LabelReading> {
  let res: Response;
  try {
    res = await fetchFn(`${SYNC_URL.replace(/\/$/, '')}/v1/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
    });
  } catch {
    throw new LabelError('No connection: the photo needs internet to be read.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; found?: boolean; values?: Record<string, unknown> };
  if (!res.ok) throw new LabelError(MESSAGES[body.error ?? ''] ?? 'The photo could not be read right now. Try again, or type the values.');
  return readingFromResponse(body);
}
