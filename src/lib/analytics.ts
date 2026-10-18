// Aggregations for the analytics screen. Pure functions over sessions.

import type { Session } from '../db/types';
import { addDays, addMonths, DAY_MS, formatBucket, nextStart, startOf, startOfDay, startOfMonth, startOfWeek, toDateKey, type Grain } from './dates';
import { sessionDurationSec } from './session';
import { exerciseHistory, isDone, resultSets, sessionSets, sessionSummary, setReps, setVolume } from './stats';

export type Metric = 'volume' | 'duration' | 'distance' | 'reps' | 'sets' | 'calories' | 'sessions';

export const METRIC_LABEL: Record<Metric, string> = {
  volume: 'Volume',
  duration: 'Time',
  distance: 'Distance',
  reps: 'Reps',
  sets: 'Sets',
  calories: 'Calories',
  sessions: 'Sessions',
};

export type CalorieFn = (s: Session) => number | null;

export function metricValue(s: Session, m: Metric, calories?: CalorieFn): number {
  switch (m) {
    case 'sessions':
      return 1;
    case 'duration':
      return sessionDurationSec(s) / 60; // minutes
    case 'calories':
      return calories?.(s) ?? 0;
    case 'distance':
      return (s.distanceM ?? 0) / 1000; // km
    default: {
      const sum = sessionSummary(s);
      return m === 'volume' ? sum.volume : m === 'reps' ? sum.reps : sum.sets;
    }
  }
}

export interface Bucket {
  start: number;
  label: string;
  value: number;
}

/** Totals per day/week/month/year between from and to (inclusive), with empty buckets filled. */
export function bucketize(sessions: Session[], grain: Grain, from: number, to: number, value: (s: Session) => number): Bucket[] {
  const out: Bucket[] = [];
  for (let t = startOf(grain, from); t <= to; t = nextStart(grain, t)) out.push({ start: t, label: formatBucket(grain, t), value: 0 });
  const index = new Map(out.map((b, i) => [b.start, i]));
  for (const s of sessions) {
    if (s.startedAt < startOf(grain, from) || s.startedAt > to) continue;
    const i = index.get(startOf(grain, s.startedAt));
    if (i !== undefined) out[i].value += value(s);
  }
  return out;
}

export function cumulative(buckets: Bucket[]): Bucket[] {
  let run = 0;
  return buckets.map((b) => ({ ...b, value: (run += b.value) }));
}

export function inRange(sessions: Session[], from: number, to: number): Session[] {
  return sessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
}

export interface PeriodTotals {
  sessions: number;
  duration: number; // minutes
  distance: number; // km
  volume: number;
  reps: number;
  sets: number;
  calories: number;
  avgDuration: number; // minutes
}

export function periodTotals(sessions: Session[], calories?: CalorieFn): PeriodTotals {
  const t: PeriodTotals = { sessions: 0, duration: 0, distance: 0, volume: 0, reps: 0, sets: 0, calories: 0, avgDuration: 0 };
  for (const s of sessions) {
    const sum = sessionSummary(s);
    t.sessions += 1;
    t.duration += sum.durationSec / 60;
    t.distance += (s.distanceM ?? 0) / 1000;
    t.volume += sum.volume;
    t.reps += sum.reps;
    t.sets += sum.sets;
    t.calories += calories?.(s) ?? 0;
  }
  t.avgDuration = t.sessions ? t.duration / t.sessions : 0;
  return t;
}

/** Percent change from previous to current; null when there is no previous value. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

export type ComparePreset = 'week' | 'month' | 'year' | 'custom';

export interface Range {
  from: number;
  to: number;
  label: string;
}

/** Current period and the period before it. "Current" runs from the period start to now. */
export function comparisonRanges(preset: Exclude<ComparePreset, 'custom'>, now = Date.now()): [Range, Range] {
  const end = now;
  switch (preset) {
    case 'week': {
      const a = startOfWeek(now);
      return [
        { from: a, to: end, label: 'This week' },
        { from: addDays(a, -7), to: a - 1, label: 'Previous week' },
      ];
    }
    case 'month': {
      const a = startOfMonth(now);
      return [
        { from: a, to: end, label: 'This month' },
        { from: addMonths(a, -1), to: a - 1, label: 'Previous month' },
      ];
    }
    case 'year': {
      const a = new Date(new Date(now).getFullYear(), 0, 1).getTime();
      return [
        { from: a, to: end, label: 'This year' },
        { from: new Date(new Date(now).getFullYear() - 1, 0, 1).getTime(), to: a - 1, label: 'Previous year' },
      ];
    }
  }
}

/**
 * Running total by day offset from each period's start, so two periods can be drawn on the
 * same axis ("am I ahead of last month?").
 */
export function paceSeries(a: Session[], aFrom: number, b: Session[], bFrom: number, days: number, value: (s: Session) => number) {
  const run = (list: Session[], from: number) => {
    const perDay = new Array(days).fill(0);
    for (const s of list) {
      const d = Math.floor((startOfDay(s.startedAt) - startOfDay(from)) / DAY_MS);
      if (d >= 0 && d < days) perDay[d] += value(s);
    }
    let r = 0;
    return perDay.map((v) => (r += v));
  };
  const ca = run(a, aFrom);
  const cb = run(b, bFrom);
  return ca.map((v, i) => ({ day: i + 1, current: v, previous: cb[i] }));
}

export interface Streaks {
  /** Consecutive weeks (ending this or last week) with at least one workout. */
  currentWeeks: number;
  longestWeeks: number;
  /** Longest run of consecutive days with a workout. */
  longestDays: number;
  currentDays: number;
}

export function streaks(sessions: Session[], now = Date.now()): Streaks {
  const days = new Set(sessions.map((s) => s.date));
  const weeks = new Set(sessions.map((s) => startOfWeek(s.startedAt)));

  let longestDays = 0;
  for (const d of days) {
    const t = new Date(`${d}T12:00:00`).getTime();
    if (days.has(toDateKey(t - DAY_MS))) continue; // not a run start
    let len = 1;
    while (days.has(toDateKey(t + len * DAY_MS))) len++;
    longestDays = Math.max(longestDays, len);
  }
  let currentDays = 0;
  let t = startOfDay(now) + 12 * 3600_000;
  if (!days.has(toDateKey(t))) t -= DAY_MS; // today may not be trained yet
  while (days.has(toDateKey(t))) {
    currentDays++;
    t -= DAY_MS;
  }

  let longestWeeks = 0;
  for (const w of weeks) {
    if (weeks.has(addDays(w, -7))) continue;
    let len = 1;
    while (weeks.has(addDays(w, 7 * len))) len++;
    longestWeeks = Math.max(longestWeeks, len);
  }
  let currentWeeks = 0;
  let w = startOfWeek(now);
  if (!weeks.has(w)) w = addDays(w, -7);
  while (weeks.has(w)) {
    currentWeeks++;
    w = addDays(w, -7);
  }
  return { currentWeeks, longestWeeks, longestDays, currentDays };
}

/** Exercises with at least one logged set, most used first. */
export function loggedExercises(sessions: Session[]): string[] {
  const count = new Map<string, number>();
  for (const s of sessions) for (const set of sessionSets(s)) count.set(set.exerciseId, (count.get(set.exerciseId) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}


// ---------- Progress of exercises, training blocks and workouts ----------

/** How a progress value is shown: weights and volume follow the kg/lb setting. */
export type ValueKind = 'weight' | 'volume' | 'count' | 'clock' | 'minutes' | 'km' | 'kcal';

export interface ProgressMeasure {
  key: string;
  label: string;
  kind: ValueKind;
}

export interface ProgressItem {
  id: string;
  label: string;
  points: { date: number; values: Record<string, number> }[];
}

export const EXERCISE_MEASURES: ProgressMeasure[] = [
  { key: 'e1rm', label: 'Estimated 1RM', kind: 'weight' },
  { key: 'maxWeight', label: 'Max weight', kind: 'weight' },
  { key: 'volume', label: 'Volume', kind: 'volume' },
  { key: 'reps', label: 'Total reps', kind: 'count' },
  { key: 'maxReps', label: 'Most reps in a set', kind: 'count' },
  { key: 'maxDuration', label: 'Longest set (time)', kind: 'clock' },
  { key: 'distance', label: 'Distance', kind: 'km' },
];

export const BLOCK_MEASURES: ProgressMeasure[] = [
  { key: 'volume', label: 'Volume', kind: 'volume' },
  { key: 'maxWeight', label: 'Max weight', kind: 'weight' },
  { key: 'reps', label: 'Total reps', kind: 'count' },
  { key: 'rounds', label: 'Rounds', kind: 'count' },
  { key: 'time', label: 'Time', kind: 'clock' },
  { key: 'distance', label: 'Distance', kind: 'km' },
];

export const WORKOUT_MEASURES: ProgressMeasure[] = [
  { key: 'duration', label: 'Duration', kind: 'minutes' },
  { key: 'volume', label: 'Volume', kind: 'volume' },
  { key: 'reps', label: 'Total reps', kind: 'count' },
  { key: 'sets', label: 'Sets', kind: 'count' },
  { key: 'distance', label: 'Distance', kind: 'km' },
  { key: 'calories', label: 'Calories', kind: 'kcal' },
];

/** The measures that have at least one value for this item (others are not offered). */
export function measuresWithData(item: ProgressItem | undefined, measures: ProgressMeasure[]): ProgressMeasure[] {
  if (!item) return [];
  return measures.filter((m) => item.points.some((p) => (p.values[m.key] ?? 0) > 0));
}

const byPoints = (items: ProgressItem[]) => items.sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label));

export function exerciseProgressItems(sessions: Session[], name: (id: string) => string): ProgressItem[] {
  return loggedExercises(sessions).map((id) => ({
    id,
    label: name(id),
    points: exerciseHistory(id, sessions).map((p) => ({
      date: p.startedAt,
      values: { ...p.metrics, distance: p.sets.reduce((a, s) => a + (s.distanceM ?? 0), 0) / 1000 } as unknown as Record<string, number>,
    })),
  }));
}

/** Training blocks, recognised by their name, with one point per session in which they were done. */
export function blockProgressItems(sessions: Session[]): ProgressItem[] {
  const map = new Map<string, ProgressItem>();
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const seen = new Map<string, Record<string, number>>();
    for (const b of s.blocks) {
      const label = b.name?.trim();
      if (!label || b.skipped) continue;
      const sets = [...b.entries.flatMap((e) => e.sets.filter(isDone)), ...resultSets(b)];
      if (!sets.length && !b.result) continue;
      const v = seen.get(label.toLowerCase()) ?? { volume: 0, maxWeight: 0, reps: 0, rounds: 0, time: 0, distance: 0 };
      v.volume += sets.reduce((a, x) => a + setVolume(x), 0);
      v.maxWeight = Math.max(v.maxWeight, ...sets.map((x) => x.weight ?? 0));
      v.reps += sets.reduce((a, x) => a + setReps(x), 0);
      v.rounds += b.result?.rounds ?? 0;
      v.time += b.result?.timeSec ?? b.durationSec ?? sets.reduce((a, x) => a + (x.durationSec ?? 0), 0);
      v.distance += sets.reduce((a, x) => a + (x.distanceM ?? 0), 0) / 1000;
      seen.set(label.toLowerCase(), v);
      if (!map.has(label.toLowerCase())) map.set(label.toLowerCase(), { id: label.toLowerCase(), label, points: [] });
    }
    for (const [k, values] of seen) map.get(k)!.points.push({ date: s.startedAt, values });
  }
  return byPoints([...map.values()]);
}

/** Workouts (and activities) grouped by `key`, one point per session. */
export function workoutProgressItems(sessions: Session[], key: (s: Session) => { key: string; label: string }, calories?: CalorieFn): ProgressItem[] {
  const map = new Map<string, ProgressItem>();
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const k = key(s);
    const sum = sessionSummary(s);
    const item = map.get(k.key) ?? { id: k.key, label: k.label, points: [] };
    item.points.push({
      date: s.startedAt,
      values: { duration: sum.durationSec / 60, volume: sum.volume, reps: sum.reps, sets: sum.sets, distance: (s.distanceM ?? 0) / 1000, calories: calories?.(s) ?? 0 },
    });
    map.set(k.key, item);
  }
  return byPoints([...map.values()]);
}

/** Number of sessions per label (most first). */
export function countBy(sessions: Session[], key: (s: Session) => { key: string; label: string }): { label: string; n: number }[] {
  const map = new Map<string, { label: string; n: number }>();
  for (const s of sessions) {
    const k = key(s);
    const c = map.get(k.key) ?? { label: k.label, n: 0 };
    c.n += 1;
    map.set(k.key, c);
  }
  return [...map.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
