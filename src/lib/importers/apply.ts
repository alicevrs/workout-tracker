// Turn imported activities into sessions, merging with existing ones instead of duplicating.

import type { WorkoutDB } from '../../db/db';
import type { Session } from '../../db/types';
import { toDateKey } from '../dates';
import { uid } from '../ids';
import type { ImportedActivity } from './types';

export type ApplyStatus = 'created' | 'updated' | 'duplicate';

export interface ApplyResult {
  status: ApplyStatus;
  sessionId: string;
  title: string;
}

const START_TOLERANCE_MS = 10 * 60_000;

function sessionSeconds(s: Session): number | null {
  return s.endedAt ? (s.endedAt - s.startedAt) / 1000 : null;
}

/**
 * The existing session that is the same workout: same external id, or a start time within
 * 10 minutes and a similar duration (within 20 % or 5 minutes).
 */
export function findMatch(sessions: Session[], a: ImportedActivity): Session | undefined {
  if (a.externalId) {
    const byId = sessions.find((s) => s.externalIds?.includes(a.externalId!));
    if (byId) return byId;
  }
  const dur = a.elapsedSec ?? a.durationSec;
  let best: Session | undefined;
  let bestDiff = Infinity;
  for (const s of sessions) {
    const diff = Math.abs(s.startedAt - a.startTime);
    if (diff > START_TOLERANCE_MS) continue;
    const sd = sessionSeconds(s);
    if (sd !== null && Math.abs(sd - dur) > Math.max(300, 0.2 * Math.max(sd, dur))) continue;
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

const TITLES: Record<string, string> = {
  running: 'Run',
  trail_running: 'Trail run',
  treadmill_running: 'Treadmill run',
  cycling: 'Ride',
  ride: 'Ride',
  indoor_cycling: 'Indoor ride',
  virtual_ride: 'Virtual ride',
  walking: 'Walk',
  walk: 'Walk',
  hiking: 'Hike',
  hike: 'Hike',
  swimming: 'Swim',
  swim: 'Swim',
  lap_swimming: 'Pool swim',
  strength_training: 'Strength training',
  weight_training: 'Strength training',
  training: 'Training',
  rowing: 'Row',
  indoor_rowing: 'Indoor row',
  yoga: 'Yoga',
  hiit: 'HIIT',
};

export function titleFor(a: ImportedActivity): string {
  if (a.name) return a.name;
  if (a.activityType && TITLES[a.activityType]) return TITLES[a.activityType];
  return a.activityType ? a.activityType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Imported activity';
}

export function activityToSession(a: ImportedActivity, now = Date.now()): Session {
  const seconds = a.elapsedSec ?? a.durationSec;
  return {
    id: uid(),
    date: toDateKey(a.startTime),
    title: titleFor(a),
    status: 'completed',
    startedAt: a.startTime,
    endedAt: a.startTime + seconds * 1000,
    blocks: [],
    intensity: 'moderate',
    importedCalories: a.calories,
    hr: a.avgHr || a.maxHr || a.hrSamples ? { avg: a.avgHr, max: a.maxHr, samples: a.hrSamples } : undefined,
    distanceM: a.distanceM,
    activityType: a.activityType,
    source: a.source === 'apple_health' ? 'manual' : a.source,
    externalIds: a.externalId ? [a.externalId] : [],
    updatedAt: now,
  };
}

/** Merge imported values into an existing session. Logged sets and notes are never touched. */
export function mergeInto(s: Session, a: ImportedActivity, now = Date.now()): { session: Session; changed: boolean } {
  const next: Session = { ...s };
  if (a.calories !== undefined && s.importedCalories === undefined) next.importedCalories = a.calories;
  if ((a.avgHr || a.maxHr) && !s.hr?.avg) next.hr = { avg: a.avgHr, max: a.maxHr, samples: a.hrSamples };
  if (a.distanceM && !s.distanceM) next.distanceM = a.distanceM;
  if (a.activityType && !s.activityType && s.blocks.length === 0) next.activityType = a.activityType;
  if (!s.endedAt) next.endedAt = a.startTime + (a.elapsedSec ?? a.durationSec) * 1000;
  if (a.externalId && !s.externalIds?.includes(a.externalId)) next.externalIds = [...(s.externalIds ?? []), a.externalId];
  const changed = JSON.stringify(next) !== JSON.stringify(s);
  if (changed) next.updatedAt = now;
  return { session: next, changed };
}

export async function applyActivity(db: WorkoutDB, a: ImportedActivity): Promise<ApplyResult> {
  return db.transaction('rw', db.sessions, async () => {
    const lo = a.startTime - START_TOLERANCE_MS;
    const hi = a.startTime + START_TOLERANCE_MS;
    const nearby = await db.sessions.where('startedAt').between(lo, hi, true, true).toArray();
    const byId = a.externalId ? await db.sessions.where('externalIds').equals(a.externalId).toArray() : [];
    const match = findMatch([...byId, ...nearby], a);
    if (!match) {
      const s = activityToSession(a);
      await db.sessions.add(s);
      return { status: 'created' as const, sessionId: s.id, title: s.title };
    }
    const { session, changed } = mergeInto(match, a);
    if (changed) await db.sessions.put(session);
    return { status: changed ? ('updated' as const) : ('duplicate' as const), sessionId: match.id, title: match.title };
  });
}
