import type { BlockFormat, ExerciseEntry, PerformedBlock } from '../../db/types';
import { groupEntries, tabataSets } from '../program';
import { plannedDropWeights } from '../session';

export type PhaseKind = 'prep' | 'work' | 'rest';

export interface Phase {
  kind: PhaseKind;
  /** Big label, e.g. "Work", "Rest", "Get ready", "Min 3". */
  label: string;
  /** null = open-ended: the phase ends when the user taps Done/Finish. */
  durationSec: number | null;
  /** Show elapsed time instead of remaining time. */
  countUp: boolean;
  sound: boolean;
  vibrate: boolean;
  blockIndex: number;
  blockId: string;
  format: BlockFormat;
  entryId?: string;
  exerciseId?: string;
  set?: number;
  totalSets?: number;
  round?: number;
  totalRounds?: number;
  interval?: number;
  totalIntervals?: number;
  /** Drop number (1…n) for drop-set continuation phases. */
  drop?: number;
  targetReps?: number;
  /** kg */
  targetWeight?: number;
  targetDurationSec?: number;
}

type Base = Pick<Phase, 'blockIndex' | 'blockId' | 'format' | 'sound' | 'vibrate'>;

function entryInfo(e: ExerciseEntry | undefined): Partial<Phase> {
  if (!e) return {};
  return { entryId: e.id, exerciseId: e.exerciseId, targetReps: e.reps, targetWeight: e.targetWeight, targetDurationSec: e.durationSec };
}

/** Build the phases for one block. */
export function blockPhases(block: PerformedBlock, blockIndex: number): Phase[] {
  const t = block.timer;
  const base: Base = { blockIndex, blockId: block.id, format: block.format, sound: t.sound, vibrate: t.vibrate };
  const entries = block.entries.map((e) => e.planned).filter((e): e is ExerciseEntry => !!e);
  const p = block.params;
  const out: Phase[] = [];
  const work = (extra: Partial<Phase>, durationSec: number | null, countUp = false): Phase => ({
    ...base,
    kind: 'work',
    label: t.workLabel || 'Work',
    durationSec,
    countUp,
    ...extra,
  });
  const rest = (durationSec: number, label = t.restLabel || 'Rest', extra: Partial<Phase> = {}): Phase => ({
    ...base,
    kind: 'rest',
    label,
    durationSec,
    countUp: false,
    ...extra,
  });

  if (t.prepSec > 0) out.push({ ...base, kind: 'prep', label: 'Get ready', durationSec: t.prepSec, countUp: false });

  switch (block.format) {
    case 'sets_reps':
    case 'timed_sets': {
      const timed = block.format === 'timed_sets';
      const workDuration = (e: ExerciseEntry) => (timed ? e.durationSec ?? 30 : e.durationSec ?? null);
      for (const g of groupEntries(entries)) {
        if (g.kind === 'superset' || g.kind === 'circuit') {
          const rounds = Math.max(...g.entries.map((e) => e.sets));
          for (let r = 1; r <= rounds; r++) {
            const active = g.entries.filter((e) => r <= e.sets);
            active.forEach((e, k) => {
              out.push(work({ ...entryInfo(e), set: r, totalSets: e.sets, round: r, totalRounds: rounds }, workDuration(e)));
              const last = k === active.length - 1;
              if (g.kind === 'circuit' && !last && e.restSec > 0) out.push(rest(e.restSec, 'Transition'));
            });
            const lastEntry = active[active.length - 1];
            if (lastEntry.restSec > 0) out.push(rest(lastEntry.restSec));
          }
        } else {
          for (const e of g.entries) {
            const drops = plannedDropWeights(e) ?? [];
            for (let s = 1; s <= e.sets; s++) {
              out.push(work({ ...entryInfo(e), set: s, totalSets: e.sets }, workDuration(e)));
              drops.forEach((w, d) => out.push(work({ ...entryInfo(e), set: s, totalSets: e.sets, drop: d + 1, targetWeight: w, label: `Drop ${d + 1}` }, null)));
              if (e.restSec > 0) out.push(rest(e.restSec));
            }
          }
        }
      }
      break;
    }
    case 'tabata': {
      const rounds = Math.max(1, p.rounds ?? 8);
      const sets = tabataSets(p);
      for (let s = 1; s <= sets; s++) {
        for (let r = 1; r <= rounds; r++) {
          const e = entries.length ? entries[(r - 1) % entries.length] : undefined;
          out.push(work({ ...entryInfo(e), round: r, totalRounds: rounds, set: s, totalSets: sets, targetDurationSec: p.workSec }, p.workSec ?? 20));
          if (r < rounds && (p.restSec ?? 0) > 0) out.push(rest(p.restSec ?? 10, t.restLabel || 'Rest', { round: r, totalRounds: rounds, set: s, totalSets: sets }));
        }
        if (s < sets && (p.restBetweenSetsSec ?? 0) > 0) out.push(rest(p.restBetweenSetsSec ?? 60, 'Set rest', { set: s, totalSets: sets }));
      }
      break;
    }
    case 'amrap':
      out.push(work({ label: 'AMRAP' }, Math.max(1, (p.timeCapMin ?? 10) * 60)));
      break;
    case 'emom': {
      const interval = Math.max(5, p.intervalSec ?? 60);
      const count = Math.max(1, Math.floor(((p.totalMin ?? 10) * 60) / interval));
      for (let i = 1; i <= count; i++) {
        const e = entries.length ? entries[(i - 1) % entries.length] : undefined;
        out.push(work({ ...entryInfo(e), interval: i, totalIntervals: count, label: interval === 60 ? `Minute ${i}` : `Interval ${i}` }, interval));
      }
      break;
    }
    case 'for_time':
      out.push(work({ label: 'For time' }, p.timeCapMin ? p.timeCapMin * 60 : null, true));
      break;
    case 'intervals': {
      const segs = p.segments ?? [];
      const repeats = Math.max(1, p.repeats ?? 1);
      let workIndex = 0;
      for (let r = 1; r <= repeats; r++) {
        for (const seg of segs) {
          if (seg.durationSec <= 0) continue;
          const common = { round: r, totalRounds: repeats, sound: seg.sound !== false && t.sound, label: seg.label };
          if (seg.kind === 'work') {
            const e = entries.length ? entries[workIndex % entries.length] : undefined;
            workIndex++;
            out.push(work({ ...entryInfo(e), ...common, targetDurationSec: seg.durationSec }, seg.durationSec));
          } else out.push(rest(seg.durationSec, seg.label, common));
        }
      }
      break;
    }
  }

  // Never end a block on a rest.
  while (out.length && out[out.length - 1].kind === 'rest') out.pop();
  return out;
}

/** Phases for several blocks run back to back (a mixed workout). */
export function buildPhases(blocks: PerformedBlock[], indexes?: number[]): Phase[] {
  const which = indexes ?? blocks.map((_, i) => i);
  return which.flatMap((i) => blockPhases(blocks[i], i));
}

export function totalPlannedSeconds(phases: Phase[]): number {
  return phases.reduce((s, p) => s + (p.durationSec ?? 0), 0);
}
