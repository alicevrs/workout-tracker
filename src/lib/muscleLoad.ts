// Muscle distribution: how the work of one or more sessions is spread over muscle groups.
// Unit = one completed set (a Tabata round, EMOM interval or AMRAP round counts as a set).
// Each primary muscle of the exercise gets 1 × the set, each secondary muscle 0.5 ×.

import { MUSCLE_IDS, PRIMARY_WEIGHT, SECONDARY_WEIGHT } from '../data/muscles';
import type { Exercise, MuscleId, Session } from '../db/types';
import { isDone, resultRounds } from './stats';
import { sessionDurationSec } from './session';

export type MuscleLoad = Record<MuscleId, number>;

export function emptyLoad(): MuscleLoad {
  return Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as MuscleLoad;
}

/** Imported activities without sets: map the activity type to a catalog exercise. */
const ACTIVITY_EXERCISE: Record<string, string> = {
  running: 'running',
  run: 'running',
  trail_running: 'running',
  treadmill: 'treadmill-run',
  cycling: 'cycling',
  ride: 'cycling',
  virtualride: 'stationary-bike',
  indoor_cycling: 'stationary-bike',
  walking: 'walking',
  walk: 'walking',
  hike: 'incline-walk',
  hiking: 'incline-walk',
  rowing: 'rowing-machine',
  indoor_rowing: 'rowing-machine',
  swimming: 'swimming',
  swim: 'swimming',
  elliptical: 'elliptical',
  stair_climbing: 'stair-climber',
  stairstepper: 'stair-climber',
};

export function exerciseForActivity(activityType: string | undefined): string | undefined {
  if (!activityType) return undefined;
  return ACTIVITY_EXERCISE[activityType.toLowerCase().replace(/\s+/g, '_')];
}

function add(load: MuscleLoad, ex: Exercise | undefined, units: number) {
  if (!ex || units <= 0) return;
  for (const m of ex.primaryMuscles) load[m] += units * PRIMARY_WEIGHT;
  for (const m of ex.secondaryMuscles) load[m] += units * SECONDARY_WEIGHT;
}

export function sessionMuscleLoad(s: Session, exercises: Map<string, Exercise>, into: MuscleLoad = emptyLoad()): MuscleLoad {
  let anySets = false;
  for (const b of s.blocks) {
    const rounds = resultRounds(b);
    for (const e of b.entries) {
      const ex = exercises.get(e.exerciseId);
      let units = 0;
      for (const set of e.sets) if (isDone(set)) units += 1 + 0.5 * (set.dropWeights?.length ?? 0);
      units += rounds;
      if (units > 0) anySets = true;
      add(into, ex, units);
    }
  }
  // Imported cardio without sets: one unit per 10 minutes.
  if (!anySets && s.activityType) {
    add(into, exercises.get(exerciseForActivity(s.activityType) ?? ''), sessionDurationSec(s) / 600);
  }
  return into;
}

export function muscleLoad(sessions: Session[], exercises: Map<string, Exercise>): MuscleLoad {
  const load = emptyLoad();
  for (const s of sessions) sessionMuscleLoad(s, exercises, load);
  return load;
}

export interface MuscleShare {
  muscle: MuscleId;
  load: number;
  /** 0…100 share of the total. */
  pct: number;
  /** 0…1 relative to the most worked muscle (for color intensity). */
  intensity: number;
}

export function muscleShares(load: MuscleLoad): MuscleShare[] {
  const total = Object.values(load).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(load));
  return (Object.entries(load) as [MuscleId, number][])
    .map(([muscle, l]) => ({ muscle, load: l, pct: total ? (l / total) * 100 : 0, intensity: max ? l / max : 0 }))
    .sort((a, b) => b.load - a.load);
}

/** Intensity map for one exercise: primary = 1, secondary = 0.45. */
export function exerciseIntensity(ex: Exercise): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  for (const m of ex.secondaryMuscles) out[m] = 0.45;
  for (const m of ex.primaryMuscles) out[m] = 1;
  return out;
}
