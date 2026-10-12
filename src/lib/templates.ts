// Ready-made programs the user can add from the Programs screen.

import type { Block, BlockParams, ExerciseEntry, IntervalSegment, Program, ProgramDay, SetTarget } from '../db/types';
import { splitProgram, workoutFromDay } from './workouts';
import { uid } from './ids';
import { defaultParams, defaultTimer, newEntry } from './program';
import { sampleProgram } from './sampleProgram';

function entry(exerciseId: string, format: Block['format'], patch: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return { ...newEntry(exerciseId, format), ...patch };
}

function block(format: Block['format'], name: string, entries: ExerciseEntry[], params: BlockParams = {}, extra: Partial<Block> = {}): Block {
  return { id: uid(), name, format, params: { ...defaultParams(format), ...params }, entries, timer: defaultTimer(10), ...extra };
}

const seg = (label: string, kind: 'work' | 'rest', durationSec: number): IntervalSegment => ({ id: uid(), label, kind, durationSec, sound: true });

/** A single timed exercise: one set of `seconds`. */
const timed = (name: string, exerciseId: string, seconds: number, patch: Partial<ExerciseEntry> = {}, extra: Partial<Block> = {}) =>
  block('timed_sets', name, [entry(exerciseId, 'timed_sets', { sets: 1, durationSec: seconds, restSec: 0, ...patch })], {}, extra);

// ---------- Glutes & conditioning week ----------

function absAndWalk(name: string, weekday: number): ProgramDay {
  return {
    id: uid(),
    name,
    weekday,
    blocks: [
      block(
        'tabata',
        'Abs',
        [entry('abs-mixed', 'tabata', { note: 'Choose your ab exercises' })],
        { rounds: 4, workSec: 40, restSec: 0, extraSets: 3, restBetweenSetsSec: 20 },
        { note: '4 sets × 4 rounds of 40 s, no rest between rounds, 20 s between sets' },
      ),
      timed('Incline walk', 'incline-walk', 40 * 60, { note: 'Treadmill · 18% incline · 4 km/h' }),
    ],
  };
}

const HIP_THRUST_SETS: SetTarget[] = [
  { reps: 15, weight: 60, warmup: true },
  { reps: 8, weight: 100 },
  { reps: 8, weight: 100 },
  { reps: 8, weight: 100 },
  { reps: 8, weight: 100 },
  { weight: 100, toFailure: true },
];

/** Blocks shared by both leg days. */
function legsStart(): Block[] {
  return [
    timed('Mobility', 'mobility-routine', 5 * 60),
    timed('Glute warm-up', 'glute-bridge', 160, { targetWeight: 10, note: 'Heels down, hips up and down' }),
    block('timed_sets', 'Back extension', [entry('back-extension', 'timed_sets', { sets: 3, durationSec: 80, restSec: 30, targetWeight: 10 })]),
    block(
      'emom',
      'Hip thrust',
      [entry('hip-thrust', 'emom', { setTargets: HIP_THRUST_SETS, note: 'Every 2 min: warm-up 60 kg × 15, 4 × 8 at 100 kg, last set to failure (≈ 10)' })],
      { totalMin: 12, intervalSec: 120 },
    ),
    block('tabata', 'Romanian deadlift', [entry('romanian-deadlift', 'tabata', { targetWeight: 16 })], { rounds: 4, workSec: 80, restSec: 40, extraSets: 0 }),
  ];
}

function legsA(): ProgramDay {
  return {
    id: uid(),
    name: 'Legs & glutes A',
    weekday: 1,
    blocks: [
      ...legsStart(),
      block(
        'intervals',
        'Bulgarian split squat',
        [entry('bulgarian-split-squat', 'intervals', { targetWeight: 8 })],
        { segments: [seg('Right leg', 'work', 60), seg('Left leg', 'work', 60)], repeats: 4 },
        { optional: true, note: '4 minutes per leg, alternating every minute, no rest' },
      ),
      block('timed_sets', 'Leg press', [entry('leg-press', 'timed_sets', { sets: 4, durationSec: 60, restSec: 30, targetWeight: 80 })]),
      timed('Stretching', 'stretching-routine', 5 * 60),
    ],
  };
}

function legsB(): ProgramDay {
  const abAd: IntervalSegment[] = [];
  for (let i = 0; i < 4; i++) {
    abAd.push(seg('Abduction (open)', 'work', 60));
    if (i < 3) abAd.push(seg('Change machine', 'rest', 15), seg('Adduction (close)', 'work', 60), seg('Change machine', 'rest', 15));
  }
  return {
    id: uid(),
    name: 'Legs & glutes B',
    weekday: 4,
    blocks: [
      ...legsStart(),
      block(
        'intervals',
        'Abduction / adduction',
        [entry('hip-abduction-machine', 'intervals', { targetWeight: 60 }), entry('hip-adduction-machine', 'intervals', { targetWeight: 30 })],
        { segments: abAd, repeats: 1 },
        { optional: true, note: '4 × abduction and 3 × adduction, 1 min each, 15 s to change machine' },
      ),
      block(
        'intervals',
        'Cable kickback',
        [entry('cable-kickback', 'intervals', { targetWeight: 8 })],
        { segments: [seg('Right leg', 'work', 60), seg('Switch leg', 'rest', 25), seg('Left leg', 'work', 60), seg('Switch leg', 'rest', 25)], repeats: 5 },
        { note: '10 rounds of 1 min, 25 s to switch leg' },
      ),
      timed('Stretching', 'stretching-routine', 5 * 60),
    ],
  };
}

/**
 * Body Pump (Les Mills), 55 minutes. A typical class has these tracks; songs and exact
 * exercises change with every release, so durations and reps are approximate.
 */
function bodyPump(): ProgramDay {
  const BAR_KG = 10;
  const BAR = new Set(['barbell-warm-up', 'back-squat', 'barbell-bench-press', 'deadlift', 'barbell-row', 'clean-and-press', 'barbell-curl', 'static-lunge', 'overhead-press']);
  const t = (exerciseId: string, seconds: number, reps: number | undefined, restAfter = 0, note?: string) =>
    entry(exerciseId, 'timed_sets', { sets: 1, durationSec: seconds, reps, restSec: restAfter, note, targetWeight: BAR.has(exerciseId) ? BAR_KG : undefined });
  const TRACK_BREAK = 40;
  return {
    id: uid(),
    name: 'Body Pump',
    weekday: 2,
    blocks: [
      block(
        'timed_sets',
        'Body Pump class (55 min)',
        [
          t('barbell-warm-up', 330, undefined, TRACK_BREAK, 'Track 1 · Warm-up'),
          t('back-squat', 330, 90, TRACK_BREAK, 'Track 2 · Squats'),
          t('barbell-bench-press', 240, 70, 0, 'Track 3 · Chest'),
          t('push-up', 90, 20, TRACK_BREAK, 'Track 3 · Chest'),
          t('deadlift', 120, 30, 0, 'Track 4 · Back'),
          t('barbell-row', 120, 30, 0, 'Track 4 · Back'),
          t('clean-and-press', 90, 16, TRACK_BREAK, 'Track 4 · Back'),
          t('overhead-triceps-extension', 120, 40, 0, 'Track 5 · Triceps'),
          t('bench-dip', 120, 30, TRACK_BREAK, 'Track 5 · Triceps'),
          t('barbell-curl', 270, 60, TRACK_BREAK, 'Track 6 · Biceps'),
          t('static-lunge', 330, 60, TRACK_BREAK, 'Track 7 · Lunges'),
          t('overhead-press', 120, 30, 0, 'Track 8 · Shoulders'),
          t('lateral-raise', 90, 20, 0, 'Track 8 · Shoulders'),
          t('push-up', 60, 15, TRACK_BREAK, 'Track 8 · Shoulders'),
          t('crunch', 150, 50, 0, 'Track 9 · Core'),
          t('plank', 120, undefined, TRACK_BREAK, 'Track 9 · Core'),
          t('stretching-routine', 240, undefined, 0, 'Track 10 · Cool-down'),
        ],
        {},
        { note: 'Les Mills class led by an instructor. Use “Log as done” after class.', timer: defaultTimer(0) },
      ),
    ],
  };
}

/** The personal workouts: abs + cardio, two legs & glutes days and Body Pump. */
export function myWorkouts(): Program[] {
  return [absAndWalk('Abs + cardio', 0), legsA(), legsB(), bodyPump()].map((d) => {
    const name = { 'Legs & glutes A': 'Legs & glutes 1', 'Legs & glutes B': 'Legs & glutes 2' }[d.name] ?? d.name;
    return workoutFromDay(d, name);
  });
}

export const TEMPLATES: { id: string; name: string; description: string; create: () => Program[] }[] = [
  {
    id: 'my-workouts',
    name: 'My workouts',
    description: 'Abs + cardio, Legs & glutes 1, Legs & glutes 2 and Body Pump.',
    create: myWorkouts,
  },
  { id: 'sample', name: 'Sample workouts', description: 'Upper body, conditioning and lower body examples using every block format.', create: () => splitProgram(sampleProgram()) },
];
