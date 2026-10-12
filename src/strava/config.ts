// Strava integration (Phase 6). Everything Strava-related lives in src/strava/ and is loaded only
// from Settings, so it can be removed or switched off without touching the rest of the app.
//
// Build-time switch: set VITE_STRAVA=off to hide the feature completely.
// Runtime switch: Settings → Strava → “Enable Strava”.

import { db } from '../db/db';

export const STRAVA_FEATURE = import.meta.env.VITE_STRAVA !== 'off';

export interface StravaConfig {
  clientId: string;
  /** Base URL of the Cloudflare Worker that holds the client secret, e.g. https://strava-auth.example.workers.dev */
  workerUrl: string;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch seconds */
  expiresAt: number;
  athlete?: { id: number; firstname?: string };
  scope?: string;
}

const ENV_DEFAULTS: StravaConfig = {
  clientId: import.meta.env.VITE_STRAVA_CLIENT_ID ?? '',
  workerUrl: import.meta.env.VITE_STRAVA_WORKER_URL ?? '',
};

export async function getConfig(): Promise<StravaConfig> {
  const row = await db.kv.get('stravaConfig');
  return { ...ENV_DEFAULTS, ...((row?.value as Partial<StravaConfig>) ?? {}) };
}

export async function saveConfig(c: Partial<StravaConfig>): Promise<void> {
  const cur = await getConfig();
  await db.kv.put({ key: 'stravaConfig', value: { ...cur, ...c, workerUrl: (c.workerUrl ?? cur.workerUrl).replace(/\/+$/, '') } });
}

export async function getTokens(): Promise<StravaTokens | null> {
  return ((await db.kv.get('stravaTokens'))?.value as StravaTokens | undefined) ?? null;
}

export async function saveTokens(t: StravaTokens | null): Promise<void> {
  if (t) await db.kv.put({ key: 'stravaTokens', value: t });
  else await db.kv.delete('stravaTokens');
}

/** The app's own URL, used as the OAuth redirect. Its host must be the “Authorization Callback Domain” in Strava. */
export function redirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
