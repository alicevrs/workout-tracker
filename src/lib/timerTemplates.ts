// Saved timers (Workouts → Timers): preset Tabata / AMRAP / EMOM / For Time settings.
//
// A training block can take its timer from a saved timer (`Block.timerId`). Saving a timer
// updates every linked training block, and through those every workout that uses the block, so
// the next session uses the new times. Logged sessions keep their own copy and never change.

import type { WorkoutDB } from '../db/db';
import type { Block, TimerTemplate } from '../db/types';
import { paramsFromQuick, syncTemplate, withFormat } from './blockTemplates';
import { uid } from './ids';
import { defaultQuick, describeQuick, QUICK_LABEL, type QuickKind } from './timer/quick';

export const NEW_TIMER_NAME = 'New timer';
export const TIMER_KINDS: QuickKind[] = ['amrap', 'for_time', 'emom', 'tabata'];

/** Sets with a rest between them exist only for Tabata inside a training block. */
export function cleanTimer(t: TimerTemplate['timer']): TimerTemplate['timer'] {
  if (t.kind === 'tabata') return t;
  const { sets: _s, setRestSec: _r, ...rest } = t;
  void _s;
  void _r;
  return rest;
}

export function newTimerTemplate(kind: QuickKind = 'tabata'): TimerTemplate {
  const now = Date.now();
  const timer = cleanTimer(defaultQuick(kind) as TimerTemplate['timer']);
  return { id: uid(), name: autoTimerName(timer), timer, createdAt: now, updatedAt: now };
}

/** Name used until the user types one: format and settings. */
export const autoTimerName = (t: TimerTemplate['timer']) => `${QUICK_LABEL[t.kind]} ${describeQuick(t)}`;

export function duplicateTimer(t: TimerTemplate): TimerTemplate {
  const now = Date.now();
  return { ...structuredClone(t), id: uid(), name: `${t.name} (copy)`, createdAt: now, updatedAt: now };
}

/** The block counted by this timer (exercises, reps and weights are kept), linked to it. */
export function withTimer(b: Block, t: TimerTemplate): Block {
  const next = withFormat(b, t.timer.kind);
  return { ...next, params: paramsFromQuick(t.timer, next.params), timerId: t.id };
}

/** Copy the timer into every training block linked to it (and their workouts). Returns the number of blocks changed. */
export async function syncTimer(db: WorkoutDB, t: TimerTemplate): Promise<number> {
  const linked = await db.blockTemplates.filter((bt) => bt.block.timerId === t.id).toArray();
  for (const bt of linked) {
    const next = { ...bt, block: withTimer(bt.block, t), updatedAt: Date.now() };
    await db.blockTemplates.put(next);
    await syncTemplate(db, next);
  }
  return linked.length;
}

/** When a timer is deleted, its blocks keep their current times as their own. */
export async function unlinkTimer(db: WorkoutDB, timerId: string): Promise<void> {
  const linked = await db.blockTemplates.filter((bt) => bt.block.timerId === timerId).toArray();
  for (const bt of linked) {
    const block = { ...bt.block };
    delete block.timerId;
    const next = { ...bt, block, updatedAt: Date.now() };
    await db.blockTemplates.put(next);
    await syncTemplate(db, next);
  }
}
