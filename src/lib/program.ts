import type { Block, BlockFormat, BlockParams, ExerciseEntry, Grouping, Program, ProgramDay, TimerOptions } from '../db/types';
import { uid } from './ids';

export const FORMAT_INFO: Record<BlockFormat, { label: string; short: string; description: string }> = {
  sets_reps: { label: 'Sets × Reps', short: 'Sets×Reps', description: 'Sets of reps with a rest countdown between sets.' },
  timed_sets: { label: 'Timed sets', short: 'Timed', description: 'Sets of a fixed duration with rest between them.' },
  tabata: { label: 'Tabata', short: 'Tabata', description: 'Rounds of work and rest, classic 8 × 20 s / 10 s.' },
  amrap: { label: 'AMRAP', short: 'AMRAP', description: 'As many rounds as possible within a time cap.' },
  emom: { label: 'EMOM', short: 'EMOM', description: 'Start the work at the beginning of every interval.' },
  for_time: { label: 'For Time', short: 'For Time', description: 'Finish the target as fast as possible; optional time cap.' },
  intervals: { label: 'Intervals', short: 'Intervals', description: 'Custom work and rest segments with labels.' },
};

export const FORMATS = Object.keys(FORMAT_INFO) as BlockFormat[];

export const GROUPING_LABEL: Record<Grouping, string> = {
  none: 'None',
  superset: 'Superset',
  circuit: 'Circuit',
  dropset: 'Drop set',
};

export function defaultTimer(prepSec = 10): TimerOptions {
  return { prepSec, workLabel: 'Work', restLabel: 'Rest', sound: true, vibrate: true };
}

export function defaultParams(format: BlockFormat): BlockParams {
  switch (format) {
    case 'tabata':
      return { rounds: 8, workSec: 20, restSec: 10, extraSets: 0, restBetweenSetsSec: 60 };
    case 'amrap':
      return { timeCapMin: 12 };
    case 'emom':
      return { totalMin: 10, intervalSec: 60 };
    case 'for_time':
      return { targetRounds: 3, timeCapMin: 20 };
    case 'intervals':
      return {
        repeats: 5,
        segments: [
          { id: uid(), label: 'Work', kind: 'work', durationSec: 40, sound: true },
          { id: uid(), label: 'Rest', kind: 'rest', durationSec: 20, sound: true },
        ],
      };
    default:
      return {};
  }
}

export function newEntry(exerciseId: string, format: BlockFormat, defaultRestSec = 90): ExerciseEntry {
  const timed = format === 'timed_sets';
  const conditioning = format === 'amrap' || format === 'emom' || format === 'for_time' || format === 'tabata' || format === 'intervals';
  return {
    id: uid(),
    exerciseId,
    sets: conditioning ? 1 : 3,
    reps: timed || format === 'tabata' || format === 'intervals' ? undefined : 10,
    durationSec: timed ? 30 : undefined,
    restSec: conditioning ? 0 : timed ? 30 : defaultRestSec,
    grouping: 'none',
  };
}

export function newBlock(format: BlockFormat, prepSec = 10): Block {
  return { id: uid(), format, params: defaultParams(format), entries: [], timer: defaultTimer(prepSec) };
}

export function newDay(name: string): ProgramDay {
  return { id: uid(), name, blocks: [] };
}

export function newProgram(name = 'New program'): Program {
  const now = Date.now();
  return { id: uid(), name, days: [newDay('Day 1')], createdAt: now, updatedAt: now };
}

/** Deep copy with fresh ids, so the copy can be edited independently. */
export function cloneBlock(b: Block): Block {
  return {
    ...structuredClone(b),
    id: uid(),
    entries: b.entries.map((e) => ({ ...e, id: uid() })),
    params: {
      ...structuredClone(b.params),
      segments: b.params.segments?.map((s) => ({ ...s, id: uid() })),
    },
  };
}

export function cloneDay(d: ProgramDay, name = `${d.name} (copy)`): ProgramDay {
  return { ...structuredClone(d), id: uid(), name, blocks: d.blocks.map(cloneBlock) };
}

export function cloneProgram(p: Program, name = `${p.name} (copy)`): Program {
  const now = Date.now();
  return { ...structuredClone(p), id: uid(), name, days: p.days.map((d) => cloneDay(d, d.name)), createdAt: now, updatedAt: now };
}

export interface EntryGroup {
  kind: Grouping;
  label?: string;
  entries: ExerciseEntry[];
  /** Index of the first entry in the block. */
  start: number;
}

/**
 * Split a block's entries into groups. Consecutive superset/circuit entries with the same
 * group label form one group; everything else is its own group.
 */
export function groupEntries(entries: ExerciseEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  entries.forEach((e, i) => {
    const prev = groups[groups.length - 1];
    const joinable = e.grouping === 'superset' || e.grouping === 'circuit';
    if (joinable && prev && prev.kind === e.grouping && (prev.label ?? '') === (e.groupLabel ?? '')) {
      prev.entries.push(e);
    } else {
      groups.push({ kind: e.grouping, label: e.groupLabel, entries: [e], start: i });
    }
  });
  return groups;
}

export function tabataSets(params: BlockParams): number {
  return 1 + Math.max(0, params.extraSets ?? 0);
}

/** Approximate planned duration of a block in seconds (rep-based work counted as 40 s per set). */
export function estimateBlockSeconds(b: Block): number {
  const p = b.params;
  switch (b.format) {
    case 'tabata': {
      const sets = tabataSets(p);
      const perSet = (p.rounds ?? 8) * ((p.workSec ?? 20) + (p.restSec ?? 10));
      return sets * perSet + (sets - 1) * (p.restBetweenSetsSec ?? 0);
    }
    case 'amrap':
      return (p.timeCapMin ?? 0) * 60;
    case 'emom':
      return (p.totalMin ?? 0) * 60;
    case 'for_time':
      return (p.timeCapMin ?? 15) * 60;
    case 'intervals':
      return (p.repeats ?? 1) * (p.segments ?? []).reduce((s, x) => s + x.durationSec, 0);
    default:
      return b.entries.reduce((s, e) => s + e.sets * ((e.durationSec ?? 40) + e.restSec), 0);
  }
}

export function describeBlock(b: Block): string {
  const p = b.params;
  switch (b.format) {
    case 'tabata':
      return `${p.rounds} rounds · ${p.workSec}s on / ${p.restSec}s off${tabataSets(p) > 1 ? ` · ${tabataSets(p)} sets` : ''}`;
    case 'amrap':
      return `${p.timeCapMin} min AMRAP`;
    case 'emom':
      return `${p.totalMin} min · every ${p.intervalSec === 60 ? 'minute' : `${p.intervalSec}s`}`;
    case 'for_time':
      return `${p.targetRounds ? `${p.targetRounds} rounds` : p.targetReps ? `${p.targetReps} reps` : 'For time'}${p.timeCapMin ? ` · cap ${p.timeCapMin} min` : ''}`;
    case 'intervals':
      return `${p.segments?.length ?? 0} segments × ${p.repeats ?? 1}`;
    case 'timed_sets':
      return `${b.entries.length} exercise${b.entries.length === 1 ? '' : 's'} · timed sets`;
    default:
      return `${b.entries.length} exercise${b.entries.length === 1 ? '' : 's'} · ${b.entries.reduce((s, e) => s + e.sets, 0)} sets`;
  }
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0 = Monday … 6 = Sunday for a timestamp. */
export function weekdayIndex(ms: number = Date.now()): number {
  return (new Date(ms).getDay() + 6) % 7;
}
