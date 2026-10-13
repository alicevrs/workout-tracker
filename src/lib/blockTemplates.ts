// Training blocks (stored as “block templates”): ready-made pieces of a workout built from one or
// more catalogue exercises, with how they are combined, how they are counted (reps or a timer),
// weights and notes. Shown in the app as “Training blocks”.
//
// Workout parts can be *linked* to a block (`Block.templateId`). Saving a block updates every
// linked part in the workout templates, so the next workout uses the new version. Logged
// sessions keep their own copy and never change.

import type { WorkoutDB } from '../db/db';
import type { Block, BlockFormat, BlockParams, BlockTemplate, ExerciseEntry, Grouping } from '../db/types';
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

/** How several exercises are combined. */
export type Structure = 'sequence' | 'alternate' | 'circuit';
export type CountBy = 'reps' | 'time';
/**
 * Timers to count by time, in the Timer tab's order. Timed sets is not offered for new blocks
 * (the Timer tab has no such timer); it stays selectable only on blocks that already use it.
 */
export const TIME_FORMATS: BlockFormat[] = ['amrap', 'for_time', 'emom', 'tabata', 'timed_sets'];
const GROUPING: Record<Structure, Grouping> = { sequence: 'none', alternate: 'superset', circuit: 'circuit' };

/** Formats where exercises can be in sequence, alternate or circuit. Timers like EMOM/Tabata take turns by themselves. */
export const hasStructure = (f: BlockFormat) => f === 'sets_reps' || f === 'timed_sets';

export function structureOf(b: Block): Structure {
  const g = b.entries[0]?.grouping;
  return g === 'superset' ? 'alternate' : g === 'circuit' ? 'circuit' : 'sequence';
}

export const countByOf = (b: Block): CountBy => (b.format === 'sets_reps' ? 'reps' : 'time');

/** Settings the simple editor cannot show (intervals, drop sets, mixed groups): use the full editor. */
export function isAdvanced(b: Block): boolean {
  if (b.format === 'intervals') return true;
  const groups = new Set(b.entries.map((e) => e.grouping));
  if (groups.has('dropset') || groups.size > 1) return true;
  if (!groups.has('none') && new Set(b.entries.map((e) => e.groupLabel)).size > 1) return true;
  return false;
}

export const setsOf = (b: Block) => b.entries[0]?.sets ?? 3;
export function restOf(b: Block): number {
  if (!b.entries.length) return 60;
  return structureOf(b) === 'sequence' ? b.entries[0].restSec : b.entries[b.entries.length - 1].restSec;
}

/** Same number of sets for every exercise (unless it has per-set targets); rest after each set, or after each round when combined. */
export function withSetsRest(b: Block, sets: number, rest: number): Block {
  const s = structureOf(b);
  const n = b.entries.length;
  return {
    ...b,
    entries: b.entries.map((e, i) => ({
      ...e,
      sets: e.setTargets?.length ? e.setTargets.length : sets,
      restSec: s === 'sequence' || i === n - 1 ? rest : 0,
    })),
  };
}

export function withStructure(b: Block, s: Structure): Block {
  const sets = setsOf(b);
  const rest = restOf(b);
  const grouped: Block = {
    ...b,
    entries: b.entries.map((e) => ({ ...e, grouping: GROUPING[s], groupLabel: s === 'sequence' ? undefined : 'A', drops: undefined, dropPercent: undefined })),
  };
  return withSetsRest(grouped, sets, rest);
}

/** Switch how the block is counted (Sets × Reps or a timer format), keeping exercises, reps and weights. */
export function withFormat(b: Block, format: BlockFormat): Block {
  if (format === b.format) return b;
  const keepStructure = hasStructure(format) ? structureOf(b) : 'sequence';
  // Coming from a timer (1 set, no rest) back to sets: start from sensible defaults.
  const fromSets = hasStructure(b.format);
  const sets = fromSets ? setsOf(b) : 3;
  const rest = fromSets ? restOf(b) : format === 'timed_sets' ? 30 : 60;
  const entries: ExerciseEntry[] = b.entries.map((e) => {
    const fresh = newEntry(e.exerciseId, format, rest);
    return {
      ...fresh,
      id: e.id,
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
  const s = structureOf(b);
  const next: Block = { ...b, entries: [...b.entries, { ...e, sets: setsOf(b), grouping: GROUPING[s], groupLabel: s === 'sequence' ? undefined : 'A' }] };
  return hasStructure(b.format) ? withSetsRest(next, setsOf(b), b.entries.length ? restOf(b) : defaultRest) : next;
}

/** Timer settings of a Tabata / AMRAP / EMOM / For Time block, in the Timer tab's shape. */
export function quickFromParams(format: BlockFormat, p: BlockParams): QuickTimer {
  switch (format) {
    case 'tabata':
      return { kind: 'tabata', rounds: p.rounds ?? 8, workSec: p.workSec ?? 20, restSec: p.restSec ?? 10, sets: 1 + (p.extraSets ?? 0), setRestSec: p.restBetweenSetsSec ?? 60 };
    case 'amrap':
      return { kind: 'amrap', minutes: p.timeCapMin ?? 10 };
    case 'emom':
      return { kind: 'emom', everySec: p.intervalSec ?? 60, minutes: p.totalMin ?? 10 };
    default:
      return { kind: 'for_time', minutes: p.timeCapMin ?? 0, everySec: p.signalEverySec ?? 0 };
  }
}

export function paramsFromQuick(q: QuickTimer, p: BlockParams): BlockParams {
  switch (q.kind) {
    case 'tabata':
      return { ...p, rounds: q.rounds, workSec: q.workSec, restSec: q.restSec, extraSets: Math.max(0, (q.sets ?? 1) - 1), restBetweenSetsSec: q.setRestSec };
    case 'amrap':
      return { ...p, timeCapMin: q.minutes };
    case 'emom':
      return { ...p, intervalSec: q.everySec, totalMin: q.minutes };
    case 'for_time':
      return { ...p, timeCapMin: q.minutes || undefined, signalEverySec: q.everySec || undefined };
    default:
      return p;
  }
}
