// Barcodes of packaged foods: checking the number and looking the product up on Open Food Facts
// (open database, ODbL licence: https://world.openfoodfacts.org). Only the barcode is sent.

import type { Food } from '../db/types';
import { uid } from './ids';

export const OFF_SOURCE = 'Open Food Facts (openfoodfacts.org), Open Database License';

/** Digits of a typed or scanned barcode. */
export const cleanBarcode = (s: string) => s.replace(/\D/g, '');

/** EAN-8, UPC-A (12), EAN-13 or GTIN-14 with a correct check digit. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Same product, written as 12 or 13 digits (UPC-A is EAN-13 with a leading 0). */
export function barcodeVariants(code: string): string[] {
  if (code.length === 12) return [code, `0${code}`];
  if (code.length === 13 && code.startsWith('0')) return [code, code.slice(1)];
  return [code];
}

interface OffProduct {
  product_name?: string;
  product_name_it?: string;
  generic_name_it?: string;
  brands?: string;
  serving_quantity?: number | string;
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A food (values per 100 g) from an Open Food Facts product, or null when it has no usable values. */
export function foodFromOff(code: string, p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  const kj = num(n['energy-kj_100g']) ?? (n.energy_unit === 'kJ' || n.energy_unit === undefined ? num(n.energy_100g) : undefined);
  let kcal = num(n['energy-kcal_100g']) ?? (kj !== undefined ? kj / 4.184 : undefined);
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  if (kcal === undefined && protein === undefined && carbs === undefined && fat === undefined) return null;
  kcal ??= (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;
  const sodiumG = num(n.sodium_100g) ?? (num(n.salt_100g) !== undefined ? num(n.salt_100g)! / 2.5 : undefined);
  const name = (p.product_name_it || p.product_name || p.generic_name_it || '').trim();
  const brand = p.brands?.split(',')[0]?.trim() || undefined;
  const portion = num(p.serving_quantity);
  return {
    id: uid(),
    name: name || brand || `Product ${code}`,
    brand,
    category: '',
    source: 'custom',
    origin: 'openfoodfacts',
    barcode: code,
    kcal: Math.round(kcal),
    protein: r1(protein ?? 0),
    carbs: r1(carbs ?? 0),
    fat: r1(fat ?? 0),
    sugars: num(n.sugars_100g) !== undefined ? r1(num(n.sugars_100g)!) : undefined,
    fiber: num(n.fiber_100g) !== undefined ? r1(num(n.fiber_100g)!) : undefined,
    saturatedFat: num(n['saturated-fat_100g']) !== undefined ? r1(num(n['saturated-fat_100g'])!) : undefined,
    sodium: sodiumG !== undefined ? Math.round(sodiumG * 1000) : undefined,
    portionG: portion && portion > 0 && portion < 2000 ? Math.round(portion) : undefined,
  };
}

export type LookupResult = { status: 'found'; food: Food } | { status: 'not_found' } | { status: 'no_values' } | { status: 'offline' };

const FIELDS = 'code,product_name,product_name_it,generic_name_it,brands,serving_quantity,nutriments';

/** Look a barcode up on Open Food Facts. */
export async function lookupOpenFoodFacts(code: string, fetchFn: typeof fetch = fetch): Promise<LookupResult> {
  let res: Response;
  try {
    res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}&lc=it`);
  } catch {
    return { status: 'offline' };
  }
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) return { status: 'offline' };
  let body: { status?: number; product?: OffProduct };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { status: 'offline' };
  }
  if (body.status !== 1 || !body.product) return { status: 'not_found' };
  const food = foodFromOff(code, body.product);
  return food ? { status: 'found', food } : { status: 'no_values' };
}
