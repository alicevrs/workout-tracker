// Nutrition values from the text read on a label photo (on the phone, see readLabelPhoto).
// Pure functions, so they can be tested with sample texts. The first number of a nutrient's row is
// taken: on European labels that is the "per 100 g" column.

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
}

type Key = 'fat' | 'saturatedFat' | 'carbs' | 'sugars' | 'fiber' | 'protein' | 'salt' | 'sodium';

/** Row names in Italian, English, French, German and Spanish; the more specific ones come first. */
const ROWS: [Key, RegExp][] = [
  ['saturatedFat', /saturi|saturat|satur[ée]s|ges[äa]tt|saturad/],
  ['sugars', /zuccher|sugar|sucres|zucker|az[uú]car/],
  ['fiber', /fibr|fiber|ballast/],
  ['salt', /\bsale\b|\bsalt\b|\bsel\b|\bsalz\b|\bsal\b/],
  ['sodium', /sodio|sodium|natrium/],
  ['protein', /protei|prot[ée]ines|eiwei/],
  ['carbs', /carboidrat|carbohydrat|glucides|kohlenhydrat|hidratos/],
  ['fat', /grass|\bfat\b|\bfats\b|lipidi|mati[eè]res grasses|\bfett\b|grasas/],
];
/** Rows that mention fat but are neither total nor saturated fat. */
const NOT_TOTAL_FAT = /insatur|unsaturat|mono|poli|poly|trans/;

/** Lower case, decimal commas as dots, and letters that OCR confuses with digits inside numbers. */
export function normalizeLabelText(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d)\s*[,·]\s*(\d)/g, '$1.$2')
    .replace(/(?<=\d)[o](?=\d|\s*g\b)/g, '0')
    .replace(/(?<=[\s<(])[o](?=[.,]\d)/g, '0')
    .replace(/(\d)\s+9(?=\s|$)/gm, '$1 g'); // "3.5 9" is often "3.5 g"
}

const NUMBER = /(?:<\s*)?(\d+(?:\.\d+)?)(\s*m?g\b)?/;

/**
 * The first number after the row name. OCR often reads the unit "g" stuck to the number as a 9
 * ("1,2 g" → "1,29", "12 g" → "129"): a number without its unit that ends in 9 loses that 9.
 */
function firstNumber(line: string, from: number): number | undefined {
  const m = line.slice(from).match(NUMBER);
  if (!m) return undefined;
  let digits = m[1];
  if (!m[2] && digits.length > 1 && digits.endsWith('9')) digits = digits.slice(0, -1).replace(/\.$/, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

export function parseLabel(text: string): LabelValues {
  const t = normalizeLabelText(text);
  const out: LabelValues = {};

  // Energy: kcal anywhere (often on its own line under kJ), else kJ converted.
  const kcal = t.match(/(\d+(?:\.\d+)?)\s*k\s*ca[l1]/);
  if (kcal) out.kcal = Math.round(Number(kcal[1]));
  else {
    const kj = t.match(/(\d+(?:\.\d+)?)\s*k\s*j/);
    if (kj) out.kcal = Math.round(Number(kj[1]) / 4.184);
  }

  let salt: number | undefined;
  for (const raw of t.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const [key, re] of ROWS) {
      const m = line.match(re);
      if (!m) continue;
      if ((key === 'fat' || key === 'saturatedFat') && NOT_TOTAL_FAT.test(line)) break;
      const v = firstNumber(line, (m.index ?? 0) + m[0].length);
      if (v === undefined) break;
      if (key === 'salt') salt ??= v;
      else if (key === 'sodium') out.sodium ??= Math.round(line.includes('mg') ? v : v * 1000);
      else if (out[key] === undefined && v <= 100) out[key] = v;
      break; // one nutrient per row
    }
  }
  if (out.sodium === undefined && salt !== undefined && salt <= 100) out.sodium = Math.round((salt / 2.5) * 1000);
  return out;
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
};
