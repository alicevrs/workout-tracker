// "Log as done": record blocks as if they had been run with the timer, exactly as planned.
// Used for classes (e.g. Body Pump) where there is no time to log during the workout.

import type { PerformedBlock, Program, ProgramDay, Session } from '../db/types';
import { createSession } from './session';
import type { CompletedPhase } from './timer/engine';
import { applyCompleted } from './timer/link';
import { buildPhases } from './timer/phases';

/** Rep-based sets have no fixed duration; assume this long per set. */
export const DEFAULT_SET_SECONDS = 40;

/** Mark the given blocks as fully done. Returns new blocks and the total time it represents. */
export function completeBlocks(blocks: PerformedBlock[], indexes: number[], startAt: number): { blocks: PerformedBlock[]; seconds: number } {
  const phases = buildPhases(blocks, indexes).filter((p) => p.kind !== 'prep');
  let t = startAt;
  const completed: CompletedPhase[] = phases.map((p, index) => {
    const ms = (p.durationSec ?? DEFAULT_SET_SECONDS) * 1000;
    t += ms;
    return { index, elapsedMs: ms, endedAt: t, skipped: false };
  });
  const out = applyCompleted(blocks, phases, completed, 0);
  return { blocks: out, seconds: (t - startAt) / 1000 };
}

/** A finished session for a whole program day (every block, as planned), ending now (or at `endAt`). */
export function loggedDaySession(program: Program | undefined, day: ProgramDay, opts: { endAt?: number } = {}): Session {
  const draft = createSession({ program, day, now: 0 });
  const blocks = draft.blocks;
  const idx = blocks.map((b, i) => (b.skipped ? -1 : i)).filter((i) => i >= 0);
  const { seconds } = completeBlocks(blocks, idx, 0);
  const end = opts.endAt ?? Date.now();
  const start = end - Math.round(seconds) * 1000;
  const done = completeBlocks(blocks, idx, start);
  const s = createSession({ program, day, now: start });
  return { ...s, blocks: done.blocks, status: 'completed', endedAt: end, source: 'manual' };
}
