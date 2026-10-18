import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import foodTable from '../src/data/foods.json';
import { WorkoutDB } from '../src/db/db';
import type { DietPlan, Food, FoodEntry, PlanItem } from '../src/db/types';
import { createBackup, readBackup, restoreBackup } from '../src/lib/backup';
import {
  activePlan,
  diaryMeals,
  duplicatePlan,
  entriesNutrients,
  foodsFromTable,
  formatAmount,
  gramsFromPercent,
  itemGrams,
  itemsNutrients,
  limitCounts,
  macroPercents,
  menuFor,
  menuWeek,
  newPlan,
  newVisit,
  planEntry,
  searchFoods,
  targetKcal,
  waterMl,
  weekDates,
  type FoodTable,
} from '../src/lib/nutrition';
import { emptyPayload, mergePayloads } from '../src/lib/sync/merge';

const pasta: Food = { id: 'f1', name: 'Pasta di semola, cruda', category: 'Cereali', source: 'crea', kcal: 350, protein: 12, carbs: 70, fat: 1.5 };
const oil: Food = { id: 'f2', name: "Olio extravergine d'oliva", category: 'Grassi', source: 'crea', kcal: 899, protein: 0, carbs: 0, fat: 99.9 };
const foods = new Map([pasta, oil].map((f) => [f.id, f]));
const item = (patch: Partial<PlanItem>): PlanItem => ({ id: Math.random().toString(36), name: 'x', unit: 'g', ...patch });

describe('reference food table', () => {
  const ref = foodsFromTable(foodTable as unknown as FoodTable);
  it('ships the CREA foods with energy and macros', () => {
    expect(ref.length).toBeGreaterThan(200);
    for (const f of ref) {
      expect(f.id).toMatch(/^crea:\d{6}$/);
      expect(f.name).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(Number.isFinite(f.kcal)).toBe(true);
    }
    // Energy roughly matches the macros (CREA energy also counts fibre and alcohol).
    const farro = ref.find((f) => f.id === 'crea:000020')!;
    expect(farro.name).toBe('Farro perlato, crudo');
    expect(farro.kcal).toBe(353);
  });
  it('finds foods by every word, ignoring accents and case', () => {
    expect(searchFoods([pasta, oil], 'OLIO').map((f) => f.id)).toEqual(['f2']);
    expect(searchFoods([pasta, oil], 'semola pasta').map((f) => f.id)).toEqual(['f1']);
    expect(searchFoods([pasta, oil], 'riso')).toEqual([]);
    expect(searchFoods(ref, 'farro')[0].name.toLowerCase().startsWith('farro')).toBe(true);
  });
});

describe('quantities and nutrients', () => {
  it('turns amounts into grams: ranges use the middle, spoons have defaults', () => {
    expect(itemGrams(item({ amount: 80 }))).toBe(80);
    expect(itemGrams(item({ amount: 60, amountMax: 80 }))).toBe(70);
    expect(itemGrams(item({ amount: 1, unit: 'tbsp' }))).toBe(10);
    expect(itemGrams(item({ amount: 3, unit: 'tsp' }))).toBe(15);
    expect(itemGrams(item({ amount: 2, unit: 'piece' }))).toBeUndefined();
    expect(itemGrams(item({ amount: 2, unit: 'piece', gramsPerUnit: 60 }))).toBe(120);
    expect(itemGrams(item({ unit: 'to_taste' }))).toBeUndefined();
    expect(formatAmount({ amount: 60, amountMax: 80, unit: 'g' })).toBe('60–80 g');
    expect(formatAmount({ amount: 1, unit: 'piece' })).toBe('1 piece');
  });
  it('adds up linked items and flags the ones it cannot count', () => {
    const t = itemsNutrients([item({ foodId: 'f1', amount: 80 }), item({ foodId: 'f2', amount: 1, unit: 'tbsp' }), item({ name: 'Vegetables', amount: 150 }), item({ unit: 'to_taste' })], foods);
    expect(Math.round(t.n.kcal)).toBe(280 + 90);
    expect(t.n.protein).toBeCloseTo(9.6);
    expect(t.partial).toBe(true);
  });
  it('totals a day of plan choices and foods, ignoring water and counts', () => {
    const day = '2026-10-19';
    const entries: FoodEntry[] = [
      planEntry(day, 'Lunch', 'First course', { name: 'Pasta', items: [item({ foodId: 'f1', amount: 80 })] }),
      { id: 'a', date: day, kind: 'food', meal: 'Dinner', name: 'Olio', foodId: 'f2', grams: 10, createdAt: 1, updatedAt: 1 },
      { id: 'w', date: day, kind: 'water', name: 'Water', ml: 250, createdAt: 2, updatedAt: 2 },
      { id: 'c', date: day, kind: 'count', name: 'Dessert', limitId: 'L', createdAt: 3, updatedAt: 3 },
    ];
    const t = entriesNutrients(entries, foods);
    expect(Math.round(t.n.kcal)).toBe(370);
    expect(t.partial).toBe(false);
    expect(waterMl(entries)).toBe(250);
  });
  it('works out calories and shares of the targets', () => {
    expect(targetKcal({ kcal: 1600 })).toBe(1600);
    expect(targetKcal({ proteinG: 100, carbsG: 200, fatG: 50 })).toBe(1650);
    expect(macroPercents({ kcal: 1600, proteinG: 88, carbsG: 180, fatG: 52 })).toEqual({ protein: 22, carbs: 45, fat: 29 });
    expect(gramsFromPercent(1600, 22, 4)).toBe(88);
  });
});

describe('diet plans', () => {
  const p1: DietPlan = { ...newPlan('2026-09-01'), id: 'p1' };
  const p2: DietPlan = { ...newPlan('2026-10-15'), id: 'p2' };
  it('uses the plan whose start date is the latest one not after the day', () => {
    expect(activePlan([p1, p2], '2026-08-31')).toBeUndefined();
    expect(activePlan([p1, p2], '2026-10-14')?.id).toBe('p1');
    expect(activePlan([p2, p1], '2026-10-15')?.id).toBe('p2');
  });
  it('keeps the inner ids when duplicating, so limits and menu carry over', () => {
    const src: DietPlan = { ...p1, limits: [{ id: 'L1', name: 'Red meat', max: 2 }] };
    const copy = duplicatePlan(src, '2026-11-01');
    expect(copy.id).not.toBe(src.id);
    expect(copy.startDate).toBe('2026-11-01');
    expect(copy.limits[0].id).toBe('L1');
    expect(copy.meals[0].id).toBe(src.meals[0].id);
    copy.meals[0].name = 'changed';
    expect(src.meals[0].name).not.toBe('changed');
  });
  it('rotates the menu weeks from the week the plan starts', () => {
    const plan: DietPlan = { ...p1, startDate: '2026-10-14', menuWeeks: 2, menu: [{ week: 1, day: 0, mealId: p1.meals[2].id, text: 'Week two Monday' }] };
    expect(menuWeek(plan, '2026-10-12')).toBe(0); // Monday of the start week
    expect(menuWeek(plan, '2026-10-19')).toBe(1);
    expect(menuWeek(plan, '2026-10-26')).toBe(0);
    expect(menuFor(plan, '2026-10-19', p1.meals[2].id)).toBe('Week two Monday');
    expect(menuFor(plan, '2026-10-20', p1.meals[2].id)).toBeUndefined();
  });
  it('counts weekly limits from plan choices and manual counts', () => {
    const week = weekDates('2026-10-22');
    expect(week[0]).toBe('2026-10-19');
    expect(week[6]).toBe('2026-10-25');
    const e1 = planEntry('2026-10-19', 'Lunch', '', { name: 'Red meat', items: [], limitIds: ['L1', 'L2'] });
    const e2: FoodEntry = { id: 'c', date: '2026-10-20', kind: 'count', name: 'Red meat', limitId: 'L1', createdAt: 1, updatedAt: 1 };
    const counts = limitCounts([e1, e2]);
    expect(counts.get('L1')).toBe(2);
    expect(counts.get('L2')).toBe(1);
  });
  it('lists the plan meals, then other meals already logged', () => {
    const extra = planEntry('2026-10-19', 'Pre-workout', '', { name: 'x', items: [] });
    expect(diaryMeals(p1, [extra]).map((m) => m.name)).toEqual(['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner', 'Pre-workout']);
    expect(diaryMeals(undefined, []).length).toBe(5);
  });
  it('copies the option items into the diary, so later plan edits do not change the past', () => {
    const option = { name: 'Toast', items: [item({ name: 'Bread', amount: 50 })] };
    const e = planEntry('2026-10-19', 'Breakfast', '', option);
    option.items[0].amount = 999;
    expect(e.items![0].amount).toBe(50);
  });
});

describe('visits', () => {
  it('starts a new visit with the measures and height of the last one', () => {
    const first = newVisit(undefined, '2026-09-01');
    expect(first.measures.length).toBeGreaterThan(3);
    const last = { ...first, heightCm: 170, measures: [{ id: 'm', name: 'Waist', unit: 'cm', value: 80 }] };
    const next = newVisit(last, '2026-10-01');
    expect(next.heightCm).toBe(170);
    expect(next.measures).toHaveLength(1);
    expect(next.measures[0].name).toBe('Waist');
    expect(next.measures[0].value).toBeUndefined();
  });
});

describe('sync and backup of nutrition data', () => {
  it('merges nutrition records from both devices, and accepts copies from older versions', () => {
    const local = { ...emptyPayload(), visits: [{ ...newVisit(undefined, '2026-10-01'), id: 'v1', updatedAt: 1 }] };
    const remote = { ...emptyPayload(), dietPlans: [{ ...newPlan('2026-10-01'), id: 'p', updatedAt: 1 }] };
    const merged = mergePayloads(local, remote);
    expect(merged.visits.map((v) => v.id)).toEqual(['v1']);
    expect(merged.dietPlans.map((p) => p.id)).toEqual(['p']);
    const old = { ...emptyPayload() } as Partial<typeof local>;
    delete old.foodEntries;
    expect(mergePayloads(local, old as typeof local).foodEntries).toEqual([]);
  });
  it('backs up and restores plans, visits, own foods and the diary', async () => {
    const a = new WorkoutDB(`nut-a-${Math.random()}`);
    await a.dietPlans.put({ ...newPlan('2026-10-01'), id: 'p' });
    await a.visits.put({ ...newVisit(undefined, '2026-10-01'), id: 'v', weightKg: 70 });
    await a.foods.put({ ...pasta, id: 'own', source: 'custom' });
    await a.foodEntries.put(planEntry('2026-10-02', 'Lunch', '', { name: 'Pasta', items: [] }));
    const file = readBackup(JSON.stringify(await createBackup(a)));
    const b = new WorkoutDB(`nut-b-${Math.random()}`);
    await restoreBackup(b, file, 'replace');
    expect(await b.dietPlans.count()).toBe(1);
    expect((await b.visits.get('v'))?.weightKg).toBe(70);
    expect(await b.foods.count()).toBe(1);
    expect(await b.foodEntries.count()).toBe(1);
  });
});
