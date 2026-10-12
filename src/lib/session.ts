import type { Block, ExerciseEntry, PerformedBlock, PerformedEntry, Program, ProgramDay, Session, SetRecord } from '../db/types';
import { toDateKey } from './dates';
import { uid } from './ids';
import { cloneBlock } from './program';

/** Formats whose sets are planned up front (one row per planned set). */
export function hasPlannedSets(format: Block['format']): boolean {
  return format === 'sets_reps' || format === 'timed_sets';
}

export function roundToPlate(kg: number): number {
  return Math.round(kg * 2) / 2;
}

export function plannedDropWeights(e: ExerciseEntry): number[] | undefined {
  if (e.grouping !== 'dropset' || !e.drops || !e.targetWeight) return undefined;
  const pct = (e.dropPercent ?? 20) / 100;
  const out: number[] = [];
  let w = e.targetWeight;
  for (let i = 0; i < e.drops; i++) {
    w = roundToPlate(w * (1 - pct));
    out.push(w);
  }
  return out;
}

export function plannedSet(e: ExerciseEntry, setNumber: number): SetRecord {
  const drops = plannedDropWeights(e);
  return {
    exerciseId: e.exerciseId,
    setNumber,
    reps: e.reps,
    weight: e.targetWeight,
    durationSec: e.durationSec,
    completed: false,
    dropWeights: drops,
    dropReps: drops ? drops.map(() => e.reps ?? 0) : undefined,
  };
}

export function entryToPerformed(e: ExerciseEntry, format: Block['format']): PerformedEntry {
  return {
    id: e.id,
    exerciseId: e.exerciseId,
    planned: structuredClone(e),
    sets: hasPlannedSets(format) ? Array.from({ length: e.sets }, (_, i) => plannedSet(e, i + 1)) : [],
  };
}

export function blockToPerformed(b: Block): PerformedBlock {
  return {
    id: b.id,
    name: b.name,
    format: b.format,
    params: structuredClone(b.params),
    timer: { ...b.timer },
    note: b.note,
    entries: b.entries.map((e) => entryToPerformed(e, b.format)),
  };
}

export function performedToBlock(pb: PerformedBlock): Block {
  return {
    id: pb.id,
    name: pb.name,
    format: pb.format,
    params: structuredClone(pb.params),
    timer: { ...pb.timer },
    note: pb.note,
    entries: pb.entries.map(
      (e) =>
        e.planned ?? {
          id: e.id,
          exerciseId: e.exerciseId,
          sets: Math.max(1, e.sets.length),
          reps: e.sets[0]?.reps,
          targetWeight: e.sets[0]?.weight,
          durationSec: e.sets[0]?.durationSec,
          restSec: 60,
          grouping: 'none',
        },
    ),
  };
}

/**
 * Apply an edited plan to a block that may already have logged sets.
 * Completed sets are kept; open sets follow the new plan.
 */
export function applyBlockEdit(pb: PerformedBlock, edited: Block): PerformedBlock {
  const formatChanged = pb.format !== edited.format;
  const entries = edited.entries.map((plan) => {
    const existing = formatChanged ? undefined : pb.entries.find((e) => e.id === plan.id);
    if (!existing || existing.exerciseId !== plan.exerciseId) return entryToPerformed(plan, edited.format);
    if (!hasPlannedSets(edited.format)) return { ...existing, planned: structuredClone(plan) };
    const sets: SetRecord[] = [];
    for (let i = 0; i < Math.max(plan.sets, existing.sets.length); i++) {
      const old = existing.sets[i];
      if (old && (old.completed || old.skipped)) sets.push(old);
      else if (i < plan.sets) sets.push(plannedSet(plan, i + 1));
    }
    return { ...existing, planned: structuredClone(plan), sets: sets.map((s, i) => ({ ...s, setNumber: i + 1 })) };
  });
  return {
    ...pb,
    name: edited.name,
    format: edited.format,
    params: structuredClone(edited.params),
    timer: { ...edited.timer },
    note: edited.note,
    entries,
  };
}

export function createSession(opts: { program?: Program; day?: ProgramDay; title?: string; now?: number }): Session {
  const now = opts.now ?? Date.now();
  // The session gets its own copy of the plan: edits here never change the program.
  const blocks = (opts.day?.blocks ?? []).map((b) => blockToPerformed(cloneBlock(b)));
  return {
    id: uid(),
    date: toDateKey(now),
    title: opts.title ?? opts.day?.name ?? 'Workout',
    status: 'in_progress',
    programId: opts.program?.id,
    programDayId: opts.day?.id,
    startedAt: now,
    blocks,
    intensity: 'moderate',
    source: 'manual',
    updatedAt: now,
  };
}

/** Exercise ids used in a session, in order of first appearance. */
export function sessionExerciseIds(s: Session): string[] {
  const ids: string[] = [];
  for (const b of s.blocks) for (const e of b.entries) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
  return ids;
}

export function sessionDurationSec(s: Session): number {
  if (s.endedAt) return Math.max(0, (s.endedAt - s.startedAt) / 1000);
  const blockTime = s.blocks.reduce((sum, b) => sum + (b.durationSec ?? 0), 0);
  return blockTime;
}
