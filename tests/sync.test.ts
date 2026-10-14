import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS worker file
import worker from '../sync-worker/sync-worker.js';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';
import { decrypt, deriveKeys, encrypt, formatSyncCode, isValidSyncCode, newSyncCode, normalizeSyncCode } from '../src/lib/sync/crypto';
import { canonical, emptyPayload, mergePayloads, type SyncPayload } from '../src/lib/sync/merge';
import { enableSync, getSyncStatus, installSyncHooks, syncNow, useSyncStorage, vaultExists } from '../src/lib/sync/sync';
import { newWorkout } from '../src/lib/workouts';

const ITER = 1000; // fewer key-derivation rounds keep these unit tests fast

function memoryKV() {
  const m = new Map<string, { value: string; metadata?: unknown }>();
  return {
    get: async (k: string) => m.get(k)?.value ?? null,
    getWithMetadata: async (k: string) => ({ value: m.get(k)?.value ?? null, metadata: m.get(k)?.metadata ?? null }),
    put: async (k: string, value: string, opts?: { metadata?: unknown }) => void m.set(k, { value, metadata: opts?.metadata }),
    delete: async (k: string) => void m.delete(k),
    size: () => m.size,
  };
}
function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const ORIGIN = 'https://alicevrs.github.io';
const URL_ = 'https://sync.example.dev';

afterEach(() => vi.unstubAllGlobals());

describe('sync code and encryption', () => {
  it('makes readable codes and forgives typing differences', () => {
    const code = newSyncCode();
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
    expect(isValidSyncCode(code.toLowerCase().replace(/-/g, ' '))).toBe(true);
    expect(normalizeSyncCode('abcd-efgh-ijkl-mnop-qrst')).toBe('ABCDEFGH1JK1MN0PQRST');
    expect(formatSyncCode('abcdefgh1jk1mnp0qrst')).toBe('ABCD-EFGH-1JK1-MNP0-QRST');
    expect(isValidSyncCode('ABCD-EFGH')).toBe(false);
  });

  it('derives the same vault from the same code, and decrypts only with the right key', async () => {
    const a = await deriveKeys('7K3M-QX9P-2B4C-D5E6-F7G8', ITER);
    const b = await deriveKeys('7k3m qx9p 2b4c d5e6 f7g8', ITER);
    const c = await deriveKeys('7K3M-QX9P-2B4C-D5E6-F7G9', ITER);
    expect(a.vaultId).toBe(b.vaultId);
    expect(a.vaultId).not.toBe(c.vaultId);
    expect(a.token).not.toBe(a.vaultId);
    const box = await encrypt(a.key, new TextEncoder().encode('hello'));
    expect(new TextDecoder().decode(await decrypt(b.key, box))).toBe('hello');
    await expect(decrypt(c.key, box)).rejects.toThrow();
  });
});

describe('merging', () => {
  const p = (patch: Partial<SyncPayload>): SyncPayload => ({ ...emptyPayload(), ...patch });
  const w = (id: string, name: string, updatedAt: number) => ({ ...newWorkout(name), id, updatedAt });

  it('keeps everything from both sides and the newer version of a record', () => {
    const merged = mergePayloads(p({ programs: [w('a', 'Legs', 10), w('b', 'Old', 5)] }), p({ programs: [w('b', 'New', 9), w('c', 'Arms', 1)] }), 1000);
    expect(merged.programs.map((x) => `${x.id}:${x.name}`).sort()).toEqual(['a:Legs', 'b:New', 'c:Arms']);
  });

  it('applies deletions everywhere unless the record was changed afterwards', () => {
    const local = p({ programs: [w('a', 'Legs', 10), w('b', 'Back', 50)] });
    const remote = p({ tombstones: [{ t: 'programs', id: 'a', at: 20 }, { t: 'programs', id: 'b', at: 20 }] });
    const merged = mergePayloads(local, remote, 1000);
    expect(merged.programs.map((x) => x.id)).toEqual(['b']);
    expect(merged.tombstones).toHaveLength(2);
  });

  it('forgets tombstones after 180 days and takes the newer profile', () => {
    const day = 24 * 3600_000;
    const merged = mergePayloads(
      p({ tombstones: [{ t: 'sessions', id: 'x', at: 0 }], profile: { sex: 'female', unit: 'kg', defaultRestSec: 90, defaultPrepSec: 10 }, profileAt: 5 }),
      p({ profile: { sex: 'female', unit: 'lb', defaultRestSec: 60, defaultPrepSec: 5 }, profileAt: 9 }),
      200 * day,
    );
    expect(merged.tombstones).toEqual([]);
    expect(merged.profile?.unit).toBe('lb');
  });

  it('gives the same canonical text whatever the order', () => {
    const a = w('a', 'A', 1);
    const b = w('b', 'B', 1);
    expect(canonical(p({ programs: [a, b] }))).toBe(canonical(p({ programs: [b, a] })));
  });
});

describe('sync Worker', () => {
  const env = () => ({ SYNC: memoryKV(), ALLOWED_ORIGIN: `${ORIGIN}, http://localhost:4173` });
  const id = 'a'.repeat(64);
  const req = (method: string, token: string, body?: unknown, origin = ORIGIN) =>
    new Request(`${URL_}/v1/vault/${id}`, { method, headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  it('rejects other websites and answers preflight', async () => {
    const e = env();
    expect((await worker.fetch(req('GET', 'b'.repeat(64), undefined, 'https://evil.example'), e)).status).toBe(403);
    const pre = await worker.fetch(new Request(`${URL_}/v1/vault/${id}`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }), e);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('lets the first writer claim the vault, refuses other tokens, and detects concurrent changes', async () => {
    const e = env();
    const tok = 'b'.repeat(64);
    expect((await worker.fetch(req('GET', tok), e)).status).toBe(404);
    const put = await worker.fetch(req('PUT', tok, { data: 'xyz', baseVersion: 0 }), e);
    expect(put.status).toBe(200);
    const { version } = (await put.json()) as { version: number };
    expect((await worker.fetch(req('GET', 'c'.repeat(64)), e)).status).toBe(403);
    const got = (await (await worker.fetch(req('GET', tok), e)).json()) as { version: number; data: string };
    expect(got).toEqual({ version, data: 'xyz' });
    expect((await worker.fetch(req('PUT', tok, { data: 'old', baseVersion: version - 1 }), e)).status).toBe(409);
    expect((await worker.fetch(req('DELETE', tok), e)).status).toBe(200);
    expect(e.SYNC.size()).toBe(0);
  });
});

describe('two devices', () => {
  it('share workouts, edits and deletions through the cloud copy', async () => {
    const e = { SYNC: memoryKV(), ALLOWED_ORIGIN: ORIGIN };
    vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => worker.fetch(new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), Origin: ORIGIN } }), e));

    const phone = new WorkoutDB('sync-phone');
    const mac = new WorkoutDB('sync-mac');
    await ensureSeeded(phone);
    await ensureSeeded(mac);
    const phoneStore = memoryStorage();
    const macStore = memoryStorage();
    installSyncHooks(phone);
    installSyncHooks(mac);

    // Phone: create a workout and turn sync on with a new code.
    useSyncStorage(phoneStore);
    const code = newSyncCode();
    const legs = newWorkout('Legs');
    await phone.programs.add(legs);
    await enableSync(code, phone, URL_);
    expect(getSyncStatus().state).toBe('idle');

    // Mac: has its own workout, joins with the same code.
    useSyncStorage(macStore);
    expect(await vaultExists(code, URL_)).toBe(true);
    expect(await vaultExists(newSyncCode(), URL_)).toBe(false);
    await mac.programs.add(newWorkout('Arms'));
    await enableSync(code, mac, URL_);
    expect((await mac.programs.toArray()).map((p) => p.name).sort()).toEqual(['Arms', 'Legs']);

    // Mac renames Legs and deletes Arms.
    const arms = (await mac.programs.toArray()).find((p) => p.name === 'Arms')!;
    await mac.programs.update(legs.id, { name: 'Legs & glutes', updatedAt: Date.now() + 1 });
    await mac.programs.delete(arms.id);
    await syncNow(mac, URL_);

    // Phone picks everything up.
    useSyncStorage(phoneStore);
    await syncNow(phone, URL_);
    expect((await phone.programs.toArray()).map((p) => p.name)).toEqual(['Legs & glutes']);
  });
});
