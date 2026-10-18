// Training blocks (stored as “block templates”): ready-made pieces of a workout built from one or
// more catalogue exercises, with how they are combined, how they are counted (reps or a timer),
// weights and notes. Shown in the app as “Training blocks”.
//
// Workout parts can be *linked* to a block (`Block.templateId`). Saving a block updates every
// linked part in the workout templates, so the next workout uses the new version. Logged
// sessions keep their own copy and never change.

import type { WorkoutDB } from '../db/db';
import { trackingOf } from '../db/repo';
import type { Block, BlockFormat, BlockParams, BlockTemplate, Exercise, ExerciseEntry, Grouping, LogField, Tracking } from '../db/types';
import { uid } from './ids';
import { cloneBlock, defaultParams, FORMAT_INFO, newBlock, newEntry } from './program';
import type { QuickTimer } from './timer/quick';

export const NEW_BLOCK_NAME = 'New training block';
/** Earlier default name, still treated as “not named yet”. */
export const OLD_BLOCK_NAME = 'New exercise block';

export function newBlockTemplate(format: BlockFormat = 'sets_reps', prepSec = 10, name = NEW_BLOCK_NAME): BlockTemplate {
  const now = Date.now();
  return { id: uid(), name, block: newBlock(format, prepSec), createdAt: now, updatedAt: now };
}

/** Save an existing block as a new template. */
export function templateFromBlock(block: Block, name = block.name ?? FORMAT_INFO[block.format].label): BlockTemplate {
  const now = Date.now();
  const copy = cloneBlock(block);
  delete copy.name;
  delete copy.templateId;
  return { id: uid(), name, block: copy, createdAt: now, updatedAt: now };
}

export function duplicateTemplate(t: BlockTemplate): BlockTemplate {
  const now = Date.now();
  return { ...structuredClone(t), id: uid(), name: `${t.name} (copy)`, block: cloneBlock(t.block), createdAt: now, updatedAt: now };
}

/** A workout part linked to the template (same content, its own block id). */
export function linkedBlock(t: BlockTemplate, id: string = uid()): Block {
  return { ...structuredClone(t.block), id, name: t.name, templateId: t.id };
}

/** @deprecated name kept for callers: inserting a template now links it. */
export const blockFromTemplate = (t: BlockTemplate) => linkedBlock(t);

/** Copy the template into every workout part linked to it. Returns the number of workouts changed. */
export async function syncTemplate(db: WorkoutDB, t: BlockTemplate): Promise<number> {
  let n = 0;
  await db.transaction('rw', db.programs, async () => {
    for (const p of await db.programs.toArray()) {
      let changed = false;
      const days = p.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          if (b.templateId !== t.id) return b;
          changed = true;
          return linkedBlock(t, b.id);
        }),
      }));
      if (changed) {
        n++;
        await db.programs.put({ ...p, days, updatedAt: Date.now() });
      }
    }
  });
  return n;
}

/**
 * Remove leftover empty blocks: no exercises, never named and not used by any workout. They were
 * created by “New block” before blocks needed a Save. Returns the number removed.
 */
export async function removeEmptyBlocks(db: WorkoutDB): Promise<number> {
  const used = new Set((await db.programs.toArray()).flatMap((p) => p.days.flatMap((d) => d.blocks.map((b) => b.templateId))));
  const empty = await db.blockTemplates
    .filter((t) => !t.block.entries.length && (t.name.trim() === '' || t.name === NEW_BLOCK_NAME || t.name === OLD_BLOCK_NAME) && !used.has(t.id))
    .primaryKeys();
  if (empty.length) await db.blockTemplates.bulkDelete(empty as string[]);
  return empty.length;
}

/** When a template is deleted, its linked parts keep their content as ordinary parts. */
export async function unlinkTemplate(db: WorkoutDB, templateId: string): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    for (const p of await db.programs.toArray()) {
      if (!p.days.some((d) => d.blocks.some((b) => b.templateId === templateId))) continue;
      const days = p.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.templateId === templateId ? { ...b, templateId: undefined } : b)) }));
      await db.programs.put({ ...p, days, updatedAt: Date.now() });
    }
  });
}

// ---------- Simple editor model ----------

/**
 * How the exercises are combined (also with a single exercise). “sequence” and “circuit” both go
 * through the exercises one after the other, rest, and repeat for each round (entries grouped as a
 * circuit); “circuit” is also logged with one tap in the workout (`Block.circuit`). “none” = each
 * exercise with its own sets.
 */
export type Structure = 'none' | 'sequence' | 'circuit';
export type CountBy = 'reps' | 'time';
/**
 * Timers to count by time, in the Timer tab's order. Timed sets is not offered for new blocks
 * (the Timer tab has no such timer); it stays selectable only on blocks that already use it.
 */
export const TIME_FORMATS: BlockFormat[] = ['amrap', 'for_time', 'emom', 'tabata', 'timed_sets'];
/** Grouping of the entries: one round-robin group when there are several exercises. */
const groupingFor = (n: number): { grouping: Grouping; groupLabel?: string } => (n > 1 ? { grouping: 'circuit', groupLabel: 'A' } : { grouping: 'none', groupLabel: undefined });

/** Formats where exercises can be in sequence, alternate or circuit. Timers like EMOM/Tabata take turns by themselves. */
export const hasStructure = (f: BlockFormat) => f === 'sets_reps' || f === 'timed_sets';

export function structureOf(b: Block): Structure {
  if (b.combine) return b.combine;
  if (b.circuit) return 'circuit';
  return b.entries.length > 1 && b.entries[0].grouping !== 'none' ? 'sequence' : 'none';
}

export const countByOf = (b: Block): CountBy => (b.format === 'sets_reps' ? 'reps' : 'time');

/** How an exercise is counted in a block: by reps (Weight × reps) or by time (Weight × time, Time and distance). */
export const exerciseCountBy = (e: Pick<Exercise, 'tracking'> | undefined): CountBy => (trackingOf(e) === 'weight_reps' ? 'reps' : 'time');

/** How a block's exercises are logged: chosen in the block; older blocks take it from their first exercise. */
export function blockLogAs(b: Block, exercises: Map<string, Exercise>): Tracking {
  if (b.logAs) return b.logAs;
  const first = b.entries[0];
  return first ? trackingOf(exercises.get(first.exerciseId)) : 'weight_reps';
}

// ---------- What a block logs: reps, time, distance (any combination) ----------

export const LOG_FIELDS: LogField[] = ['reps', 'time', 'distance'];
const TIMERS = new Set<BlockFormat>(['amrap', 'emom', 'tabata', 'for_time']);

/**
 * How each combination is set up:
 * reps → rounds and rest; reps + time → a saved timer (its rounds give the reps); time → one total
 * time for all the exercises, each with its reps and weight (run as one countdown);
 * distance → a distance (log the time); time + distance → one time (log the distance);
 * reps + distance → a distance in a number of reps with rest (log the time of each);
 * all three → a saved timer, logging the distance of each round.
 */
export type LogMode = 'R' | 'RT' | 'T' | 'D' | 'DT' | 'DR' | 'RTD';
export function logMode(log: LogField[]): LogMode {
  const r = log.includes('reps');
  const t = log.includes('time');
  const d = log.includes('distance');
  if (r && t && d) return 'RTD';
  if (r && t) return 'RT';
  if (d && t) return 'DT';
  if (d && r) return 'DR';
  if (d) return 'D';
  if (t) return 'T';
  return 'R';
}

/** What a block logs: its own choice, or (older blocks) derived from “Logged as” and its format. */
export function blockLog(b: Block, exercises: Map<string, Exercise>): LogField[] {
  if (b.log?.length) return b.log;
  const tracking = blockLogAs(b, exercises);
  const timer = TIMERS.has(b.format);
  if (tracking === 'time_distance') return timer ? ['reps', 'time', 'distance'] : b.format === 'timed_sets' ? ['time', 'distance'] : ['distance'];
  if (timer) return ['reps', 'time'];
  if (b.format === 'timed_sets' || tracking === 'weight_time') return ['time'];
  return ['reps'];
}

/** Time of each exercise for “time + distance” blocks. */
export const durationOf = (b: Block) => b.entries[0]?.durationSec ?? 60;
/** Total time of a “time” block (one countdown for all its exercises). */
export const totalTimeOf = (b: Block) => (b.format === 'amrap' ? Math.round((b.params.timeCapMin ?? 10) * 60) : durationOf(b));
/** One countdown of this length for all the exercises of a “time” block. */
export function withTotalTime(b: Block, sec: number): Block {
  const next = b.format === 'amrap' ? b : withFormat(b, 'amrap');
  return { ...next, params: { ...next.params, timeCapMin: sec / 60 } };
}
/** One timed set per exercise, all with this time. */
export function withDuration(b: Block, sec: number): Block {
  return { ...b, entries: b.entries.map((e) => ({ ...e, sets: 1, restSec: 0, durationSec: sec, setTargets: undefined })) };
}

/** Change what the block logs and set it up to match (keeps exercises, weights and targets). */
export function withLog(b: Block, log: LogField[]): Block {
  const mode = logMode(log);
  const unlinked: Block = { ...b, log };
  if (mode === 'RT' || mode === 'RTD') {
    // Counted by a saved timer: keep the current timer, or wait for one to be chosen.
    return TIMERS.has(b.format) ? unlinked : withFormat({ ...unlinked, timerId: undefined }, 'tabata');
  }
  delete unlinked.timerId;
  if (mode === 'T') return withTotalTime(unlinked, b.format === 'amrap' && !b.timerId ? totalTimeOf(b) : 600);
  if (mode === 'DT') return withDuration(withFormat(unlinked, 'timed_sets'), b.format === 'timed_sets' ? durationOf(b) : 60);
  const sets = withFormat(unlinked, 'sets_reps');
  return mode === 'D' ? withSetsRest(sets, 1, 0) : sets;
}

/**
 * Give older training blocks and workout parts their “log” (from their exercise's “Logged as” and
 * their format). Runs at start; only fills blocks without one. Returns how many were set.
 */
export async function migrateBlockLog(db: WorkoutDB): Promise<number> {
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const fill = (b: Block): Block => (b.log?.length || !b.entries.length ? b : { ...b, log: blockLog(b, exercises) });
  let n = 0;
  for (const t of await db.blockTemplates.toArray()) {
    const block = fill(t.block);
    if (block !== t.block) {
      n++;
      await db.blockTemplates.put({ ...t, block, updatedAt: Date.now() });
    }
  }
  for (const p of await db.programs.toArray()) {
    let changed = false;
    const days = p.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        const next = fill(b);
        if (next !== b) changed = true;
        return next;
      }),
    }));
    if (changed) {
      n++;
      await db.programs.put({ ...p, days, updatedAt: Date.now() });
    }
  }
  return n;
}

/** Reps (Weight × reps) or time (Weight × time, Time × distance). */
export const logCountBy = (t: Tracking): CountBy => (t === 'weight_reps' ? 'reps' : 'time');

/** How a block must be counted, from how it is logged. */
export function blockKind(b: Block, exercises: Map<string, Exercise>): CountBy {
  return logCountBy(blockLogAs(b, exercises));
}

/**
 * One-time move of “Logged as” from exercises to blocks: every training block and workout part
 * with exercises but no `logAs` gets the one of its first exercise. Returns how many were set.
 */
export async function migrateBlockLogAs(db: WorkoutDB): Promise<number> {
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const fill = (b: Block): Block => (b.logAs || !b.entries.length ? b : { ...b, logAs: blockLogAs(b, exercises) });
  let n = 0;
  await db.transaction('rw', db.blockTemplates, db.programs, async () => {
    for (const t of await db.blockTemplates.toArray()) {
      const block = fill(t.block);
      if (block !== t.block) {
        n++;
        await db.blockTemplates.put({ ...t, block, updatedAt: Date.now() });
      }
    }
    for (const p of await db.programs.toArray()) {
      let changed = false;
      const days = p.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          const next = fill(b);
          if (next !== b) changed = true;
          return next;
        }),
      }));
      if (changed) {
        n++;
        await db.programs.put({ ...p, days, updatedAt: Date.now() });
      }
    }
  });
  return n;
}

/** Settings the simple editor cannot show (intervals, drop sets, mixed groups): use the full editor. */
export function isAdvanced(b: Block): boolean {
  if (b.format === 'intervals') return true;
  const groups = new Set(b.entries.map((e) => e.grouping));
  if (groups.has('dropset') || groups.size > 1) return true;
  if (!groups.has('none') && new Set(b.entries.map((e) => e.groupLabel)).size > 1) return true;
  return false;
}

export const setsOf = (b: Block) => b.entries[0]?.sets ?? 3;
/** Rest after each set, or after each round when the exercises go round (it sits on the last one). */
export function restOf(b: Block): number {
  if (!b.entries.length) return 60;
  return b.entries[0].grouping === 'none' ? b.entries[0].restSec : b.entries[b.entries.length - 1].restSec;
}

/** Same number of sets for every exercise (unless it has per-set targets); rest after each set, or after each round when combined. */
export function withSetsRest(b: Block, sets: number, rest: number): Block {
  const n = b.entries.length;
  const round = n > 1 && b.entries[0].grouping !== 'none';
  return {
    ...b,
    entries: b.entries.map((e, i) => ({
      ...e,
      sets: e.setTargets?.length ? e.setTargets.length : sets,
      restSec: !round || i === n - 1 ? rest : 0,
    })),
  };
}

/**
 * How the exercises are combined, without touching sets or rest (blocks run by a timer: there it
 * only tells the order to follow).
 */
export function withGrouping(b: Block, s: Structure): Block {
  const g = s === 'none' ? { grouping: 'none' as const, groupLabel: undefined } : groupingFor(b.entries.length);
  const next: Block = { ...b, combine: s, entries: b.entries.map((e) => ({ ...e, ...g, drops: undefined, dropPercent: undefined })) };
  if (s === 'circuit') next.circuit = true;
  else delete next.circuit;
  return next;
}

export function withStructure(b: Block, s: Structure): Block {
  return withSetsRest(withGrouping(b, s), setsOf(b), restOf(b));
}

/** Switch how the block is counted (Sets × Reps or a timer format), keeping exercises, reps and weights. */
export function withFormat(b: Block, format: BlockFormat): Block {
  if (format === b.format) return b;
  const keepStructure = structureOf(b);
  // Coming from a timer (1 set, no rest) back to sets: start from sensible defaults.
  const fromSets = hasStructure(b.format);
  const sets = fromSets ? setsOf(b) : 3;
  const rest = fromSets ? restOf(b) : format === 'timed_sets' ? 30 : 60;
  const entries: ExerciseEntry[] = b.entries.map((e) => {
    const fresh = newEntry(e.exerciseId, format, rest);
    return {
      ...fresh,
      id: e.id,
      // Keep how the exercises are combined (a timer keeps it as information only).
      grouping: e.grouping === 'dropset' ? fresh.grouping : e.grouping,
      groupLabel: e.grouping === 'dropset' ? undefined : e.groupLabel,
      reps: e.reps ?? fresh.reps,
      targetWeight: e.targetWeight,
      durationSec: format === 'timed_sets' ? e.durationSec ?? 30 : e.durationSec,
      setTargets: format === 'sets_reps' || format === 'timed_sets' || format === 'emom' ? e.setTargets : undefined,
    };
  });
  const next: Block = { ...b, format, params: defaultParams(format), entries };
  return hasStructure(format) ? withSetsRest(withStructure(next, keepStructure), sets, rest) : next;
}

export function addExercise(b: Block, exerciseId: string, defaultRest: number): Block {
  const e = newEntry(exerciseId, b.format, defaultRest);
  const rest = b.entries.length ? restOf(b) : defaultRest;
  const next = withGrouping({ ...b, entries: [...b.entries, { ...e, sets: setsOf(b) }] }, structureOf(b));
  return hasStructure(b.format) ? withSetsRest(next, setsOf(b), rest) : next;
}

/**
 * One-time change of meaning (user's choice): “In sequence” now means going through the exercises
 * one after the other and repeating per round. Training blocks with several exercises still set
 * as straight sets (one exercise after the other) or alternating become rounds, keeping their sets
 * and rest; their workouts follow. Blocks with drop sets or several groups are left alone.
 */
export async function migrateBlockStructure(db: WorkoutDB): Promise<number> {
  let n = 0;
  for (const t of await db.blockTemplates.toArray()) {
    const b = t.block;
    // Blocks whose combination was chosen with the current editor are left as they are.
    if (b.combine || b.entries.length < 2 || b.entries.every((e) => e.grouping === 'circuit')) continue;
    if (b.entries.some((e) => e.grouping === 'dropset') || new Set(b.entries.map((e) => e.groupLabel ?? '')).size > 1) continue;
    const block = hasStructure(b.format) ? withSetsRest(withGrouping(b, 'sequence'), setsOf(b), restOf(b)) : withGrouping(b, 'sequence');
    const next = { ...t, block, updatedAt: Date.now() };
    await db.blockTemplates.put(next);
    await syncTemplate(db, next);
    n++;
  }
  return n;
}

/** Timer settings of a Tabata / AMRAP / EMOM / For Time block, in the Timer tab's shape. */
export function quickFromParams(format: BlockFormat, p: BlockParams): QuickTimer {
  const sets = { sets: 1 + (p.extraSets ?? 0), setRestSec: p.restBetweenSetsSec ?? 120 };
  switch (format) {
    case 'tabata':
      return { kind: 'tabata', rounds: p.rounds ?? 8, workSec: p.workSec ?? 20, restSec: p.restSec ?? 10, sets: 1 + (p.extraSets ?? 0), setRestSec: p.restBetweenSetsSec ?? 60 };
    case 'amrap':
      return { kind: 'amrap', minutes: p.timeCapMin ?? 10, ...sets };
    case 'emom':
      return { kind: 'emom', everySec: p.intervalSec ?? 60, minutes: p.totalMin ?? 10, ...sets };
    default:
      return { kind: 'for_time', minutes: p.timeCapMin ?? 0, everySec: p.signalEverySec ?? 0, ...sets };
  }
}

export function paramsFromQuick(q: QuickTimer, p: BlockParams): BlockParams {
  const extra = Math.max(0, (q.sets ?? 1) - 1);
  const sets = { extraSets: extra || undefined, restBetweenSetsSec: extra ? q.setRestSec : undefined };
  switch (q.kind) {
    case 'tabata':
      return { ...p, rounds: q.rounds, workSec: q.workSec, restSec: q.restSec, extraSets: extra, restBetweenSetsSec: q.setRestSec };
    case 'amrap':
      return { ...p, timeCapMin: q.minutes, ...sets };
    case 'emom':
      return { ...p, intervalSec: q.everySec, totalMin: q.minutes, ...sets };
    case 'for_time':
      return { ...p, timeCapMin: q.minutes || undefined, signalEverySec: q.everySec || undefined, ...sets };
    default:
      return p;
  }
}
