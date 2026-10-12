import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import type { Exercise } from '../src/db/types';
import { muscleShares, sessionMuscleLoad } from '../src/lib/muscleLoad';
import { compareSet, detectPRs, epley1RM, exerciseHistory, previousSets, sessionSummary, setVolume } from '../src/lib/stats';
import { block, session, set } from './helpers';

const exMap = new Map((exercises as Exercise[]).map((e) => [e.id, e]));

describe('Epley 1RM', () => {
  it('follows w × (1 + reps/30)', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2);
    expect(epley1RM(60, 5)).toBeCloseTo(70, 5);
  });
  it('returns the weight for a single rep and 0 for missing data', () => {
    expect(epley1RM(140, 1)).toBe(140);
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(undefined, 8)).toBe(0);
  });
});

describe('volume and summary', () => {
  it('sums sets × reps × weight including drop sets, ignoring skipped and open sets', () => {
    expect(setVolume(set('curl', 20, 10, { dropWeights: [15, 10], dropReps: [8, 6] }))).toBe(200 + 120 + 60);
    const s = session('2026-01-05', [
      block([set('bench-press', 60, 8), set('bench-press', 60, 8), set('bench-press', 60, 6, { skipped: true }), set('bench-press', 60, 6, { completed: false })]),
    ]);
    expect(sessionSummary(s)).toMatchObject({ volume: 960, reps: 16, sets: 2, exercises: 1, durationSec: 3600 });
  });

  it('counts AMRAP rounds as volume', () => {
    const b = block([], { format: 'amrap', params: { timeCapMin: 10 }, result: { rounds: 5, reps: 4 } });
    b.entries = [
      { id: 'x', exerciseId: 'kettlebell-swing', planned: { id: 'x', exerciseId: 'kettlebell-swing', sets: 1, reps: 10, targetWeight: 16, restSec: 0, grouping: 'none' }, sets: [] },
      { id: 'y', exerciseId: 'push-up', planned: { id: 'y', exerciseId: 'push-up', sets: 1, reps: 10, restSec: 0, grouping: 'none' }, sets: [] },
    ];
    const sum = sessionSummary(session('2026-01-05', [b]));
    expect(sum.reps).toBe(104); // swings 5 × 10 + 4 extra, push-ups 5 × 10
    expect(sum.volume).toBe(54 * 16);
  });
});

describe('personal records and progression', () => {
  const s1 = session('2026-01-05', [block([set('back-squat', 100, 5), set('back-squat', 100, 5), set('plank', undefined, undefined, { durationSec: 60 })])]);
  const s2 = session('2026-01-08', [block([set('back-squat', 100, 7), set('back-squat', 105, 3), set('plank', undefined, undefined, { durationSec: 75 })])]);
  const s3 = session('2026-01-12', [block([set('back-squat', 95, 5)])]);
  const all = [s1, s2, s3];

  it('detects max weight, reps at weight and longest time PRs', () => {
    const prs = detectPRs(s2, all);
    expect(prs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'max_weight', exerciseId: 'back-squat', value: 105, previous: 100 }),
        expect.objectContaining({ kind: 'reps_at_weight', exerciseId: 'back-squat', value: 7, previous: 5, weight: 100 }),
        expect.objectContaining({ kind: 'longest_time', exerciseId: 'plank', value: 75, previous: 60 }),
      ]),
    );
  });

  it('sets no PRs the first time or when weaker', () => {
    expect(detectPRs(s1, all)).toEqual([]);
    expect(detectPRs(s3, all)).toEqual([]);
  });

  it('detects the most rounds PR for the same AMRAP', () => {
    const amrap = (day: string, rounds: number) => {
      const b = block([], { format: 'amrap', params: { timeCapMin: 12 }, result: { rounds } });
      b.entries = [{ id: 'e', exerciseId: 'burpee', sets: [], planned: { id: 'e', exerciseId: 'burpee', sets: 1, reps: 10, restSec: 0, grouping: 'none' } }];
      return session(day, [b]);
    };
    const a = amrap('2026-02-01', 6);
    const b = amrap('2026-02-08', 7);
    expect(detectPRs(b, [a, b]).find((p) => p.kind === 'most_rounds')).toMatchObject({ value: 7, previous: 6 });
  });

  it('builds a chronological history with improvement flags', () => {
    const h = exerciseHistory('back-squat', [s3, s1, s2]);
    expect(h.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-08', '2026-01-12']);
    expect(h.map((p) => p.improved)).toEqual([false, true, false]);
    expect(h[1].delta?.maxWeight).toBe(5);
  });

  it('finds the previous session values for an exercise', () => {
    const prev = previousSets('back-squat', all, s3.startedAt, s3.id);
    expect(prev?.session.id).toBe(s2.id);
    expect(prev?.sets.map((x) => x.reps)).toEqual([7, 3]);
  });

  it('compares sets: more weight or same weight with more reps is progress', () => {
    expect(compareSet(set('x', 62.5, 5), set('x', 60, 8))).toBe('up');
    expect(compareSet(set('x', 60, 9), set('x', 60, 8))).toBe('up');
    expect(compareSet(set('x', 60, 8), set('x', 60, 8))).toBe('same');
    expect(compareSet(set('x', 60, 6), set('x', 60, 8))).toBe('down');
    expect(compareSet(set('x', 60, 6), undefined)).toBe('new');
  });

  it('recalculates when a session is edited', () => {
    const edited = structuredClone(s3);
    edited.blocks[0].entries[0].sets[0].weight = 110;
    expect(detectPRs(edited, [s1, s2, edited])[0]).toMatchObject({ kind: 'max_weight', value: 110 });
    expect(sessionSummary(edited).volume).toBe(550);
  });
});

describe('muscle distribution', () => {
  it('weights primary muscles 1 and secondary 0.5 per set', () => {
    const s = session('2026-01-05', [block([set('barbell-bench-press', 60, 8), set('barbell-bench-press', 60, 8)])]);
    const load = sessionMuscleLoad(s, exMap);
    expect(load.chest).toBe(2);
    expect(load.triceps).toBe(1);
    expect(load.front_delts).toBe(1);
    expect(load.quads).toBe(0);
    const shares = muscleShares(load);
    expect(shares[0]).toMatchObject({ muscle: 'chest', pct: 50, intensity: 1 });
  });

  it('changes with the exercises done in the session', () => {
    const legs = sessionMuscleLoad(session('2026-01-06', [block([set('back-squat', 100, 5)])]), exMap);
    expect(legs.quads).toBe(1);
    expect(legs.chest).toBe(0);
  });

  it('uses the activity type for imported cardio without sets', () => {
    const run = session('2026-01-07', [], { activityType: 'running', source: 'fit' });
    const load = sessionMuscleLoad(run, exMap);
    expect(load.quads).toBeGreaterThan(0);
    expect(load.chest).toBe(0);
  });
});
