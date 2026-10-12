// Workouts = reusable workout templates. Each one is stored as a Program with exactly one day
// (so sessions keep pointing at programId/programDayId as before). Older multi-day programs
// are split into one workout per day.

import type { WorkoutDB } from '../db/db';
import type { Program, ProgramDay } from '../db/types';
import { uid } from './ids';
import { newDay } from './program';

/** Names used by the first version of the personal template, mapped to the new workout names. */
const RENAME: Record<string, string> = {
  'Abs + incline walk': 'Abs + cardio',
  'Legs & glutes A': 'Legs & glutes 1',
  'Legs & glutes B': 'Legs & glutes 2',
};

export function workoutFromDay(day: ProgramDay, name = day.name, notes?: string, id: string = uid()): Program {
  const now = Date.now();
  return { id, name, notes, days: [{ ...day, name, weekday: undefined }], createdAt: now, updatedAt: now };
}

export function newWorkout(name = 'New workout'): Program {
  return workoutFromDay(newDay(name), name);
}

/** The workout's single day (creates an empty one if missing). */
export function workoutDay(p: Program): ProgramDay {
  return p.days[0] ?? newDay(p.name);
}

/** Split a multi-day program into single-day workouts; days with the same name are kept once. */
export function splitProgram(p: Program): Program[] {
  if (p.days.length <= 1) return [p];
  const seen = new Set<string>();
  const out: Program[] = [];
  for (const d of p.days) {
    const name = (p.name === 'My training week' && RENAME[d.name]) || d.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(workoutFromDay(d, name, undefined, out.length === 0 ? p.id : uid()));
  }
  return out;
}

/** Run at startup and after a backup import. Safe to run repeatedly. */
export async function migrateProgramsToWorkouts(db: WorkoutDB): Promise<number> {
  const multi = await db.programs.filter((p) => p.days.length > 1).toArray();
  if (!multi.length) return 0;
  await db.transaction('rw', db.programs, async () => {
    for (const p of multi) {
      await db.programs.delete(p.id);
      await db.programs.bulkPut(splitProgram(p));
    }
  });
  return multi.length;
}
