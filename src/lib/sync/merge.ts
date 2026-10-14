// Merging two copies of the data (this device and the cloud). Pure functions, so they are easy to test.
//
// Rules: records are matched by id; the one with the newer `updatedAt` wins (records without it
// keep this device's version). Deletions travel as tombstones {table, id, at}: a record is
// removed everywhere unless it was changed after it was deleted. Tombstones older than 180 days
// are forgotten.

import type { BlockTemplate, BodyWeight, Exercise, Profile, Program, Session, TimerTemplate } from '../../db/types';

export const SYNC_TABLES = ['exercises', 'programs', 'blockTemplates', 'timerTemplates', 'sessions', 'bodyWeights'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface Tombstone {
  t: SyncTable;
  id: string;
  at: number;
}

export interface SyncPayload {
  v: 1;
  /** Custom exercises only (the built-in catalogue ships with the app). */
  exercises: Exercise[];
  programs: Program[];
  blockTemplates: BlockTemplate[];
  /** Saved timers (missing in copies uploaded by older app versions). */
  timerTemplates: TimerTemplate[];
  sessions: Session[];
  bodyWeights: BodyWeight[];
  profile?: Profile;
  /** When the profile was last changed. */
  profileAt?: number;
  tombstones: Tombstone[];
}

type Rec = { id: string; updatedAt?: number };
const TOMBSTONE_TTL = 180 * 24 * 3600_000;

export function emptyPayload(): SyncPayload {
  return { v: 1, exercises: [], programs: [], blockTemplates: [], timerTemplates: [], sessions: [], bodyWeights: [], tombstones: [] };
}

function mergeRecords<T extends Rec>(local: T[], remote: T[]): T[] {
  const out = new Map(local.map((r) => [r.id, r]));
  for (const r of remote) {
    const l = out.get(r.id);
    if (!l || (r.updatedAt !== undefined && l.updatedAt !== undefined && r.updatedAt > l.updatedAt)) out.set(r.id, r);
  }
  return [...out.values()];
}

export function mergeTombstones(a: Tombstone[], b: Tombstone[], now = Date.now()): Tombstone[] {
  const m = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    if (now - t.at > TOMBSTONE_TTL) continue;
    const k = `${t.t}:${t.id}`;
    const cur = m.get(k);
    if (!cur || t.at > cur.at) m.set(k, t);
  }
  return [...m.values()];
}

/** Drop records deleted on some device, unless they were edited after the deletion. */
function applyTombstones<T extends Rec>(table: SyncTable, rows: T[], tombs: Map<string, number>): T[] {
  return rows.filter((r) => {
    const at = tombs.get(`${table}:${r.id}`);
    return at === undefined || (r.updatedAt ?? -1) >= at;
  });
}

export function mergePayloads(local: SyncPayload, remote: SyncPayload, now = Date.now()): SyncPayload {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);
  const tombs = new Map(tombstones.map((t) => [`${t.t}:${t.id}`, t.at]));
  const remoteProfileNewer = remote.profile && (!local.profile || (remote.profileAt ?? 0) > (local.profileAt ?? 0));
  return {
    v: 1,
    exercises: applyTombstones('exercises', mergeRecords(local.exercises, remote.exercises), tombs),
    programs: applyTombstones('programs', mergeRecords(local.programs, remote.programs), tombs),
    blockTemplates: applyTombstones('blockTemplates', mergeRecords(local.blockTemplates, remote.blockTemplates), tombs),
    timerTemplates: applyTombstones('timerTemplates', mergeRecords(local.timerTemplates ?? [], remote.timerTemplates ?? []), tombs),
    sessions: applyTombstones('sessions', mergeRecords(local.sessions, remote.sessions), tombs),
    bodyWeights: applyTombstones('bodyWeights', mergeRecords(local.bodyWeights, remote.bodyWeights), tombs),
    profile: remoteProfileNewer ? remote.profile : local.profile,
    profileAt: remoteProfileNewer ? remote.profileAt : local.profileAt,
    tombstones,
  };
}

/** Stable text of a payload (arrays sorted by id), to tell whether anything changed. */
export function canonical(p: SyncPayload): string {
  const sort = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({
    ...p,
    exercises: sort(p.exercises),
    programs: sort(p.programs),
    blockTemplates: sort(p.blockTemplates),
    timerTemplates: sort(p.timerTemplates ?? []),
    sessions: sort(p.sessions),
    bodyWeights: sort(p.bodyWeights),
    tombstones: [...p.tombstones].sort((a, b) => `${a.t}:${a.id}`.localeCompare(`${b.t}:${b.id}`)),
  });
}
