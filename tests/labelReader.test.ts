import { describe, expect, it } from 'vitest';
import { normalizeLabelText, parseLabel } from '../src/lib/labelReader';

describe('reading a nutrition label', () => {
  it('reads an Italian table, first column = per 100 g', () => {
    const text = `Dichiarazione nutrizionale
Valori medi per 100 g per porzione (85 g)
Energia 1521 kJ 1290 kJ
359 kcal 305 kcal
Grassi 2,0 g 1,7 g
di cui acidi grassi saturi 0,5 g 0,4 g
Carboidrati 71 g 60 g
di cui zuccheri 3,5 g 3,0 g
Fibre 3,0 g 2,6 g
Proteine 13 g 11 g
Sale 0,013 g 0,011 g`;
    expect(parseLabel(text)).toEqual({ kcal: 359, fat: 2, saturatedFat: 0.5, carbs: 71, sugars: 3.5, fiber: 3, protein: 13, sodium: 5 });
  });
  it('reads English and bilingual rows, and kJ alone', () => {
    const text = `Nutrition / Valori nutrizionali per 100g
Energy / Energia 1046 kJ
Fat / Grassi 9.5g
of which saturates / di cui saturi 1.2g
Carbohydrate / Carboidrati 30g
of which sugars 12g
Protein 6g
Salt 1.1g`;
    expect(parseLabel(text)).toEqual({ kcal: 250, fat: 9.5, saturatedFat: 1.2, carbs: 30, sugars: 12, protein: 6, sodium: 440 });
  });
  it('ignores unsaturated fats and takes values below a limit sign', () => {
    const text = `Grassi 12 g
di cui monoinsaturi 8 g
di cui polinsaturi 2 g
Zuccheri <0,5 g
Sodio 120 mg`;
    expect(parseLabel(text)).toEqual({ fat: 12, sugars: 0.5, sodium: 120 });
  });
  it('fixes common reading mistakes inside numbers', () => {
    expect(normalizeLabelText('Grassi 1O g')).toBe('grassi 10 g');
    expect(normalizeLabelText('Proteine 3,5 9')).toBe('proteine 3.5 g');
    expect(normalizeLabelText('Proteine 19 g')).toBe('proteine 19 g');
    expect(parseLabel('Proteine 3,5 9\nGrassi 1O g')).toEqual({ protein: 3.5, fat: 10 });
  });
  it('drops a unit g read as a 9 and stuck to the number', () => {
    const text = 'Grassi 9,5 g\ndi cui acidi grassi saturi 1,29\nCarboidrati 30 g\ndi cui zuccheri 129\nFibre 2,49\nProteine 6,0 g\nSale 1,19';
    expect(parseLabel(text)).toEqual({ fat: 9.5, saturatedFat: 1.2, carbs: 30, sugars: 12, fiber: 2.4, protein: 6, sodium: 440 });
    expect(parseLabel('Proteine 19 g')).toEqual({ protein: 19 });
  });
  it('returns nothing for text without a nutrition table', () => {
    expect(parseLabel('Ingredienti: semola di grano duro, acqua.')).toEqual({});
  });
});
