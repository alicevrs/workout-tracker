// Nutrition: food archive, diet plans, visits and the food diary. Pure functions (easy to test);
// the pages read and write the database themselves.
//
// The reference food table (CREA, src/data/foods.json) ships with the app and is loaded on demand;
// only the user's own foods are stored. Nutrient totals are computed when shown, never stored.

import type { DailyTargets, DietPlan, Food, FoodEntry, Nutrients, PlanItem, PlanMeal, PortionUnit, Visit, VisitMeasure } from '../db/types';
import { addDays, fromDateKey, startOfWeek, toDateKey } from './dates';
import { uid } from './ids';

// ---------- reference table ----------

/** Compact rows of src/data/foods.json: [code, name, category index, kcal, protein, carbs, fat, sugars, fiber, alcohol, sodium mg, portion g, edible %]. */
export type FoodRow = [string, string, number, number, number, number, number, number | null, number | null, number | null, number | null, number | null, number | null];
export interface FoodTable {
  source: string;
  categories: string[];
  rows: FoodRow[];
}

export const CREA_SOURCE = 'CREA Centro di ricerca Alimenti e Nutrizione, Tabelle di composizione degli alimenti (2019), www.alimentinutrizione.it';

export function foodsFromTable(t: FoodTable): Food[] {
  const opt = (v: number | null) => (v === null ? undefined : v);
  return t.rows.map(([code, name, cat, kcal, protein, carbs, fat, sugars, fiber, alcohol, sodium, portionG, ediblePct]) => ({
    id: `crea:${code}`,
    name,
    category: t.categories[cat] ?? '',
    source: 'crea',
    kcal,
    protein,
    carbs,
    fat,
    sugars: opt(sugars),
    fiber: opt(fiber),
    alcohol: opt(alcohol),
    sodium: opt(sodium),
    portionG: opt(portionG),
    ediblePct: opt(ediblePct),
  }));
}

let tablePromise: Promise<Food[]> | null = null;
/** The reference foods (loaded once, in a separate file so startup stays fast). */
export function loadReferenceFoods(): Promise<Food[]> {
  tablePromise ??= import('../data/foods.json').then((m) => foodsFromTable(m.default as unknown as FoodTable));
  return tablePromise;
}

// ---------- search ----------

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Foods whose name contains every typed word; names starting with the first word come first. */
export function searchFoods(foods: Food[], query: string, category = ''): Food[] {
  const words = normalizeText(query).split(' ').filter(Boolean);
  const list = foods.filter((f) => !category || f.category === category);
  if (!words.length) return [...list].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const scored: { f: Food; s: number }[] = [];
  for (const f of list) {
    const n = normalizeText(f.name);
    if (!words.every((w) => n.includes(w))) continue;
    const s = (n.startsWith(words[0]) ? 0 : n.split(' ').some((x) => x.startsWith(words[0])) ? 1 : 2) + (f.source === 'custom' ? -0.5 : 0);
    scored.push({ f, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.f.name.length - b.f.name.length || a.f.name.localeCompare(b.f.name, 'it')).map((x) => x.f);
}

// ---------- nutrients ----------

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Nutrients of a quantity of a food (the table values are per 100 g). */
export function nutrientsFor(food: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  return { kcal: food.kcal * k, protein: food.protein * k, carbs: food.carbs * k, fat: food.fat * k };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

/** Grams of a spoon when the plan does not say (1 tablespoon of oil = 10 g, as in the diet documents). */
export const DEFAULT_UNIT_GRAMS: Partial<Record<PortionUnit, number>> = { tbsp: 10, tsp: 5 };

export const UNIT_LABEL: Record<PortionUnit, string> = { g: 'g', ml: 'ml', piece: 'piece', tbsp: 'tbsp', tsp: 'tsp', to_taste: 'to taste' };

/** Grams of a plan item (the middle of a range), or undefined when they cannot be known. */
export function itemGrams(item: PlanItem): number | undefined {
  if (item.unit === 'to_taste' || item.amount === undefined) return undefined;
  const amount = item.amountMax !== undefined && item.amountMax > item.amount ? (item.amount + item.amountMax) / 2 : item.amount;
  if (item.unit === 'g' || item.unit === 'ml') return amount;
  const per = item.gramsPerUnit ?? DEFAULT_UNIT_GRAMS[item.unit];
  return per === undefined ? undefined : amount * per;
}

export function formatAmount(item: Pick<PlanItem, 'amount' | 'amountMax' | 'unit'>): string {
  if (item.unit === 'to_taste') return 'to taste';
  if (item.amount === undefined) return '';
  const n = item.amountMax !== undefined && item.amountMax > item.amount ? `${item.amount}–${item.amountMax}` : String(item.amount);
  if (item.unit === 'piece') return `${n} ${item.amount === 1 && item.amountMax === undefined ? 'piece' : 'pieces'}`;
  return `${n} ${UNIT_LABEL[item.unit]}`;
}

export interface Totals {
  n: Nutrients;
  /** Some items could not be counted (no linked food or unknown grams). */
  partial: boolean;
}

export function itemsNutrients(items: PlanItem[], foods: Map<string, Food>): Totals {
  let n = ZERO;
  let partial = false;
  for (const it of items) {
    if (it.unit === 'to_taste') continue;
    const food = it.foodId ? foods.get(it.foodId) : undefined;
    const g = itemGrams(it);
    if (!food || g === undefined) {
      partial = true;
      continue;
    }
    n = addNutrients(n, nutrientsFor(food, g));
  }
  return { n, partial };
}

export function entryNutrients(e: FoodEntry, foods: Map<string, Food>): Totals {
  if (e.kind === 'plan') return itemsNutrients(e.items ?? [], foods);
  if (e.kind === 'food') {
    const food = e.foodId ? foods.get(e.foodId) : undefined;
    if (!food || !e.grams) return { n: ZERO, partial: true };
    return { n: nutrientsFor(food, e.grams), partial: false };
  }
  return { n: ZERO, partial: false };
}

export function entriesNutrients(entries: FoodEntry[], foods: Map<string, Food>): Totals {
  return entries.reduce<Totals>(
    (acc, e) => {
      if (e.kind !== 'plan' && e.kind !== 'food') return acc;
      const t = entryNutrients(e, foods);
      return { n: addNutrients(acc.n, t.n), partial: acc.partial || t.partial };
    },
    { n: ZERO, partial: false },
  );
}

/** Calories of the macronutrients (4 / 4 / 9 kcal per gram). */
export const macroKcal = (g: { protein?: number; carbs?: number; fat?: number }) => (g.protein ?? 0) * 4 + (g.carbs ?? 0) * 4 + (g.fat ?? 0) * 9;

/** Daily calories: the target, or the calories of the macro targets when only those are set. */
export function targetKcal(t: DailyTargets): number | undefined {
  if (t.kcal) return t.kcal;
  const k = macroKcal({ protein: t.proteinG, carbs: t.carbsG, fat: t.fatG });
  return k > 0 ? k : undefined;
}

/** Share of the calories of each macro target, % (rounded). */
export function macroPercents(t: DailyTargets): { protein?: number; carbs?: number; fat?: number } {
  const kcal = targetKcal(t);
  if (!kcal) return {};
  const pct = (g: number | undefined, f: number) => (g ? Math.round(((g * f) / kcal) * 100) : undefined);
  return { protein: pct(t.proteinG, 4), carbs: pct(t.carbsG, 4), fat: pct(t.fatG, 9) };
}

/** Grams of a macro from its share of the calories. */
export const gramsFromPercent = (kcal: number, pct: number, kcalPerGram: number) => Math.round((kcal * pct) / 100 / kcalPerGram);

// ---------- plans ----------

export const DEFAULT_MEALS = ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner'];

export function newMeal(name: string): PlanMeal {
  return { id: uid(), name, sections: [{ id: uid(), name: '', options: [] }] };
}

export function newPlan(today = toDateKey(Date.now())): DietPlan {
  return { id: uid(), name: 'Diet plan', startDate: today, targets: {}, meals: DEFAULT_MEALS.map(newMeal), limits: [], menuWeeks: 1, menu: [], notes: [], updatedAt: Date.now() };
}

/**
 * Copy of a plan for the next visit. Inner ids are kept on purpose: the weekly limits keep counting
 * and the menu stays attached to its meals.
 */
export function duplicatePlan(p: DietPlan, today = toDateKey(Date.now())): DietPlan {
  return { ...structuredClone(p), id: uid(), name: `${p.name} (copy)`, startDate: today, updatedAt: Date.now() };
}

/** The plan in force on a date: the one with the latest start date not after it. */
export function activePlan(plans: DietPlan[], date: string): DietPlan | undefined {
  return plans
    .filter((p) => p.startDate <= date)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.updatedAt - a.updatedAt))[0];
}

/** Monday-based weekday of a date key, 0 = Monday. */
export const weekday = (date: string) => (fromDateKey(date).getDay() + 6) % 7;

/** Which week of the menu a date falls in (weeks rotate from the week the plan starts). */
export function menuWeek(plan: Pick<DietPlan, 'startDate' | 'menuWeeks'>, date: string): number {
  const weeks = Math.max(1, plan.menuWeeks);
  const diff = Math.round((startOfWeek(fromDateKey(date).getTime()) - startOfWeek(fromDateKey(plan.startDate).getTime())) / (7 * 86_400_000));
  return ((diff % weeks) + weeks) % weeks;
}

export function menuFor(plan: DietPlan, date: string, mealId: string): string | undefined {
  const w = menuWeek(plan, date);
  const d = weekday(date);
  return plan.menu.find((c) => c.week === w && c.day === d && c.mealId === mealId)?.text || undefined;
}

/** Dates (YYYY-MM-DD) of the Monday–Sunday week of a date. */
export function weekDates(date: string): string[] {
  const start = startOfWeek(fromDateKey(date).getTime());
  return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(start, i)));
}

/** How many times each weekly limit was used in these entries (plan choices and manual counts). */
export function limitCounts(entries: FoodEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const e of entries) {
    if (e.kind === 'plan') (e.limitIds ?? []).forEach(add);
    if (e.kind === 'count' && e.limitId) add(e.limitId);
  }
  return m;
}

export const waterMl = (entries: FoodEntry[]) => entries.reduce((s, e) => s + (e.kind === 'water' ? (e.ml ?? 0) : 0), 0);

/** Meals of the diary for a day: the plan's, then any other meal names already logged. */
export function diaryMeals(plan: DietPlan | undefined, entries: FoodEntry[]): { name: string; meal?: PlanMeal }[] {
  const out: { name: string; meal?: PlanMeal }[] = plan ? plan.meals.map((m) => ({ name: m.name, meal: m })) : DEFAULT_MEALS.map((name) => ({ name }));
  for (const e of entries) if (e.meal && !out.some((m) => m.name === e.meal)) out.push({ name: e.meal });
  return out;
}

/** Diary entry for a plan option, with the option's items copied. */
export function planEntry(date: string, meal: string, section: string, option: { name: string; items: PlanItem[]; limitIds?: string[] }, now = Date.now()): FoodEntry {
  return {
    id: uid(),
    date,
    kind: 'plan',
    meal,
    section: section || undefined,
    name: option.name,
    items: structuredClone(option.items),
    limitIds: option.limitIds?.length ? [...option.limitIds] : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- visits ----------

export const DEFAULT_MEASURES: Omit<VisitMeasure, 'id'>[] = [
  { name: 'Body fat', unit: '%' },
  { name: 'Waist', unit: 'cm' },
  { name: 'Hips', unit: 'cm' },
  { name: 'Arm', unit: 'cm' },
  { name: 'Thigh', unit: 'cm' },
  { name: 'Triceps fold', unit: 'mm' },
  { name: 'Subscapular fold', unit: 'mm' },
  { name: 'Suprailiac fold', unit: 'mm' },
  { name: 'Abdominal fold', unit: 'mm' },
  { name: 'Thigh fold', unit: 'mm' },
];

/** A new visit takes the measures (without values) and the height of the last one. */
export function newVisit(previous: Visit | undefined, today = toDateKey(Date.now())): Visit {
  const measures = previous?.measures.length ? previous.measures.map((m) => ({ id: uid(), name: m.name, unit: m.unit })) : DEFAULT_MEASURES.map((m) => ({ ...m, id: uid() }));
  return { id: uid(), date: today, heightCm: previous?.heightCm, measures, updatedAt: Date.now() };
}

export function bmi(weightKg: number | undefined, heightCm: number | undefined): number | undefined {
  if (!weightKg || !heightCm) return undefined;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
