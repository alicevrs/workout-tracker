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

/**
 * What a set of this exercise is measured in. Drives which inputs the log shows. Weight is always
 * optional (left empty for bodyweight). Older data may still say 'reps' (= weight_reps) or
 * 'time' (= weight_time); read it through `trackingOf`.
 */
export type Tracking = 'weight_reps' | 'weight_time' | 'time_distance';
export type LegacyTracking = Tracking | 'reps' | 'time';

/** What a training block logs: one, two or all three. */
export type LogField = 'reps' | 'time' | 'distance';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string;
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  isCustom: boolean;
  notes?: string;
  tracking?: LegacyTracking;
  /** Optional MET override used for calorie estimates (mainly cardio). */
  met?: number;
  /** Built-in exercise changed by the user: kept when the catalogue is refreshed, and synced. */
  edited?: boolean;
  /** Built-in exercise deleted by the user: hidden from lists and pickers, kept so past workouts still show its name. */
  hidden?: boolean;
  updatedAt?: number;
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
  /** Free note shown while training. */
  note?: string;
  /** Time × distance exercises (treadmill and similar): target incline in percent. */
  incline?: number;
  /** Time × distance exercises: target speed in km/h. */
  speedKmh?: number;
  /** Time × distance exercises: target distance in km. */
  distanceKm?: number;
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
  /** Label of that rest, e.g. “Set rest”. */
  restBeforeLabel?: string;
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
  /** Sets after the first (Tabata; AMRAP, EMOM and For Time in workouts: split into one block per set when a session starts). */
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
  /** Distance blocks: total distance to cover (km), besides each exercise's own. */
  distanceKm?: number;
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
  /** Part of a workout template linked to an exercise block: it follows that block's changes. */
  templateId?: string;
  /** Training block whose timer comes from a saved timer: it follows that timer's changes. */
  timerId?: string;
  /** How the block's exercises are logged (chosen in the training block). Missing on older data: see `blockLogAs`. */
  logAs?: Tracking;
  /** What is logged for the exercises: any of reps, time, distance (see `blockLog`; replaces `logAs`). */
  log?: LogField[];
  /** How the exercises are combined, as chosen in the training block (missing on older blocks: see `structureOf`). */
  combine?: 'none' | 'sequence' | 'circuit';
  /** Combined as “Circuit”: in the workout one tap logs all its exercises as planned. */
  circuit?: boolean;
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

/** Exercise template: a ready-made block (exercises with sets, reps, weights, timer) to drop into workouts. */
export interface BlockTemplate {
  id: string;
  name: string;
  block: Block;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Saved timer (Workouts → Timers): a preset Tabata / AMRAP / EMOM / For Time to use in training blocks. */
export interface TimerTemplate {
  id: string;
  name: string;
  /** Same shape as the Timer tab's settings (`QuickTimer` in lib/timer/quick.ts). */
  timer: {
    kind: 'amrap' | 'for_time' | 'emom' | 'tabata';
    minutes?: number;
    everySec?: number;
    rounds?: number;
    workSec?: number;
    restSec?: number;
    sets?: number;
    setRestSec?: number;
  };
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
  /** Copied from the planned block: which columns the set log shows. */
  logAs?: Tracking;
  log?: LogField[];
  /** Added during the workout (Add block), not from a training block: it keeps the full editor. */
  addedInSession?: boolean;
  /** Copied from the planned block: logged with one tap (“Circuit done”). */
  circuit?: boolean;
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
  /** Spoken cues (recorded voice). */
  voice: 'off' | 'female' | 'male';
  /** Volume per sound group, 0…1, on top of soundVolume. */
  soundLevels: { countdown: number; start: number; signal: number; voice: number };
  stravaEnabled: boolean;
}

export interface KV {
  key: string;
  value: unknown;
}
