import type { Block, ExerciseEntry, PerformedBlock, PerformedEntry, Program, ProgramDay, Session, SetRecord, SetTarget } from '../db/types';
import { toDateKey } from './dates';
import { uid } from './ids';
import { cloneBlock, FORMAT_INFO, splitsSets, timerSets } from './program';

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

/** Effective target of set n (1-based): per-set target if given, otherwise the entry's values. */
export function setTarget(e: ExerciseEntry, setNumber: number): SetTarget {
  const t = e.setTargets?.[setNumber - 1];
  return {
    reps: t?.toFailure ? t.reps : t?.reps ?? e.reps,
    weight: t?.weight ?? e.targetWeight,
    durationSec: t?.durationSec ?? e.durationSec,
    warmup: t?.warmup,
    toFailure: t?.toFailure,
  };
}

export function entrySets(e: ExerciseEntry): number {
  return e.setTargets?.length || e.sets;
}

export function plannedSet(e: ExerciseEntry, setNumber: number): SetRecord {
  const drops = plannedDropWeights(e);
  const t = setTarget(e, setNumber);
  return {
    exerciseId: e.exerciseId,
    setNumber,
    reps: t.reps,
    weight: t.weight,
    durationSec: t.durationSec,
    completed: false,
    warmup: t.warmup || undefined,
    toFailure: t.toFailure || undefined,
    dropWeights: drops,
    dropReps: drops ? drops.map(() => e.reps ?? 0) : undefined,
  };
}

export function entryToPerformed(e: ExerciseEntry, format: Block['format']): PerformedEntry {
  return {
    id: e.id,
    exerciseId: e.exerciseId,
    planned: structuredClone(e),
    sets: hasPlannedSets(format) ? Array.from({ length: entrySets(e) }, (_, i) => plannedSet(e, i + 1)) : [],
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
    logAs: b.logAs,
    entries: b.entries.map((e) => entryToPerformed(e, b.format)),
  };
}

export function performedToBlock(pb: PerformedBlock): Block {
  return {
    id: pb.id,
    name: pb.name,
    optional: pb.optional,
    format: pb.format,
    params: structuredClone(pb.params),
    timer: { ...pb.timer },
    note: pb.note,
    logAs: pb.logAs,
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
    const n = entrySets(plan);
    for (let i = 0; i < Math.max(n, existing.sets.length); i++) {
      const old = existing.sets[i];
      if (old && (old.completed || old.skipped)) sets.push(old);
      else if (i < n) sets.push(plannedSet(plan, i + 1));
    }
    return { ...existing, planned: structuredClone(plan), sets: sets.map((s, i) => ({ ...s, setNumber: i + 1 })) };
  });
  return {
    ...pb,
    name: edited.name,
    optional: edited.optional,
    format: edited.format,
    params: structuredClone(edited.params),
    timer: { ...edited.timer },
    note: edited.note,
    logAs: edited.logAs,
    entries,
  };
}

/**
 * AMRAP, EMOM and For Time with sets become one block per set, each after a “Set rest”, the way
 * the Timer tab runs them; so the timer, results and history work per set without changes.
 */
export function splitTimerSets(b: Block): Block[] {
  const sets = timerSets(b);
  if (!splitsSets(b.format) || sets < 2) return [b];
  const name = b.name ?? FORMAT_INFO[b.format].label;
  const one: Block = { ...b, params: { ...b.params } };
  delete one.params.extraSets;
  delete one.params.restBetweenSetsSec;
  return Array.from({ length: sets }, (_, i) => {
    const copy = i === 0 ? one : { ...cloneBlock(one), timer: { ...one.timer, prepSec: 0, restBeforeSec: b.params.restBetweenSetsSec ?? 0, restBeforeLabel: 'Set rest' } };
    if (i > 0 && !copy.timer.restBeforeSec) {
      delete copy.timer.restBeforeSec;
      delete copy.timer.restBeforeLabel;
    }
    return { ...copy, name: `${name} · set ${i + 1}/${sets}` };
  });
}

export function createSession(opts: { program?: Program; day?: ProgramDay; title?: string; now?: number }): Session {
  const now = opts.now ?? Date.now();
  // The session gets its own copy of the plan: edits here never change the program.
  const blocks = (opts.day?.blocks ?? []).flatMap((b) => splitTimerSets(cloneBlock(b))).map(blockToPerformed);
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
