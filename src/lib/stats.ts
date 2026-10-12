// Derived training metrics. Everything here is computed from logged sessions on demand,
// so editing a session automatically updates volume, 1RM, PRs and progression.

import type { PerformedBlock, Session, SetRecord } from '../db/types';
import { sessionDurationSec } from './session';

/** Estimated one-rep max (Epley): w × (1 + reps / 30). One rep returns the weight itself. */
export function epley1RM(weight: number | undefined, reps: number | undefined): number {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function isDone(s: SetRecord): boolean {
  return s.completed && !s.skipped;
}

/** Volume of one set in kg: reps × weight, plus every drop of a drop set. */
export function setVolume(s: SetRecord): number {
  let v = (s.reps ?? 0) * (s.weight ?? 0);
  s.dropWeights?.forEach((w, i) => (v += (s.dropReps?.[i] ?? 0) * w));
  return v;
}

export function setReps(s: SetRecord): number {
  return (s.reps ?? 0) + (s.dropReps ?? []).reduce((a, b) => a + b, 0);
}

/**
 * AMRAP and For Time blocks are logged as a result (rounds + extra reps) rather than sets.
 * Turn the result into one “virtual” set per exercise so volume and muscle work include it.
 */
export function resultSets(b: PerformedBlock): SetRecord[] {
  if (b.format !== 'amrap' && b.format !== 'for_time') return [];
  const rounds = b.result?.rounds ?? (b.format === 'for_time' && b.result?.timeSec ? b.params.targetRounds ?? 0 : 0);
  let extra = b.result?.reps ?? 0;
  const out: SetRecord[] = [];
  for (const e of b.entries) {
    const per = e.planned?.reps ?? 0;
    let reps = rounds * per;
    if (extra > 0 && per > 0) {
      const add = Math.min(per, extra);
      reps += add;
      extra -= add;
    }
    const duration = e.planned?.durationSec ? rounds * e.planned.durationSec : undefined;
    if (reps > 0 || duration) {
      out.push({ exerciseId: e.exerciseId, setNumber: 1, reps: reps || undefined, weight: e.planned?.targetWeight, durationSec: duration, completed: true });
    }
  }
  return out;
}

/** Number of rounds of work a block result represents per exercise (for muscle counting). */
export function resultRounds(b: PerformedBlock): number {
  if (b.format !== 'amrap' && b.format !== 'for_time') return 0;
  return b.result?.rounds ?? (b.format === 'for_time' && b.result?.timeSec ? b.params.targetRounds ?? 0 : 0);
}

/** All completed sets of a session, including virtual sets from AMRAP/For Time results. */
export function sessionSets(s: Session): SetRecord[] {
  const out: SetRecord[] = [];
  for (const b of s.blocks) {
    for (const e of b.entries) for (const set of e.sets) if (isDone(set)) out.push(set);
    out.push(...resultSets(b));
  }
  return out;
}

export interface ExerciseMetrics {
  exerciseId: string;
  sets: number;
  reps: number;
  volume: number;
  maxWeight: number;
  e1rm: number;
  bestSet?: SetRecord;
  /** Most reps in a single set. */
  maxReps: number;
  maxDuration: number;
  /** weight (kg, 2 decimals) → most reps in one set at that weight */
  repsAtWeight: Record<string, number>;
}

function emptyMetrics(exerciseId: string): ExerciseMetrics {
  return { exerciseId, sets: 0, reps: 0, volume: 0, maxWeight: 0, e1rm: 0, maxReps: 0, maxDuration: 0, repsAtWeight: {} };
}

export function metricsFromSets(sets: SetRecord[]): Map<string, ExerciseMetrics> {
  const map = new Map<string, ExerciseMetrics>();
  for (const s of sets) {
    const m = map.get(s.exerciseId) ?? emptyMetrics(s.exerciseId);
    m.sets += 1;
    m.reps += setReps(s);
    m.volume += setVolume(s);
    const w = s.weight ?? 0;
    m.maxWeight = Math.max(m.maxWeight, w);
    m.maxReps = Math.max(m.maxReps, s.reps ?? 0);
    m.maxDuration = Math.max(m.maxDuration, s.durationSec ?? 0);
    const e = epley1RM(s.weight, s.reps);
    const better = !m.bestSet || e > epley1RM(m.bestSet.weight, m.bestSet.reps) || (e === epley1RM(m.bestSet.weight, m.bestSet.reps) && setVolume(s) > setVolume(m.bestSet));
    if (better) m.bestSet = s;
    m.e1rm = Math.max(m.e1rm, e);
    if (w > 0 && s.reps) {
      const k = String(r2(w));
      m.repsAtWeight[k] = Math.max(m.repsAtWeight[k] ?? 0, s.reps);
    }
    map.set(s.exerciseId, m);
  }
  return map;
}

export function sessionMetrics(s: Session): Map<string, ExerciseMetrics> {
  return metricsFromSets(sessionSets(s));
}

export interface SessionSummary {
  durationSec: number;
  volume: number;
  reps: number;
  sets: number;
  exercises: number;
}

export function sessionSummary(s: Session): SessionSummary {
  const sets = sessionSets(s);
  return {
    durationSec: sessionDurationSec(s),
    volume: sets.reduce((a, x) => a + setVolume(x), 0),
    reps: sets.reduce((a, x) => a + setReps(x), 0),
    sets: sets.length,
    exercises: new Set(sets.map((x) => x.exerciseId)).size,
  };
}

// ---------- Personal records ----------

export type PRKind = 'max_weight' | 'e1rm' | 'reps_at_weight' | 'longest_time' | 'most_rounds';

export interface PR {
  kind: PRKind;
  exerciseId?: string;
  blockId?: string;
  value: number;
  previous: number;
  /** For reps_at_weight: the weight in kg. */
  weight?: number;
}

export const PR_LABEL: Record<PRKind, string> = {
  max_weight: 'Max weight',
  e1rm: 'Estimated 1RM',
  reps_at_weight: 'Most reps at weight',
  longest_time: 'Longest time',
  most_rounds: 'Most rounds',
};

/** Identifies “the same AMRAP”: same exercises and time cap. */
export function amrapSignature(b: PerformedBlock): string | null {
  if (b.format !== 'amrap') return null;
  return `${b.params.timeCapMin}|${b.entries.map((e) => e.exerciseId).sort().join(',')}`;
}

function sorted(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * PRs set in `session` compared with all completed sessions that started before it.
 * An exercise done for the first time sets no PR (there is nothing to beat).
 */
export function detectPRs(session: Session, all: Session[]): PR[] {
  const prior = all.filter((s) => s.id !== session.id && s.status === 'completed' && s.startedAt < session.startedAt);
  const best = metricsFromSets(prior.flatMap(sessionSets));
  const current = sessionMetrics(session);
  const prs: PR[] = [];
  for (const [id, m] of current) {
    const b = best.get(id);
    if (!b) continue;
    if (m.maxWeight > 0 && r2(m.maxWeight) > r2(b.maxWeight)) prs.push({ kind: 'max_weight', exerciseId: id, value: m.maxWeight, previous: b.maxWeight });
    if (m.e1rm > 0 && r2(m.e1rm) > r2(b.e1rm) && r2(m.maxWeight) <= r2(b.maxWeight)) prs.push({ kind: 'e1rm', exerciseId: id, value: m.e1rm, previous: b.e1rm });
    for (const [w, reps] of Object.entries(m.repsAtWeight)) {
      const before = b.repsAtWeight[w];
      if (before !== undefined && reps > before) prs.push({ kind: 'reps_at_weight', exerciseId: id, value: reps, previous: before, weight: Number(w) });
    }
    if (m.maxDuration > 0 && m.maxDuration > b.maxDuration && b.maxDuration > 0) prs.push({ kind: 'longest_time', exerciseId: id, value: m.maxDuration, previous: b.maxDuration });
  }
  for (const blk of session.blocks) {
    const sig = amrapSignature(blk);
    if (!sig || blk.result?.rounds === undefined) continue;
    const score = (x: PerformedBlock) => (x.result?.rounds ?? 0) * 1000 + (x.result?.reps ?? 0);
    const previous = prior.flatMap((s) => s.blocks).filter((x) => amrapSignature(x) === sig && x.result?.rounds !== undefined);
    if (!previous.length) continue;
    const bestPrev = previous.reduce((a, x) => (score(x) > score(a) ? x : a));
    if (score(blk) > score(bestPrev)) prs.push({ kind: 'most_rounds', blockId: blk.id, value: blk.result.rounds, previous: bestPrev.result?.rounds ?? 0 });
  }
  return prs;
}

// ---------- Progression ----------

export interface ProgressPoint {
  sessionId: string;
  date: string;
  startedAt: number;
  metrics: ExerciseMetrics;
  /** Sets of this exercise in this session, in order. */
  sets: SetRecord[];
  /** Change vs the previous session with this exercise. */
  delta?: { e1rm: number; maxWeight: number; reps: number; volume: number; maxDuration: number };
  improved: boolean;
  /** First time this exercise was logged. */
  first: boolean;
}

/** Chronological history of one exercise across completed sessions. */
export function exerciseHistory(exerciseId: string, sessions: Session[]): ProgressPoint[] {
  const out: ProgressPoint[] = [];
  for (const s of sorted(sessions)) {
    if (s.status !== 'completed') continue;
    const sets = sessionSets(s).filter((x) => x.exerciseId === exerciseId);
    if (!sets.length) continue;
    const metrics = metricsFromSets(sets).get(exerciseId)!;
    // Compare like with like: weighted sessions with weighted ones, bodyweight/timed with the same.
    const weighted = metrics.maxWeight > 0;
    const prev = [...out].reverse().find((p) => p.metrics.maxWeight > 0 === weighted);
    const delta = prev
      ? {
          e1rm: metrics.e1rm - prev.metrics.e1rm,
          maxWeight: metrics.maxWeight - prev.metrics.maxWeight,
          reps: metrics.reps - prev.metrics.reps,
          volume: metrics.volume - prev.metrics.volume,
          maxDuration: metrics.maxDuration - prev.metrics.maxDuration,
        }
      : undefined;
    const improved = !!delta && (delta.e1rm > 0.01 || delta.maxWeight > 0.01 || (Math.abs(delta.maxWeight) < 0.01 && delta.reps > 0) || delta.maxDuration > 0);
    out.push({ sessionId: s.id, date: s.date, startedAt: s.startedAt, metrics, sets, delta, improved, first: out.length === 0 });
  }
  return out;
}

/** The most recent completed session before `before` that contains the exercise, with its sets. */
export function previousSets(exerciseId: string, sessions: Session[], before: number, excludeId?: string): { session: Session; sets: SetRecord[] } | null {
  let found: { session: Session; sets: SetRecord[] } | null = null;
  for (const s of sessions) {
    if (s.id === excludeId || s.status !== 'completed' || s.startedAt >= before) continue;
    if (found && s.startedAt <= found.session.startedAt) continue;
    const sets = s.blocks.flatMap((b) => b.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter(isDone)));
    if (sets.length) found = { session: s, sets };
  }
  return found;
}

export type SetComparison = 'up' | 'same' | 'down' | 'new';

/** Compare one set with the same set number last time: more weight, or same weight and more reps/time, is progress. */
export function compareSet(cur: SetRecord, prev: SetRecord | undefined): SetComparison {
  if (!prev) return 'new';
  const cw = r2(cur.weight ?? 0);
  const pw = r2(prev.weight ?? 0);
  if (cw > pw) return 'up';
  if (cw < pw) return 'down';
  const cr = cur.reps ?? 0;
  const pr = prev.reps ?? 0;
  if (cr > pr) return 'up';
  if (cr < pr) return 'down';
  const cd = cur.durationSec ?? 0;
  const pd = prev.durationSec ?? 0;
  if (cd > pd) return 'up';
  if (cd < pd) return 'down';
  return 'same';
}
