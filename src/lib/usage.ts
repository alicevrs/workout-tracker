// Where a library item is used, so the user knows what a change will affect.

import type { WorkoutDB } from '../db/db';
import type { BlockTemplate, Program } from '../db/types';

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** Training blocks that contain this exercise. */
export async function blocksUsingExercise(db: WorkoutDB, exerciseId: string): Promise<BlockTemplate[]> {
  return (await db.blockTemplates.filter((t) => t.block.entries.some((e) => e.exerciseId === exerciseId)).toArray()).sort(byName);
}

/** Training blocks that take their timer from this saved timer. */
export async function blocksUsingTimer(db: WorkoutDB, timerId: string): Promise<BlockTemplate[]> {
  return (await db.blockTemplates.filter((t) => t.block.timerId === timerId).toArray()).sort(byName);
}

/** Workouts with a part linked to this training block. */
export async function workoutsUsingBlock(db: WorkoutDB, templateId: string): Promise<Program[]> {
  return (await db.programs.filter((p) => p.days.some((d) => d.blocks.some((b) => b.templateId === templateId))).toArray()).sort(byName);
}
