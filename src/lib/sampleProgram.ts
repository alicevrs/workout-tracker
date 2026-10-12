import type { Block, ExerciseEntry, Program } from '../db/types';
import { uid } from './ids';
import { defaultParams, defaultTimer, newEntry } from './program';

function entry(exerciseId: string, patch: Partial<ExerciseEntry>, format: Block['format'] = 'sets_reps'): ExerciseEntry {
  return { ...newEntry(exerciseId, format), ...patch };
}

function block(format: Block['format'], entries: ExerciseEntry[], patch: Partial<Block> = {}): Block {
  return { id: uid(), format, params: defaultParams(format), entries, timer: defaultTimer(10), ...patch };
}

/** A small example week that shows every block format. */
export function sampleProgram(): Program {
  const now = Date.now();
  return {
    id: uid(),
    name: 'Sample week',
    weeks: 4,
    notes: 'An example program. Edit or duplicate it, or delete it when you have your own.',
    createdAt: now,
    updatedAt: now,
    days: [
      {
        id: uid(),
        name: 'Upper body',
        weekday: 0,
        blocks: [
          block('sets_reps', [
            entry('barbell-bench-press', { sets: 4, reps: 8, targetWeight: 60, restSec: 120 }),
            entry('barbell-row', { sets: 3, reps: 10, targetWeight: 50, restSec: 0, grouping: 'superset', groupLabel: 'A' }),
            entry('seated-dumbbell-shoulder-press', { sets: 3, reps: 10, targetWeight: 14, restSec: 90, grouping: 'superset', groupLabel: 'A' }),
            entry('dumbbell-curl', { sets: 2, reps: 10, targetWeight: 12, restSec: 60, grouping: 'dropset', drops: 2, dropPercent: 25 }),
          ], { name: 'Strength' }),
        ],
      },
      {
        id: uid(),
        name: 'Conditioning',
        weekday: 2,
        blocks: [
          block('tabata', [entry('burpee', {}, 'tabata'), entry('mountain-climber', {}, 'tabata')]),
          block('amrap', [
            entry('push-up', { reps: 10 }, 'amrap'),
            entry('bodyweight-squat', { reps: 15 }, 'amrap'),
            entry('kettlebell-swing', { reps: 12, targetWeight: 16 }, 'amrap'),
          ], { params: { timeCapMin: 10 } }),
          block('emom', [entry('kettlebell-swing', { reps: 15, targetWeight: 16 }, 'emom'), entry('burpee', { reps: 8 }, 'emom')], { params: { totalMin: 8, intervalSec: 60 } }),
        ],
      },
      {
        id: uid(),
        name: 'Lower body',
        weekday: 4,
        blocks: [
          block('sets_reps', [
            entry('back-squat', { sets: 4, reps: 6, targetWeight: 80, restSec: 150 }),
            entry('romanian-deadlift', { sets: 3, reps: 10, targetWeight: 60, restSec: 120 }),
            entry('walking-lunge', { sets: 3, reps: 12, targetWeight: 12, restSec: 30, grouping: 'circuit', groupLabel: 'B' }),
            entry('plank', { sets: 3, reps: undefined, durationSec: 45, restSec: 60, grouping: 'circuit', groupLabel: 'B' }),
          ]),
          block('intervals', [entry('rowing-machine', {}, 'intervals')], { name: 'Rower finisher' }),
        ],
      },
    ],
  };
}
