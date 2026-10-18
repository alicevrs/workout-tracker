// One line describing how a block runs, for the workout page: what it logs and how it is
// counted, each piece of information once (no tag, no repeated time).

import type { Block } from '../db/types';
import { quickFromParams } from './blockTemplates';
import { FORMAT_INFO, isTotalTime, minutesLabel } from './program';
import { describeQuick, QUICK_LABEL, quickClock } from './timer/quick';

const TIMERS = new Set(['amrap', 'emom', 'tabata', 'for_time']);

export function blockSummary(b: Block): string {
  const log = b.log ?? [];
  const distance = log.includes('distance');
  if (isTotalTime(b)) return `Time · ${minutesLabel(b.params.timeCapMin ?? 0)}`;
  if (TIMERS.has(b.format)) {
    const q = quickFromParams(b.format, b.params);
    return `${QUICK_LABEL[q.kind]} ${describeQuick(q)}${distance ? ' · distance' : ''}`;
  }
  const sets = b.entries.reduce((n, e) => n + (e.setTargets?.length || e.sets), 0);
  if (b.format === 'timed_sets') return `Time · ${quickClock(b.entries[0]?.durationSec ?? 0)}${distance ? ' · distance' : ''}`;
  if (distance) {
    if (b.params.distanceKm) return `Distance · ${b.params.distanceKm} km`;
    const reps = b.entries[0]?.sets ?? 1;
    return reps > 1 ? `Distance · ${reps} reps` : 'Distance';
  }
  if (b.format === 'sets_reps') return `Reps · ${sets} ${sets === 1 ? 'set' : 'sets'}`;
  return FORMAT_INFO[b.format].label;
}
