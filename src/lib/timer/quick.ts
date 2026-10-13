// Quick timers on the Timer tab: a few big settings per format (SmartWOD-style), turned into
// ordinary blocks so the normal timer engine runs them. They are plain timers: nothing is logged.

import type { Block, BlockFormat } from '../../db/types';
import { estimateBlockSeconds, newBlock } from '../program';
import { uid } from '../ids';

export type QuickKind = 'amrap' | 'for_time' | 'emom' | 'tabata';
export type MixItemKind = QuickKind | 'work' | 'rest';

export interface QuickTimer {
  kind: MixItemKind;
  /** AMRAP length, EMOM total, For Time cap (0 = no cap). */
  minutes?: number;
  /** EMOM interval; For Time signal (0 = none). */
  everySec?: number;
  /** Tabata. */
  rounds?: number;
  /** Tabata work, Work item length. */
  workSec?: number;
  /** Tabata rest, Rest item length. */
  restSec?: number;
  /** Optional sets: repeat the whole timer with a rest between. */
  sets?: number;
  setRestSec?: number;
  /** Work item label, e.g. “Plank”. */
  label?: string;
}

export interface MixConfig {
  items: QuickTimer[];
  repeat: number;
}

export const QUICK_LABEL: Record<MixItemKind | 'mix', string> = {
  amrap: 'AMRAP',
  for_time: 'For Time',
  emom: 'EMOM',
  tabata: 'Tabata',
  work: 'Work',
  rest: 'Rest',
  mix: 'Mix',
};

export const TIMER_INFO: Record<QuickKind | 'mix', { tagline: string; text: string[] }> = {
  amrap: {
    tagline: 'As many rounds as possible',
    text: [
      'Set a time cap and repeat the same round of exercises as many times as you can before the clock runs out.',
      'Tap the round counter every time you finish a round: the timer shows your last round time and saves the total. Next time, try to beat it with the same workout.',
    ],
  },
  for_time: {
    tagline: 'Race the clock',
    text: [
      'Do a fixed amount of work as fast as you can. The clock counts up and your time is your score.',
      'A time cap is optional: the timer stops there if you are not done. Tap Finish as soon as you complete the work. An optional signal every few minutes helps you pace yourself.',
    ],
  },
  emom: {
    tagline: 'Every minute on the minute',
    text: [
      'At the start of every interval (usually one minute) do the planned reps. Whatever time is left is your rest until the next interval begins.',
      'The faster you finish, the more you rest. “Every 2 min for 12 min” means 6 intervals of 2 minutes.',
    ],
  },
  tabata: {
    tagline: 'Work / rest intervals',
    text: [
      'Short all-out work followed by a short rest, repeated for a number of rounds. The classic Tabata is 8 rounds of 20 seconds work and 10 seconds rest (4 minutes).',
      'Add sets to repeat the whole Tabata with a longer rest between sets.',
    ],
  },
  mix: {
    tagline: 'Combine every format',
    text: [
      'Chain AMRAP, EMOM, Tabata and For Time blocks, plus single work or rest periods, into one session that runs from start to finish without stopping.',
      'Use Repeat to run the whole sequence several times.',
    ],
  },
};

export function defaultQuick(kind: MixItemKind): QuickTimer {
  switch (kind) {
    case 'amrap':
      return { kind, minutes: 10, sets: 1, setRestSec: 120 };
    case 'for_time':
      return { kind, minutes: 0, everySec: 0, sets: 1, setRestSec: 120 };
    case 'emom':
      return { kind, everySec: 60, minutes: 10, sets: 1, setRestSec: 120 };
    case 'tabata':
      return { kind, rounds: 8, workSec: 20, restSec: 10, sets: 1, setRestSec: 60 };
    case 'work':
      return { kind, workSec: 60 };
    case 'rest':
      return { kind, restSec: 60 };
  }
}

export function defaultMix(): MixConfig {
  return { items: [defaultQuick('amrap'), defaultQuick('rest'), defaultQuick('emom')], repeat: 1 };
}

const FORMAT: Record<QuickKind | 'work', BlockFormat> = { amrap: 'amrap', for_time: 'for_time', emom: 'emom', tabata: 'tabata', work: 'intervals' };

/** One timer (without its sets) as a block. Rest items have no block. */
function itemBlock(q: QuickTimer): Block | null {
  if (q.kind === 'rest') return null;
  const b = newBlock(FORMAT[q.kind], 0);
  b.name = q.kind === 'work' ? q.label?.trim() || 'Work' : QUICK_LABEL[q.kind];
  switch (q.kind) {
    case 'amrap':
      b.params = { timeCapMin: Math.max(1, q.minutes ?? 10) };
      break;
    case 'for_time':
      b.params = { timeCapMin: q.minutes || undefined, signalEverySec: q.everySec || undefined };
      break;
    case 'emom':
      b.params = { totalMin: Math.max(1, q.minutes ?? 10), intervalSec: Math.max(5, q.everySec ?? 60) };
      break;
    case 'tabata':
      b.params = {
        rounds: Math.max(1, q.rounds ?? 8),
        workSec: Math.max(1, q.workSec ?? 20),
        restSec: Math.max(0, q.restSec ?? 10),
        extraSets: Math.max(0, (q.sets ?? 1) - 1),
        restBetweenSetsSec: q.setRestSec ?? 60,
      };
      break;
    case 'work':
      b.params = { repeats: 1, segments: [{ id: uid(), label: q.label?.trim() || 'Work', kind: 'work', durationSec: Math.max(1, q.workSec ?? 60), sound: true }] };
      break;
  }
  return b;
}

/** Blocks for one timer including its optional sets (Tabata handles sets itself). */
function timerBlocks(q: QuickTimer): Block[] {
  const one = itemBlock(q);
  if (!one) return [];
  const sets = q.kind === 'tabata' || q.kind === 'work' ? 1 : Math.max(1, q.sets ?? 1);
  if (sets === 1) return [one];
  const name = one.name;
  return Array.from({ length: sets }, (_, i) => {
    const b = i === 0 ? one : { ...structuredClone(one), id: uid() };
    b.name = `${name} · set ${i + 1}/${sets}`;
    b.timer = { ...b.timer, restBeforeSec: i === 0 ? 0 : q.setRestSec ?? 0 };
    return b;
  });
}

/**
 * Blocks for a list of timers run back to back. Only the first block has a get-ready countdown;
 * a Rest item becomes the rest before the next block (a trailing rest is dropped).
 */
export function quickBlocks(items: QuickTimer[], prepSec: number, repeat = 1): Block[] {
  const out: Block[] = [];
  let pendingRest = 0;
  for (let r = 0; r < Math.max(1, repeat); r++) {
    for (const q of items) {
      if (q.kind === 'rest') {
        pendingRest += Math.max(0, q.restSec ?? 0);
        continue;
      }
      for (const b of timerBlocks(q)) {
        const isFirst = out.length === 0;
        b.timer = { ...b.timer, prepSec: isFirst ? prepSec : 0, restBeforeSec: isFirst ? 0 : (b.timer.restBeforeSec ?? 0) + pendingRest };
        if (!b.timer.restBeforeSec) delete b.timer.restBeforeSec;
        pendingRest = 0;
        out.push(b);
      }
    }
  }
  if (repeat > 1) {
    const per = out.length / repeat;
    out.forEach((b, i) => {
      if (Number.isInteger(per)) b.name = `${b.name} · round ${Math.floor(i / per) + 1}/${repeat}`;
    });
  }
  return out;
}

/** Planned total in seconds, or null when a For Time block has no cap. */
export function quickSeconds(blocks: Block[]): number | null {
  let total = 0;
  for (const b of blocks) {
    if (b.format === 'for_time' && !b.params.timeCapMin) return null;
    total += estimateBlockSeconds(b) + b.timer.prepSec + (b.timer.restBeforeSec ?? 0);
  }
  return total;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function describeQuick(q: QuickTimer): string {
  const sets = q.kind !== 'work' && q.kind !== 'rest' && (q.sets ?? 1) > 1 ? ` · ${q.sets} sets, rest ${clock(q.setRestSec ?? 0)}` : '';
  switch (q.kind) {
    case 'amrap':
      return `${q.minutes} min${sets}`;
    case 'for_time':
      return `${q.minutes ? `Cap ${q.minutes} min` : 'No cap'}${q.everySec ? ` · signal every ${clock(q.everySec)}` : ''}${sets}`;
    case 'emom':
      return `Every ${clock(q.everySec ?? 60)} for ${q.minutes} min${sets}`;
    case 'tabata':
      return `${q.rounds} × ${clock(q.workSec ?? 20)} / ${clock(q.restSec ?? 10)}${sets}`;
    case 'work':
      return `${clock(q.workSec ?? 60)}${q.label ? ` · ${q.label}` : ''}`;
    case 'rest':
      return clock(q.restSec ?? 60);
  }
}

// Picker values (shown as native wheels on iPhone).
const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
export const SECOND_OPTIONS = [...range(5, 60, 5), ...range(75, 180, 15), ...range(210, 600, 30)];
export const REST_OPTIONS = [0, ...SECOND_OPTIONS];
export const MINUTE_OPTIONS = [...range(1, 60), ...range(70, 120, 10)];
export const EVERY_OPTIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540, 600];
export const ROUND_OPTIONS = range(1, 50);
export const SET_OPTIONS = range(1, 20);
export const SIGNAL_OPTIONS = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
export const PREP_OPTIONS = [0, 3, 5, 10, 15, 20, 30];
export { clock as quickClock };
