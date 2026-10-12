// Aggregations for the analytics screen. Pure functions over sessions.

import type { Exercise, MuscleId, Session } from '../db/types';
import { addDays, addMonths, DAY_MS, formatBucket, nextStart, startOf, startOfDay, startOfMonth, startOfWeek, toDateKey, type Grain } from './dates';
import { muscleLoad, muscleShares } from './muscleLoad';
import { sessionDurationSec } from './session';
import { exerciseHistory, sessionSets, sessionSummary } from './stats';

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

export type ComparePreset = 'week' | 'month' | '30d' | 'year' | 'custom';

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
    case '30d': {
      const a = startOfDay(now) - 29 * DAY_MS;
      return [
        { from: a, to: end, label: 'Last 30 days' },
        { from: a - 30 * DAY_MS, to: a - 1, label: 'The 30 days before' },
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

/** Sessions per calendar day, for the heatmap. */
export function dayCounts(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + 1);
  return m;
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

export function mostUsedExercise(sessions: Session[]): { exerciseId: string; sets: number } | null {
  const count = new Map<string, number>();
  for (const s of sessions) for (const set of sessionSets(s)) count.set(set.exerciseId, (count.get(set.exerciseId) ?? 0) + 1);
  let best: { exerciseId: string; sets: number } | null = null;
  for (const [exerciseId, sets] of count) if (!best || sets > best.sets) best = { exerciseId, sets };
  return best;
}

export function mostTrainedMuscle(sessions: Session[], exercises: Map<string, Exercise>): { muscle: MuscleId; pct: number } | null {
  const shares = muscleShares(muscleLoad(sessions, exercises));
  return shares[0] && shares[0].load > 0 ? { muscle: shares[0].muscle, pct: shares[0].pct } : null;
}

export type ProgressMetric = 'e1rm' | 'maxWeight' | 'volume' | 'reps' | 'maxReps' | 'maxDuration';

export const PROGRESS_LABEL: Record<ProgressMetric, string> = {
  e1rm: 'Estimated 1RM',
  maxWeight: 'Max weight',
  volume: 'Volume',
  reps: 'Total reps',
  maxReps: 'Most reps in a set',
  maxDuration: 'Longest set (time)',
};

export function progressSeries(exerciseId: string, sessions: Session[], metric: ProgressMetric) {
  return exerciseHistory(exerciseId, sessions).map((p) => ({
    date: p.startedAt,
    sessionId: p.sessionId,
    value: p.metrics[metric],
    improved: p.improved,
  }));
}

/** Exercises with at least one logged set, most used first. */
export function loggedExercises(sessions: Session[]): string[] {
  const count = new Map<string, number>();
  for (const s of sessions) for (const set of sessionSets(s)) count.set(set.exerciseId, (count.get(set.exerciseId) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

