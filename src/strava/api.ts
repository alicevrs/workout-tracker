// Reading activities from the Strava API with conservative client-side rate limiting.
// Strava's default limits for reading are 100 requests per 15 minutes and 1,000 per day
// per application; this app stays below 80 / 15 min and 800 / day.

import { db } from '../db/db';
import { applyActivity, type ApplyResult } from '../lib/importers/apply';
import { normaliseType, type ImportedActivity } from '../lib/importers/types';
import { getConfig, getTokens, type StravaTokens } from './config';
import { refreshTokens, StravaError } from './oauth';

const API = 'https://www.strava.com/api/v3';
export const LIMIT_15MIN = 80;
export const LIMIT_DAY = 800;

/** Pure check used before each request. `log` holds the timestamps (ms) of earlier requests. */
export function rateLimitWait(log: number[], now = Date.now()): { ok: boolean; reason?: string } {
  const recent15 = log.filter((t) => now - t < 15 * 60_000).length;
  const recentDay = log.filter((t) => now - t < 86_400_000).length;
  if (recentDay >= LIMIT_DAY) return { ok: false, reason: 'Daily Strava request limit reached. Try again tomorrow.' };
  if (recent15 >= LIMIT_15MIN) return { ok: false, reason: 'Strava request limit reached. Try again in 15 minutes.' };
  return { ok: true };
}

async function requestLog(): Promise<number[]> {
  const now = Date.now();
  return (((await db.kv.get('stravaRequests'))?.value as number[]) ?? []).filter((t) => now - t < 86_400_000);
}

async function apiGet<T>(path: string, tokens: StravaTokens): Promise<T> {
  const log = await requestLog();
  const check = rateLimitWait(log);
  if (!check.ok) throw new StravaError(check.reason);
  await db.kv.put({ key: 'stravaRequests', value: [...log, Date.now()] });

  const headers = { Authorization: `Bearer ${tokens.accessToken}` };
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers });
  } catch {
    // Fallback if the browser blocks the direct call: route it through the Worker.
    const { workerUrl } = await getConfig();
    try {
      res = await fetch(`${workerUrl}/api${path}`, { headers });
    } catch {
      throw new StravaError('Could not reach Strava. Check your connection.');
    }
  }
  if (res.status === 429) throw new StravaError('Strava says too many requests. Try again in 15 minutes.');
  if (res.status === 401) throw new StravaError('Strava access was revoked or expired. Connect again.');
  if (!res.ok) throw new StravaError(`Strava answered with error ${res.status}.`);
  return (await res.json()) as T;
}

async function validTokens(): Promise<StravaTokens> {
  const t = await getTokens();
  if (!t) throw new StravaError('Not connected to Strava.');
  if (t.expiresAt - 60 > Date.now() / 1000) return t;
  return refreshTokens(t);
}

export interface StravaActivity {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  calories?: number;
  kilojoules?: number;
}

export function mapStravaActivity(a: StravaActivity): ImportedActivity {
  return {
    source: 'strava',
    externalId: `strava:${a.id}`,
    name: a.name,
    activityType: normaliseType(a.sport_type ?? a.type),
    startTime: new Date(a.start_date).getTime(),
    durationSec: a.moving_time,
    elapsedSec: a.elapsed_time,
    distanceM: a.distance || undefined,
    calories: a.calories || undefined,
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
  };
}

export interface SyncReport {
  created: number;
  updated: number;
  duplicates: number;
  results: ApplyResult[];
  /** Set when the sync stopped early (rate limit etc.); earlier imports are kept. */
  stoppedBecause?: string;
}

/**
 * Import activities that started after `afterMs`. Activity details (for calories) are fetched only
 * for activities not imported before, at most `maxDetails` per sync, to respect the limits.
 */
export async function syncActivities(afterMs: number, maxDetails = 30): Promise<SyncReport> {
  const report: SyncReport = { created: 0, updated: 0, duplicates: 0, results: [] };
  try {
    let tokens = await validTokens();
    let details = 0;
    for (let page = 1; page <= 10; page++) {
      const list = await apiGet<StravaActivity[]>(`/athlete/activities?after=${Math.floor(afterMs / 1000)}&per_page=50&page=${page}`, tokens);
      for (const summary of list) {
        const known = await db.sessions.where('externalIds').equals(`strava:${summary.id}`).count();
        let full = summary;
        if (!known && details < maxDetails) {
          tokens = await validTokens();
          full = { ...summary, ...(await apiGet<StravaActivity>(`/activities/${summary.id}`, tokens)) };
          details++;
        }
        const r = await applyActivity(db, mapStravaActivity(full));
        report.results.push(r);
        if (r.status === 'created') report.created++;
        else if (r.status === 'updated') report.updated++;
        else report.duplicates++;
      }
      if (list.length < 50) break;
    }
    await db.kv.put({ key: 'stravaLastSync', value: Date.now() });
  } catch (e) {
    report.stoppedBecause = e instanceof Error ? e.message : String(e);
  }
  return report;
}
