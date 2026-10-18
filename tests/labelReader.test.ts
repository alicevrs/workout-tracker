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

describe('real labels', () => {
  it('reads a six-language label with the unit before the number (Barilla sauce)', () => {
    // Text as read from the user's photo (inverted, white on blue), with OCR mistakes.
    const text = `. Nutrition dedaration - Dédlaration nutritionnelle- gg»,
| Nahrwertdeklaration - Dichiarazione nutrizionale - fano
" tesgy - Energie - Energie - Energia - kJ 227
Valor energético - Energi kcal 54
aesganes-tet:Gassi- Casas. felt 9 22 Simon
ci uhich saturates - dont acides gras saturés - HE Wim
davon gesattigte Fettsauren - di cui acidi grassi saturi - ana
delas auales saturadas - varav mattat fett 9 03 lidia
Carbohydrate - Glucides - Kohlenhydrate -
Carboidrati - Hidratos de carbono - Kolhydrat g 6,2
duhichsugars- dont sucres - davon Zucker - di cui aucthei- og nur
dels cuales azicares - varav sockerarter g 50 pipi!
Are - Fra alimentaria - Fiber g 18 OSS
Motta -Protéines - Ewei - Proteine - Proteinas -Protei g 1,5 pu, -
Salt - Sel - Salz - Sale - Sal - Salt g 0,75`;
    // The fat row came out too garbled to recognise; everything else is read.
    expect(parseLabel(text)).toEqual({ kcal: 54, saturatedFat: 0.3, carbs: 6.2, sugars: 5, fiber: 1.8, protein: 1.5, sodium: 300 });
    expect(parseLabel(text.replace('felt 9 22', 'Fett 9 22'))).toMatchObject({ fat: 2.2 });
  });
  it('takes the number from the next line when the row name wraps', () => {
    expect(parseLabel('of which sugars - dont sucres -\ng 5,0')).toEqual({ sugars: 5 });
    expect(parseLabel('Fibre - Fibres alimentaires -\nine. ba alimenta 0u')).toEqual({});
  });
  it('keeps plausible values as they are', () => {
    expect(parseLabel('Energia 450 kcal\nGrassi 22 g\nCarboidrati 50 g\nProteine 10 g')).toEqual({ kcal: 450, fat: 22, carbs: 50, protein: 10 });
  });
});
