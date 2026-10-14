// Automatic sync between devices through the Cloudflare Worker (sync-worker/).
//
// One sync = download the encrypted cloud copy → merge with this device (merge.ts) → save what
// changed here → upload the merged copy if it differs. It runs when the app opens, when it comes
// back to the foreground, a few seconds after any change, and every 5 minutes while open.
// Deletions are recorded as tombstones by Dexie hooks so they reach the other devices.
// Device-only state (the sync code, cloud version, tombstones) lives in localStorage.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { db as defaultDb, type WorkoutDB } from '../../db/db';
import type { Profile } from '../../db/types';
import { SYNC_URL } from './config';
import { decrypt, deriveKeys, encrypt, normalizeSyncCode, type SyncKeys } from './crypto';
import { canonical, emptyPayload, mergePayloads, mergeTombstones, SYNC_TABLES, type SyncPayload, type SyncTable, type Tombstone } from './merge';

// ---------- device-only state ----------

let keysCache: { code: string; keys: SyncKeys } | null = null;

const K = { code: 'sync:code', version: 'sync:version', last: 'sync:lastAt', tombs: 'sync:tombstones', profileAt: 'sync:profileAt' };
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let store: KeyValueStore | undefined = typeof localStorage === 'undefined' ? undefined : localStorage;
/** Tests use a separate store per simulated device. */
export function useSyncStorage(s: KeyValueStore): void {
  store = s;
  keysCache = null;
}
const ls = {
  get: (k: string) => {
    try {
      return store?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) store?.removeItem(k);
      else store?.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

export const getSyncCode = () => ls.get(K.code);
const getTombs = (): Tombstone[] => {
  try {
    return JSON.parse(ls.get(K.tombs) ?? '[]') as Tombstone[];
  } catch {
    return [];
  }
};
const setTombs = (t: Tombstone[]) => ls.set(K.tombs, JSON.stringify(t));

// ---------- status for the UI ----------

export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'error'; lastSyncAt?: number; error?: string };
let status: SyncStatus = { state: 'off' };
const listeners = new Set<(s: SyncStatus) => void>();
function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  listeners.forEach((l) => l(status));
}
export const getSyncStatus = () => status;
export function onSyncStatus(l: (s: SyncStatus) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- payload ----------

export async function buildLocalPayload(db: WorkoutDB, tombstones: Tombstone[], profileAt?: number): Promise<SyncPayload> {
  const [exercises, programs, blockTemplates, timerTemplates, sessions, bodyWeights, profileRow] = await Promise.all([
    db.exercises.filter((e) => e.isCustom || !!e.edited).toArray(),
    db.programs.toArray(),
    db.blockTemplates.toArray(),
    db.timerTemplates.toArray(),
    db.sessions.toArray(),
    db.bodyWeights.toArray(),
    db.kv.get('profile'),
  ]);
  return { v: 1, exercises, programs, blockTemplates, timerTemplates, sessions, bodyWeights, profile: profileRow?.value as Profile | undefined, profileAt, tombstones };
}

let applying = false;

/** Write the merged data on this device: only records that changed, removing deleted ones. */
export async function applyMerged(db: WorkoutDB, local: SyncPayload, merged: SyncPayload): Promise<void> {
  applying = true;
  try {
    await db.transaction('rw', [db.exercises, db.programs, db.blockTemplates, db.timerTemplates, db.sessions, db.bodyWeights, db.kv], async () => {
      for (const t of SYNC_TABLES) {
        const table = db[t] as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown>; bulkDelete: (ids: string[]) => Promise<unknown> };
        const before = new Map((local[t] as { id: string }[]).map((r) => [r.id, JSON.stringify(r)]));
        const after = merged[t] as { id: string }[];
        const changed = after.filter((r) => before.get(r.id) !== JSON.stringify(r));
        if (changed.length) await table.bulkPut(changed);
        const keep = new Set(after.map((r) => r.id));
        const removed = [...before.keys()].filter((id) => !keep.has(id));
        if (removed.length) await table.bulkDelete(removed);
      }
      if (merged.profile && JSON.stringify(merged.profile) !== JSON.stringify(local.profile)) await db.kv.put({ key: 'profile', value: merged.profile });
    });
  } finally {
    applying = false;
  }
}

const pack = (p: SyncPayload) => gzipSync(strToU8(JSON.stringify(p)), { level: 6 });
const unpack = (b: Uint8Array) => ({ ...emptyPayload(), ...(JSON.parse(strFromU8(gunzipSync(b))) as Partial<SyncPayload>) }) as SyncPayload;

// ---------- network ----------

export class SyncError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function keysFor(code: string): Promise<SyncKeys> {
  if (keysCache?.code !== code) keysCache = { code, keys: await deriveKeys(code) };
  return keysCache.keys;
}

async function call(url: string, keys: SyncKeys, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/v1/vault/${keys.vaultId}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${keys.token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new SyncError('No connection. Sync will retry later.');
  }
  if (res.status === 403) throw new SyncError('This sync code does not match the cloud copy.', 403);
  return res;
}

async function download(url: string, keys: SyncKeys): Promise<{ payload: SyncPayload | null; version: number }> {
  const res = await call(url, keys);
  if (res.status === 404) return { payload: null, version: 0 };
  if (!res.ok) throw new SyncError(`Sync server error (${res.status}).`, res.status);
  const body = (await res.json()) as { version: number; data: string };
  let bytes: Uint8Array;
  try {
    bytes = await decrypt(keys.key, body.data);
  } catch {
    throw new SyncError('The cloud copy could not be decrypted with this sync code.');
  }
  return { payload: unpack(bytes), version: body.version };
}

/** Does a cloud copy exist for this code? Used before joining, to catch typing mistakes. */
export async function vaultExists(code: string, url = SYNC_URL): Promise<boolean> {
  const keys = await deriveKeys(code);
  const { payload } = await download(url, keys);
  return payload !== null;
}

// ---------- one sync ----------

let running: Promise<void> | null = null;

export function syncNow(db: WorkoutDB = defaultDb, url = SYNC_URL): Promise<void> {
  if (running) return running;
  running = doSync(db, url).finally(() => (running = null));
  return running;
}

async function doSync(db: WorkoutDB, url: string): Promise<void> {
  const code = getSyncCode();
  if (!code || !url) return setStatus({ state: 'off' });
  setStatus({ state: 'syncing' });
  try {
    const keys = await keysFor(code);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { payload: remote, version } = await download(url, keys);
      const local = await buildLocalPayload(db, getTombs(), Number(ls.get(K.profileAt)) || undefined);
      const merged = remote ? mergePayloads(local, remote) : { ...local, tombstones: mergeTombstones(local.tombstones, []) };
      const mergedText = canonical(merged);
      if (mergedText !== canonical(local)) {
        await applyMerged(db, local, merged);
        setTombs(merged.tombstones);
        if (merged.profileAt) ls.set(K.profileAt, String(merged.profileAt));
      }
      if (remote && mergedText === canonical(remote)) {
        ls.set(K.version, String(version));
        break;
      }
      const data = await encrypt(keys.key, pack(merged));
      const res = await call(url, keys, { method: 'PUT', body: JSON.stringify({ data, baseVersion: version }) });
      if (res.status === 409) continue; // another device uploaded meanwhile: merge again
      if (!res.ok) throw new SyncError(res.status === 413 ? 'Your data is too large to sync.' : `Sync server error (${res.status}).`, res.status);
      ls.set(K.version, String(((await res.json()) as { version: number }).version));
      break;
    }
    const now = Date.now();
    ls.set(K.last, String(now));
    setStatus({ state: 'idle', lastSyncAt: now, error: undefined });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : 'Sync failed.' });
  }
}

// ---------- turning it on and off ----------

export async function enableSync(code: string, db: WorkoutDB = defaultDb, url = SYNC_URL): Promise<void> {
  ls.set(K.code, normalizeSyncCode(code));
  ls.set(K.version, null);
  await syncNow(db, url);
}

export function disableSync(): void {
  ls.set(K.code, null);
  ls.set(K.version, null);
  ls.set(K.last, null);
  keysCache = null;
  setStatus({ state: 'off', lastSyncAt: undefined, error: undefined });
}

/** Remove the cloud copy (all devices keep their own data) and turn sync off here. */
export async function deleteCloudCopy(url = SYNC_URL): Promise<void> {
  const code = getSyncCode();
  if (code && url) {
    const res = await call(url, await keysFor(code), { method: 'DELETE' });
    if (!res.ok) throw new SyncError(`Sync server error (${res.status}).`, res.status);
  }
  disableSync();
}

// ---------- automatic triggers ----------

let timer: number | undefined;
function schedule(delay = 6000) {
  // Automatic runs only in the app (not in tests, which call syncNow themselves).
  if (typeof window === 'undefined' || !getSyncCode() || !SYNC_URL) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delay);
}

function remember(t: SyncTable, id: string, deleted: boolean) {
  const rest = getTombs().filter((x) => !(x.t === t && x.id === id));
  setTombs(deleted ? [...rest, { t, id, at: Date.now() }] : rest);
}

/** Watch local changes (for tombstones and to schedule a sync). Call once per database. */
export function installSyncHooks(db: WorkoutDB): void {
  for (const t of SYNC_TABLES) {
    const table = db[t] as unknown as { hook: (ev: string, fn: (...a: unknown[]) => void) => void };
    // The built-in exercise catalogue is not synced (it ships with the app), unless the user changed or deleted an exercise.
    const builtIn = (obj: unknown, mods?: unknown) =>
      t === 'exercises' && !(obj as { isCustom?: boolean } | undefined)?.isCustom && !(obj as { edited?: boolean } | undefined)?.edited && !(mods as { edited?: boolean } | undefined)?.edited;
    table.hook('creating', (pk, obj) => {
      if (applying || builtIn(obj)) return;
      remember(t, String(pk), false);
      schedule();
    });
    table.hook('updating', (mods, _pk, obj) => {
      if (!applying && !builtIn(obj, mods)) schedule();
    });
    table.hook('deleting', (pk, obj) => {
      if (applying || builtIn(obj)) return;
      remember(t, String(pk), true);
      schedule();
    });
  }
  const onProfile = (pk: unknown) => {
    if (applying || pk !== 'profile') return;
    ls.set(K.profileAt, String(Date.now()));
    schedule();
  };
  db.kv.hook('creating', (pk) => onProfile(pk));
  db.kv.hook('updating', (_mods, pk) => onProfile(pk));
}

/** Start automatic sync for the app (main.tsx). */
export function startSync(): void {
  installSyncHooks(defaultDb);
  const last = Number(ls.get(K.last)) || undefined;
  setStatus({ state: getSyncCode() && SYNC_URL ? 'idle' : 'off', lastSyncAt: last });
  if (!getSyncCode() || !SYNC_URL) return;
  void syncNow();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(500));
  window.addEventListener('online', () => schedule(500));
  window.setInterval(() => document.visibilityState === 'visible' && schedule(0), 5 * 60_000);
}
