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
  ['saturatedFat', /saturi|saturat|satur[ée]s|ges[äa]tt|saturad|m[äa]ttat/],
  ['sugars', /zuccher|sugar|sucres|zucker|az[uú]car|socker/],
  ['fiber', /fibr|fiber|ballast/],
  ['salt', /\bsale\b|\bsalt\b|\bsel\b|\bsalz\b|\bsal\b/],
  ['sodium', /sodio|sodium|natrium/],
  ['protein', /protei|prot[ée]ines|eiwei/],
  ['carbs', /carboidrat|carbohydrat|glucides|kohlenhydrat|hidratos|kolhydrat/],
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
    .replace(/(\d)\s+9(?=\s|$)/gm, '$1 g') // "3.5 9" is often "3.5 g"
    .replace(/(^|[^\d.])9\s+(?=\d)(?!\d+(?:\.\d+)?\s*g\b)/gm, '$1g '); // "fett 9 2.2": the unit written before the number
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
  if (!m[2] && digits.length > 1 && digits.endsWith('9') && !/\bg\s*$/.test(line.slice(0, from + (m.index ?? 0)))) digits = digits.slice(0, -1).replace(/\.$/, '');
  // A lost decimal comma: "03" can only be 0.3.
  if (/^0\d$/.test(digits)) digits = `0.${digits[1]}`;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * OCR sometimes loses the decimal comma ("2,2" → "22"). Values that cannot be right are divided by
 * 10: macros giving far more calories than the label states, and parts larger than their total.
 */
export function reconcile(v: LabelValues): LabelValues {
  const out = { ...v };
  const tenth = (n: number | undefined) => n !== undefined && n >= 10 && Number.isInteger(n);
  if (out.kcal) {
    const limit = out.kcal * 1.2 + 5;
    for (const [key, f] of [['fat', 9], ['carbs', 4], ['protein', 4]] as const) {
      if (tenth(out[key]) && out[key]! * f > limit) out[key] = out[key]! / 10;
    }
  }
  const rest = (out.carbs ?? 0) + (out.protein ?? 0) + (out.fat ?? 0);
  if (tenth(out.fiber) && rest > 0 && out.fiber! > rest) out.fiber = out.fiber! / 10;
  if (out.fat !== undefined && tenth(out.saturatedFat) && out.saturatedFat! > out.fat) out.saturatedFat = out.saturatedFat! / 10;
  if (out.carbs !== undefined && tenth(out.sugars) && out.sugars! > out.carbs) out.sugars = out.sugars! / 10;
  return out;
}

export function parseLabel(text: string): LabelValues {
  const t = normalizeLabelText(text);
  const out: LabelValues = {};

  // Energy: kcal anywhere (often on its own line under kJ, unit before or after), else kJ converted.
  const kcal = t.match(/(\d+(?:\.\d+)?)\s*k\s*ca[l1]/) ?? t.match(/k\s*ca[l1]\s*(\d+(?:\.\d+)?)/);
  if (kcal) out.kcal = Math.round(Number(kcal[1]));
  else {
    const kj = t.match(/(\d+(?:\.\d+)?)\s*k\s*j/) ?? t.match(/k\s*j\s*(\d+(?:\.\d+)?)/);
    if (kj) out.kcal = Math.round(Number(kj[1]) / 4.184);
  }

  let salt: number | undefined;
  /** A row name whose number is on a following line (names in several languages wrap). */
  let pending: Key | undefined;
  const store = (key: Key, v: number, line: string) => {
    if (key === 'salt') salt ??= v;
    else if (key === 'sodium') out.sodium ??= Math.round(line.includes('mg') ? v : v * 1000);
    else if (out[key] === undefined && v <= 100) out[key] = v;
  };
  for (const raw of t.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    let matched = false;
    for (const [key, re] of ROWS) {
      const m = line.match(re);
      if (!m) continue;
      matched = true;
      if ((key === 'fat' || key === 'saturatedFat') && NOT_TOTAL_FAT.test(line)) {
        pending = undefined;
        break;
      }
      const v = firstNumber(line, (m.index ?? 0) + m[0].length);
      if (v === undefined) pending = key;
      else {
        store(key, v, line);
        pending = undefined;
      }
      break; // one nutrient per row
    }
    // Only a number with its unit counts here, so stray marks are not taken for values.
    const unit = line.match(/\bg\s*(?=\d)|(?<=\d)\s*g\b/);
    if (!matched && pending && unit && !/k\s*(j|ca[l1])/.test(line)) {
      const v = firstNumber(line, Math.max(0, (unit.index ?? 0) - 6));
      if (v !== undefined) store(pending, v, line);
      pending = undefined;
    }
  }
  if (out.sodium === undefined && salt !== undefined && salt <= 100) out.sodium = Math.round((salt / 2.5) * 1000);
  return reconcile(out);
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
