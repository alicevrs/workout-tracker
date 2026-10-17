// Links a timer run to the logged session: completed work phases become logged sets,
// and each block gets its measured active time.

import type { PerformedBlock, SetRecord } from '../../db/types';
import type { CompletedPhase } from './engine';
import type { Phase } from './phases';

export type SetOverrides = Record<number, Partial<SetRecord>>;

/**
 * Apply completed phases (from index `from` onwards) to the blocks. Returns new block objects.
 * `overrides` holds values the user typed in the timer for a phase (keyed by phase index).
 */
export function applyCompleted(
  blocks: PerformedBlock[],
  phases: Phase[],
  completed: CompletedPhase[],
  from: number,
  overrides: SetOverrides = {},
): PerformedBlock[] {
  const out = structuredClone(blocks);

  for (const c of completed.slice(from)) {
    const p = phases[c.index];
    if (!p || p.kind !== 'work') continue;
    const b = out[p.blockIndex];
    if (!b) continue;
    const entry = p.entryId ? b.entries.find((e) => e.id === p.entryId) : undefined;
    const elapsedSec = Math.round(c.elapsedMs / 1000);
    const extra = overrides[c.index] ?? {};

    switch (b.format) {
      case 'sets_reps':
      case 'timed_sets': {
        if (!entry || !p.set) break;
        const set = entry.sets[p.set - 1];
        if (!set) break;
        if (p.drop) {
          if (c.skipped) break;
          const d = p.drop - 1;
          const weights = [...(set.dropWeights ?? [])];
          const reps = [...(set.dropReps ?? [])];
          weights[d] = extra.weight ?? weights[d] ?? p.targetWeight ?? 0;
          reps[d] = extra.reps ?? reps[d] ?? p.targetReps ?? 0;
          set.dropWeights = weights;
          set.dropReps = reps;
          break;
        }
        if (c.skipped) {
          if (!set.completed) set.skipped = true;
        } else {
          Object.assign(set, extra, { completed: true, skipped: false });
          if (p.durationSec !== null || set.durationSec !== undefined) set.durationSec = extra.durationSec ?? elapsedSec;
        }
        break;
      }
      case 'tabata':
      case 'intervals':
      case 'emom': {
        if (!entry || c.skipped) break;
        const isEmom = b.format === 'emom';
        entry.sets.push({
          exerciseId: entry.exerciseId,
          setNumber: entry.sets.length + 1,
          // Tabata / interval rounds keep the planned (approximate) reps, so they count in the volume.
          reps: p.targetReps,
          weight: p.targetWeight,
          durationSec: isEmom ? p.targetDurationSec : elapsedSec,
          warmup: p.warmup,
          toFailure: p.toFailure,
          completed: true,
          ...extra,
        });
        break;
      }
      case 'amrap':
      case 'for_time':
        b.result = { ...b.result, timeSec: elapsedSec };
        break;
    }
  }

  // Measured active time per block (prep excluded). Recomputed from the whole run, so it is idempotent.
  const touched = new Set<number>();
  const time = new Map<number, { ms: number; start: number; end: number }>();
  for (const c of completed) {
    const p = phases[c.index];
    if (!p) continue;
    touched.add(p.blockIndex);
    if (p.kind === 'prep') continue;
    const cur = time.get(p.blockIndex) ?? { ms: 0, start: Infinity, end: 0 };
    cur.ms += c.elapsedMs;
    cur.start = Math.min(cur.start, c.endedAt - c.elapsedMs);
    cur.end = Math.max(cur.end, c.endedAt);
    time.set(p.blockIndex, cur);
  }
  for (const i of touched) {
    const t = time.get(i);
    if (!t || !out[i]) continue;
    out[i].durationSec = Math.round(t.ms / 1000);
    out[i].startedAt = t.start;
    out[i].endedAt = t.end;
  }
  return out;
}
