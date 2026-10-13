// Data model shared by the database, backup files, the timer and analytics.
// All weights are stored in kilograms; the UI converts to the preferred unit.

export type MuscleId =
  | 'chest'
  | 'upper_back'
  | 'lats'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'adductors'
  | 'abductors'
  | 'neck';

export type ExerciseCategory = 'strength' | 'bodyweight' | 'cardio' | 'mobility';

/** What a set of this exercise is usually measured in. Drives which inputs the log shows first. */
export type Tracking = 'weight_reps' | 'reps' | 'time' | 'time_distance';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string;
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  isCustom: boolean;
  notes?: string;
  tracking?: Tracking;
  /** Optional MET override used for calorie estimates (mainly cardio). */
  met?: number;
}

// ---------- Planning ----------

export type BlockFormat =
  | 'sets_reps'
  | 'timed_sets'
  | 'tabata'
  | 'amrap'
  | 'emom'
  | 'for_time'
  | 'intervals';

export type Grouping = 'none' | 'superset' | 'circuit' | 'dropset';

/** Target for one specific set, when the sets of an exercise are not all the same. */
export interface SetTarget {
  reps?: number;
  /** kg */
  weight?: number;
  durationSec?: number;
  /** Warm-up (approach) set. */
  warmup?: boolean;
  /** As many reps as possible / to failure. */
  toFailure?: boolean;
}

export interface ExerciseEntry {
  id: string;
  exerciseId: string;
  sets: number;
  reps?: number;
  durationSec?: number;
  /** Target weight in kg. */
  targetWeight?: number;
  /** Rest after each set (seconds). */
  restSec: number;
  grouping: Grouping;
  /** Consecutive entries with the same grouping and label form one superset or circuit. */
  groupLabel?: string;
  /** Drop set: number of drops after the target set. */
  drops?: number;
  /** Drop set: weight reduction per drop in percent. */
  dropPercent?: number;
  /**
   * Different targets per set (warm-up, pyramid, last set to failure…). When present, set n uses
   * setTargets[n-1] and the number of sets equals its length. In EMOM blocks, the n-th interval
   * of this exercise uses setTargets[n-1].
   */
  setTargets?: SetTarget[];
  /** Free note shown while training, e.g. "18% incline · 4 km/h". */
  note?: string;
}

export interface IntervalSegment {
  id: string;
  label: string;
  kind: 'work' | 'rest';
  durationSec: number;
  sound?: boolean;
}

export interface TimerOptions {
  /** Get-ready countdown before the block starts. */
  prepSec: number;
  /** Rest before the block (used between chained quick timers, e.g. sets of EMOMs). */
  restBeforeSec?: number;
  workLabel: string;
  restLabel: string;
  sound: boolean;
  vibrate: boolean;
}

export interface BlockParams {
  // tabata
  rounds?: number;
  workSec?: number;
  restSec?: number;
  extraSets?: number;
  restBetweenSetsSec?: number;
  // amrap / for time
  timeCapMin?: number;
  // emom
  totalMin?: number;
  intervalSec?: number;
  // for time
  targetRounds?: number;
  /** Short signal every N seconds while the clock runs (For Time). */
  signalEverySec?: number;
  targetReps?: number;
  // intervals
  segments?: IntervalSegment[];
  repeats?: number;
}

export interface Block {
  id: string;
  name?: string;
  /** Optional block: can be skipped on a given day without affecting the rest. */
  optional?: boolean;
  format: BlockFormat;
  params: BlockParams;
  entries: ExerciseEntry[];
  note?: string;
  timer: TimerOptions;
}

export interface ProgramDay {
  id: string;
  name: string;
  /** 0 = Monday … 6 = Sunday. Optional. */
  weekday?: number;
  blocks: Block[];
}

export interface Program {
  id: string;
  name: string;
  weeks?: number;
  notes?: string;
  days: ProgramDay[];
  createdAt: number;
  updatedAt: number;
}

// ---------- Logging ----------

export interface SetRecord {
  exerciseId: string;
  setNumber: number;
  reps?: number;
  /** kg */
  weight?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  completed: boolean;
  skipped?: boolean;
  /** Drop sets: weights (kg) used after the main set, in order. */
  dropWeights?: number[];
  /** Drop sets: reps done at each drop weight. */
  dropReps?: number[];
  warmup?: boolean;
  toFailure?: boolean;
}

export interface PerformedEntry {
  id: string;
  exerciseId: string;
  planned?: ExerciseEntry;
  sets: SetRecord[];
}

export interface BlockResult {
  rounds?: number;
  reps?: number;
  timeSec?: number;
}

export interface PerformedBlock {
  id: string;
  name?: string;
  optional?: boolean;
  /** Optional block not done in this session. */
  skipped?: boolean;
  format: BlockFormat;
  params: BlockParams;
  timer: TimerOptions;
  entries: PerformedEntry[];
  note?: string;
  /** AMRAP / For Time / EMOM results. */
  result?: BlockResult;
  /** Active time in this block, measured by the timer. */
  durationSec?: number;
  startedAt?: number;
  endedAt?: number;
}

export type Intensity = 'light' | 'moderate' | 'vigorous';
export type SessionSource = 'manual' | 'timer' | 'fit' | 'tcx' | 'strava';

export interface HeartRateData {
  avg?: number;
  max?: number;
  /** [secondsFromStart, bpm] pairs, downsampled. */
  samples?: [number, number][];
}

export interface Session {
  id: string;
  /** Local calendar date YYYY-MM-DD. */
  date: string;
  title: string;
  status: 'in_progress' | 'completed';
  programId?: string;
  programDayId?: string;
  startedAt: number;
  endedAt?: number;
  blocks: PerformedBlock[];
  intensity: Intensity;
  /** Calories from an imported file or typed in by the user. Estimated calories are always computed, never stored. */
  importedCalories?: number;
  /** Where importedCalories came from: a device/file import (default) or typed in manually. */
  calorieSource?: 'imported' | 'manual';
  /** Elevation gain in metres (outdoor activities). */
  elevationGainM?: number;
  hr?: HeartRateData;
  distanceM?: number;
  /** Sport id from src/data/sports.ts, or the raw type of an imported activity. */
  activityType?: string;
  source: SessionSource;
  /** Identifiers of imported activities merged into this session (e.g. "strava:123"). */
  externalIds?: string[];
  notes?: string;
  updatedAt: number;
}

export interface BodyWeight {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export type Sex = 'male' | 'female' | 'unspecified';
export type WeightUnit = 'kg' | 'lb';

export interface Profile {
  sex: Sex;
  birthDate?: string; // YYYY-MM-DD
  age?: number;
  heightCm?: number;
  weightKg?: number;
  unit: WeightUnit;
  defaultRestSec: number;
  defaultPrepSec: number;
}

export interface Settings {
  lastBackupAt?: number;
  backupReminderDismissedAt?: number;
  persistRequested?: boolean;
  soundVolume: number;
  backgroundAudio: boolean;
  /** Timer beeps mix with music from other apps (Spotify…) instead of pausing it. */
  mixWithMusic: boolean;
  /** Short signal halfway through timed work phases. */
  halfwayCue: boolean;
  stravaEnabled: boolean;
}

export interface KV {
  key: string;
  value: unknown;
}
