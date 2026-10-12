import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import { DEFAULT_PROFILE } from '../src/db/repo';
import type { Exercise, Profile } from '../src/db/types';
import { activityMET, blockMET, bmrMifflin, MET_TABLE, netExerciseKcal, sessionCalories, weightOn } from '../src/lib/calories';
import { block, session, set } from './helpers';

const exMap = new Map((exercises as Exercise[]).map((e) => [e.id, e]));
const profile: Profile = { ...DEFAULT_PROFILE, sex: 'female', heightCm: 168, birthDate: '1990-06-15', weightKg: 65 };

describe('Mifflin-St Jeor BMR', () => {
  it('matches the published formula for men and women', () => {
    // 10 × 80 + 6.25 × 180 − 5 × 30 + 5 = 1780
    expect(bmrMifflin('male', 80, 180, 30)).toBe(1780);
    // 10 × 60 + 6.25 × 165 − 5 × 40 − 161 = 1270.25
    expect(bmrMifflin('female', 60, 165, 40)).toBeCloseTo(1270.25, 5);
  });
  it('uses the midpoint constant when sex is not set, and null when data is missing', () => {
    expect(bmrMifflin('unspecified', 70, 170, 35)).toBeCloseTo(10 * 70 + 6.25 * 170 - 5 * 35 - 78, 5);
    expect(bmrMifflin('male', undefined, 180, 30)).toBeNull();
    expect(bmrMifflin('male', 80, 180, undefined)).toBeNull();
  });
});

describe('body weight for a session', () => {
  const log = [
    { id: '1', date: '2026-01-01', weightKg: 70 },
    { id: '2', date: '2026-02-01', weightKg: 68 },
    { id: '3', date: '2026-03-01', weightKg: 66 },
  ];
  it('uses the log entry nearest to the session date', () => {
    expect(weightOn('2026-01-10', log, profile)).toBe(70);
    expect(weightOn('2026-01-25', log, profile)).toBe(68);
    expect(weightOn('2026-12-01', log, profile)).toBe(66);
  });
  it('falls back to the profile weight', () => {
    expect(weightOn('2026-01-10', [], profile)).toBe(65);
  });
});

describe('MET calorie estimate', () => {
  it('kcal = MET × kg × hours for a 1 h moderate strength session', () => {
    const s = session('2026-03-02', [block([set('back-squat', 80, 5)])]);
    const c = sessionCalories(s, { profile, weights: [{ id: 'w', date: '2026-03-01', weightKg: 80 }], exercises: exMap });
    expect(c).toMatchObject({ source: 'estimated', kcal: Math.round(MET_TABLE.strength.moderate * 80 * 1), weightKg: 80 });
  });

  it('effort changes the MET', () => {
    const s = session('2026-03-02', [block([set('back-squat', 80, 5)])], { intensity: 'vigorous' });
    expect(sessionCalories(s, { profile, weights: [], exercises: exMap }).kcal).toBe(Math.round(6.0 * 65));
  });

  it('uses format-specific METs and cardio exercise METs', () => {
    const tabata = block([set('burpee', undefined, 10)], { format: 'tabata' });
    expect(blockMET(tabata, 'moderate', exMap)).toBe(MET_TABLE.hiit.moderate);
    const amrap = block([set('burpee', undefined, 10)], { format: 'amrap' });
    expect(blockMET(amrap, 'vigorous', exMap)).toBe(MET_TABLE.circuit.vigorous);
    const run = block([set('running', undefined, undefined, { durationSec: 1800 })], { format: 'timed_sets' });
    expect(blockMET(run, 'moderate', exMap)).toBe(9.8);
  });

  it('splits time between blocks: timed blocks keep their measured time', () => {
    const strength = block([set('back-squat', 80, 5)]);
    const hiit = block([set('burpee', undefined, 10)], { format: 'tabata', durationSec: 240, params: { rounds: 8, workSec: 20, restSec: 10 } });
    const s = session('2026-03-02', [strength, hiit]); // 1 h total
    const c = sessionCalories(s, { profile, weights: [], exercises: exMap });
    const expected = (5.0 * (3600 - 240) / 3600 + 6.0 * 240 / 3600) * 65;
    expect(c.kcal).toBe(Math.round(expected));
  });

  it('imported calories override the estimate and are marked as imported', () => {
    const s = session('2026-03-02', [], { importedCalories: 512.4, source: 'fit', activityType: 'running' });
    expect(sessionCalories(s, { profile, weights: [], exercises: exMap })).toEqual({ kcal: 512, source: 'imported' });
  });

  it('estimates imported activities without calories from the activity type', () => {
    const s = session('2026-03-02', [], { source: 'tcx', activityType: 'running' });
    expect(sessionCalories(s, { profile, weights: [], exercises: exMap }).kcal).toBe(Math.round(activityMET('running', 'moderate') * 65));
  });

  it('reports a missing body weight instead of guessing', () => {
    const s = session('2026-03-02', [block([set('back-squat', 80, 5)])]);
    expect(sessionCalories(s, { profile: { ...profile, weightKg: undefined }, weights: [], exercises: exMap })).toMatchObject({ kcal: null, missing: 'weight' });
  });

  it('net exercise calories subtract the resting 1 MET', () => {
    expect(netExerciseKcal({ kcal: 325, source: 'estimated' }, 65, 1)).toBe(260);
    expect(netExerciseKcal({ kcal: 30, source: 'estimated' }, 65, 1)).toBe(0);
  });
});
