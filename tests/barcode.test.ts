import { describe, expect, it } from 'vitest';
import { barcodeVariants, cleanBarcode, foodFromOff, isValidBarcode, lookupOpenFoodFacts } from '../src/lib/barcode';

const product = {
  product_name: 'Spaghetti n.5',
  product_name_it: 'Spaghetti n°5',
  brands: 'Barilla, Barilla G. e R. Fratelli',
  serving_quantity: '85',
  nutriments: {
    'energy-kcal_100g': 359,
    'energy-kj_100g': 1521,
    proteins_100g: 13,
    carbohydrates_100g: 71,
    sugars_100g: 3.5,
    fat_100g: 2,
    'saturated-fat_100g': 0.5,
    fiber_100g: 3,
    salt_100g: 0.013,
  },
};

const response = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('barcodes', () => {
  it('checks the check digit of EAN-13, EAN-8 and UPC-A', () => {
    expect(isValidBarcode('8076800195057')).toBe(true);
    expect(isValidBarcode('8076800195058')).toBe(false);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
    expect(isValidBarcode('12345')).toBe(false);
    expect(cleanBarcode(' 8 076800-195057 ')).toBe('8076800195057');
    expect(barcodeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
  });
  it('turns an Open Food Facts product into a food per 100 g', () => {
    const f = foodFromOff('8076800195057', product)!;
    expect(f.name).toBe('Spaghetti n°5');
    expect(f.brand).toBe('Barilla');
    expect(f.barcode).toBe('8076800195057');
    expect(f.origin).toBe('openfoodfacts');
    expect(f.source).toBe('custom');
    expect([f.kcal, f.protein, f.carbs, f.fat, f.sugars, f.fiber, f.saturatedFat]).toEqual([359, 13, 71, 2, 3.5, 3, 0.5]);
    expect(f.sodium).toBe(5); // 0.013 g salt / 2.5 = 5 mg sodium
    expect(f.portionG).toBe(85);
  });
  it('works out calories from kJ or from the macros when kcal are missing', () => {
    expect(foodFromOff('1', { nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 1 } })!.kcal).toBe(100);
    expect(foodFromOff('1', { nutriments: { proteins_100g: 10, carbohydrates_100g: 10, fat_100g: 10 } })!.kcal).toBe(170);
    expect(foodFromOff('1', { product_name: 'Water', nutriments: {} })).toBeNull();
  });
  it('reports found, not found, missing values and no connection', async () => {
    expect((await lookupOpenFoodFacts('8076800195057', response(200, { status: 1, product })))).toMatchObject({ status: 'found', food: { kcal: 359 } });
    expect(await lookupOpenFoodFacts('8076800195057', response(404, { status: 0 }))).toEqual({ status: 'not_found' });
    expect(await lookupOpenFoodFacts('8076800195057', response(200, { status: 0 }))).toEqual({ status: 'not_found' });
    expect(await lookupOpenFoodFacts('8076800195057', response(200, { status: 1, product: { product_name: 'x' } }))).toEqual({ status: 'no_values' });
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await lookupOpenFoodFacts('8076800195057', failing)).toEqual({ status: 'offline' });
  });
});
