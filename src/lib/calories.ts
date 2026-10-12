// Calorie estimates (MET method) and basal metabolic rate (Mifflin-St Jeor).
// kcal = MET × body weight (kg) × duration (h). MET values are approximations based on the
// Compendium of Physical Activities (Ainsworth et al., 2011; Herrmann et al., 2024).

import type { BodyWeight, Exercise, Intensity, PerformedBlock, Profile, Session } from '../db/types';
import { EFFORT_FACTOR, isGymType, resolveSport, sportMET } from '../data/sports';
import { ageFromBirthDate, fromDateKey } from './dates';
import { estimateBlockSeconds } from './program';
import { performedToBlock, sessionDurationSec } from './session';

export type ActivityKind = 'strength' | 'calisthenics' | 'circuit' | 'hiit' | 'mobility';

/** MET by activity and effort. Shown in Settings so the user can see where numbers come from. */
export const MET_TABLE: Record<ActivityKind, { label: string; light: number; moderate: number; vigorous: number }> = {
  strength: { label: 'Resistance training (weights, machines)', light: 3.5, moderate: 5.0, vigorous: 6.0 },
  calisthenics: { label: 'Calisthenics / timed bodyweight sets', light: 2.8, moderate: 3.8, vigorous: 8.0 },
  circuit: { label: 'Circuit training (AMRAP, EMOM, For Time)', light: 3.5, moderate: 4.3, vigorous: 8.0 },
  hiit: { label: 'High-intensity intervals (Tabata, intervals)', light: 4.0, moderate: 6.0, vigorous: 8.0 },
  mobility: { label: 'Stretching / mobility', light: 2.3, moderate: 2.3, vigorous: 3.0 },
};

/** Cardio exercises carry a moderate MET in the catalog; scale it for effort. */
export const CARDIO_EFFORT_FACTOR: Record<Intensity, number> = { light: 0.75, moderate: 1, vigorous: 1.3 };

export function blockKind(b: PerformedBlock, exercises: Map<string, Exercise>): ActivityKind | 'cardio' {
  const cats = b.entries.map((e) => exercises.get(e.exerciseId)?.category);
  const count = (c: string) => cats.filter((x) => x === c).length;
  if (cats.length && count('cardio') > cats.length / 2) return 'cardio';
  if (cats.length && count('mobility') > cats.length / 2) return 'mobility';
  switch (b.format) {
    case 'tabata':
    case 'intervals':
      return 'hiit';
    case 'amrap':
    case 'emom':
    case 'for_time':
      return 'circuit';
    case 'timed_sets':
      return count('strength') > cats.length / 2 ? 'strength' : 'calisthenics';
    default:
      return count('bodyweight') > cats.length / 2 ? 'calisthenics' : 'strength';
  }
}

export function blockMET(b: PerformedBlock, intensity: Intensity, exercises: Map<string, Exercise>): number {
  const kind = blockKind(b, exercises);
  if (kind === 'cardio') {
    const mets = b.entries.map((e) => exercises.get(e.exerciseId)?.met).filter((m): m is number => !!m);
    const avg = mets.length ? mets.reduce((a, m) => a + m, 0) / mets.length : 7;
    return avg * CARDIO_EFFORT_FACTOR[intensity];
  }
  return MET_TABLE[kind][intensity];
}

/** MET for an activity logged without sets (manual entry or import), from its sport. */
export function activityMET(activityType: string | undefined, intensity: Intensity, hours = 0, distanceM?: number, elevationGainM?: number): number {
  const sport = resolveSport(activityType);
  if (sport) return sportMET(sport, { intensity, hours, distanceM, elevationGainM });
  if (isGymType(activityType)) return MET_TABLE.strength[intensity];
  return 5.0 * EFFORT_FACTOR[intensity];
}

/** Body weight on the session date: the log entry nearest in time, else the profile weight. */
export function weightOn(date: string, log: BodyWeight[], profile: Pick<Profile, 'weightKg'>): number | undefined {
  if (log.length) {
    const t = fromDateKey(date).getTime();
    let best = log[0];
    let bestDiff = Infinity;
    for (const w of log) {
      const diff = Math.abs(fromDateKey(w.date).getTime() - t);
      if (diff < bestDiff || (diff === bestDiff && w.date > best.date)) {
        best = w;
        bestDiff = diff;
      }
    }
    return best.weightKg;
  }
  return profile.weightKg;
}

export interface CalorieResult {
  kcal: number | null;
  /** estimated = MET method; imported = from a device/file; manual = typed in by the user. */
  source: 'imported' | 'estimated' | 'manual';
  /** Weighted average MET used for an estimate. */
  met?: number;
  weightKg?: number;
  hours?: number;
  /** Why an estimate is missing. */
  missing?: 'weight' | 'duration';
}

/**
 * Split the session duration over its blocks. Blocks timed by the timer use their measured
 * time; the remaining session time is shared by the other blocks in proportion to their plan.
 */
export function blockHours(s: Session): number[] {
  const total = sessionDurationSec(s);
  const measured = s.blocks.map((b) => (b.skipped ? 0 : b.durationSec ?? 0));
  const measuredSum = measured.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, total - measuredSum);
  const untimed = s.blocks.map((b, i) => (measured[i] || b.skipped ? 0 : Math.max(1, estimateBlockSeconds(performedToBlock(b)))));
  const untimedSum = untimed.reduce((a, b) => a + b, 0);
  return s.blocks.map((_, i) => (measured[i] ? measured[i] : untimedSum ? (rest * untimed[i]) / untimedSum : 0) / 3600);
}

export function sessionCalories(s: Session, ctx: { profile: Profile; weights: BodyWeight[]; exercises: Map<string, Exercise> }): CalorieResult {
  if (s.importedCalories !== undefined && s.importedCalories !== null) return { kcal: Math.round(s.importedCalories), source: s.calorieSource === 'manual' ? 'manual' : 'imported' };
  const kg = weightOn(s.date, ctx.weights, ctx.profile);
  if (!kg) return { kcal: null, source: 'estimated', missing: 'weight' };
  const durationH = sessionDurationSec(s) / 3600;
  if (durationH <= 0) return { kcal: null, source: 'estimated', missing: 'duration', weightKg: kg };

  let metHours = 0;
  let hours = 0;
  if (s.blocks.length) {
    const hs = blockHours(s);
    s.blocks.forEach((b, i) => {
      metHours += blockMET(b, s.intensity, ctx.exercises) * hs[i];
      hours += hs[i];
    });
  }
  if (hours <= 0) {
    hours = durationH;
    metHours = activityMET(s.activityType, s.intensity, hours, s.distanceM, s.elevationGainM) * hours;
  }
  return { kcal: Math.round(metHours * kg), source: 'estimated', met: metHours / hours, weightKg: kg, hours };
}

export function ageOn(profile: Profile, atMs: number): number | undefined {
  if (profile.birthDate) return ageFromBirthDate(profile.birthDate, atMs);
  return profile.age;
}

/** Mifflin-St Jeor BMR in kcal/day. Returns null if height, weight or age is missing. */
export function bmrMifflin(sex: Profile['sex'], weightKg?: number, heightCm?: number, age?: number): number | null {
  if (!weightKg || !heightCm || age === undefined) return null;
  const s = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s;
}

/**
 * Exercise calories above resting (gross minus 1 MET for the same time), used for the daily
 * total so the resting part is not counted twice with the BMR.
 */
export function netExerciseKcal(c: CalorieResult, weightKg: number | undefined, hours: number): number {
  if (c.kcal === null) return 0;
  const resting = (weightKg ?? 0) * hours;
  return Math.max(0, c.kcal - resting);
}
