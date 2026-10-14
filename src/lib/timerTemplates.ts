// Saved timers (Workouts → Timers): preset Tabata / AMRAP / EMOM / For Time settings.
//
// A training block can take its timer from a saved timer (`Block.timerId`). Saving a timer
// updates every linked training block, and through those every workout that uses the block, so
// the next session uses the new times. Logged sessions keep their own copy and never change.

import type { WorkoutDB } from '../db/db';
import type { Block, TimerTemplate } from '../db/types';
import { paramsFromQuick, quickFromParams, syncTemplate, withFormat } from './blockTemplates';
import { uid } from './ids';
import { defaultQuick, describeQuick, QUICK_LABEL, type QuickKind } from './timer/quick';

export const NEW_TIMER_NAME = 'New timer';
export const TIMER_KINDS: QuickKind[] = ['amrap', 'for_time', 'emom', 'tabata'];

export function newTimerTemplate(kind: QuickKind = 'tabata'): TimerTemplate {
  const now = Date.now();
  const timer = defaultQuick(kind) as TimerTemplate['timer'];
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

const TIMER_FORMATS = new Set<string>(TIMER_KINDS);

/** Same id for the same settings on every device, so two devices running the conversion agree. */
function autoTimerId(timer: TimerTemplate['timer']): string {
  const text = JSON.stringify(timer);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `auto-${timer.kind}-${h.toString(36)}`;
}

/**
 * One-time conversion: every training block counted by a timer (Tabata, AMRAP, EMOM, For Time)
 * that is not linked to a saved timer gets one, built from its own settings (blocks with the
 * same settings share it), and is linked to it. Returns the number of timers created.
 */
export async function timersFromBlocks(db: WorkoutDB): Promise<number> {
  const blocks = await db.blockTemplates.filter((bt) => TIMER_FORMATS.has(bt.block.format) && !bt.block.timerId).toArray();
  let created = 0;
  for (const bt of blocks) {
    const timer = quickFromParams(bt.block.format, bt.block.params) as TimerTemplate['timer'];
    if (timer.sets === 1) {
      delete timer.sets;
      delete timer.setRestSec;
    }
    const id = autoTimerId(timer);
    let t = await db.timerTemplates.get(id);
    if (!t) {
      const now = Date.now();
      t = { id, name: autoTimerName(timer), timer, createdAt: now, updatedAt: now };
      await db.timerTemplates.add(t);
      created++;
    }
    const next = { ...bt, block: withTimer(bt.block, t), updatedAt: Date.now() };
    await db.blockTemplates.put(next);
    await syncTemplate(db, next);
  }
  return created;
}

const CONVERTED = 'migrations:timersFromBlocks';

/** Run the conversion once per device (later the user may unlink blocks on purpose). */
export async function timersFromBlocksOnce(db: WorkoutDB): Promise<void> {
  try {
    if (localStorage.getItem(CONVERTED)) return;
  } catch {
    return;
  }
  await timersFromBlocks(db);
  try {
    localStorage.setItem(CONVERTED, String(Date.now()));
  } catch {
    /* ignore */
  }
}
