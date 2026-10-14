// Backup files: a single JSON document with a schema version. Older files are migrated step by
// step on import; files from a newer app version are rejected with a clear message.
//
// To change the backup format later:
//   1. bump BACKUP_SCHEMA_VERSION,
//   2. add a function to MIGRATIONS keyed by the *old* version that returns the new shape,
//   3. add a test with a file in the old format.

import type { WorkoutDB } from '../db/db';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../db/repo';
import type { BlockTemplate, BodyWeight, Exercise, Profile, Program, Session, Settings, TimerTemplate } from '../db/types';

export const BACKUP_APP_ID = 'workout-tracker';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  exercises: Exercise[]; // custom exercises only; the built-in catalog ships with the app
  programs: Program[];
  /** Exercise templates (added later in format 1; missing in older files). */
  blockTemplates: BlockTemplate[];
  /** Saved timers (added later in format 1; missing in older files). */
  timerTemplates: TimerTemplate[];
  sessions: Session[];
  bodyWeights: BodyWeight[];
  profile: Profile;
  settings: Partial<Settings>;
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export class BackupError extends Error {}

type AnyRecord = Record<string, unknown>;
export type Migration = (file: AnyRecord) => AnyRecord;

/** MIGRATIONS[n] upgrades a version-n file to version n + 1. */
export const MIGRATIONS: Record<number, Migration> = {};

export async function createBackup(db: WorkoutDB, now = new Date()): Promise<BackupFile> {
  const [exercises, programs, blockTemplates, timerTemplates, sessions, bodyWeights, profileRow, settingsRow] = await Promise.all([
    db.exercises.filter((e) => e.isCustom).toArray(),
    db.programs.toArray(),
    db.blockTemplates.toArray(),
    db.timerTemplates.toArray(),
    db.sessions.toArray(),
    db.bodyWeights.toArray(),
    db.kv.get('profile'),
    db.kv.get('settings'),
  ]);
  // Device-specific values (backup reminder, storage request) are not moved between devices.
  const { lastBackupAt: _a, backupReminderDismissedAt: _b, persistRequested: _c, ...settings } = (settingsRow?.value ?? {}) as Partial<Settings>;
  void _a;
  void _b;
  void _c;
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      exercises,
      programs,
      blockTemplates,
      timerTemplates,
      sessions,
      bodyWeights,
      profile: { ...DEFAULT_PROFILE, ...((profileRow?.value as Partial<Profile>) ?? {}) },
      settings,
    },
  };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `workout-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

function isObj(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse, validate and migrate a backup to the current schema.
 * `migrations` and `current` are parameters only so tests can exercise the chain.
 */
export function readBackup(input: string | unknown, migrations: Record<number, Migration> = MIGRATIONS, current = BACKUP_SCHEMA_VERSION): BackupFile {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new BackupError('This file is not valid JSON. Choose a backup file exported from this app.');
    }
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP_ID) throw new BackupError('This is not a Workout Tracker backup file.');
  let version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new BackupError('The backup file has no valid schema version.');
  if (version > current) throw new BackupError(`This backup was made by a newer version of the app (format ${version}). Update the app on this device first, then import again.`);

  let file: AnyRecord = raw;
  while (version < current) {
    const step = migrations[version];
    if (!step) throw new BackupError(`Backups in format ${version} can no longer be imported.`);
    file = { ...step(file), schemaVersion: version + 1 };
    version += 1;
  }
  return normalize(file);
}

/** Fill defaults and check the shape, so a slightly damaged file still imports what it can. */
function normalize(file: AnyRecord): BackupFile {
  const data = isObj(file.data) ? file.data : null;
  if (!data) throw new BackupError('The backup file is missing its data section.');
  const list = <T>(key: string, check: (x: AnyRecord) => boolean): T[] => {
    const v = data[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError(`The backup file is damaged: “${key}” is not a list.`);
    return v.filter((x) => isObj(x) && check(x)) as T[];
  };
  const sessions = list<Session>('sessions', (s) => typeof s.id === 'string' && typeof s.startedAt === 'number').map((s) => ({
    ...s,
    blocks: Array.isArray(s.blocks) ? s.blocks : [],
    intensity: s.intensity ?? 'moderate',
    source: s.source ?? 'manual',
    status: s.status ?? 'completed',
    title: s.title ?? 'Workout',
    updatedAt: s.updatedAt ?? s.startedAt,
  }));
  return {
    app: BACKUP_APP_ID,
    schemaVersion: file.schemaVersion as number,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    data: {
      exercises: list<Exercise>('exercises', (e) => typeof e.id === 'string' && typeof e.name === 'string').map((e) => ({ ...e, isCustom: true })),
      programs: list<Program>('programs', (p) => typeof p.id === 'string' && Array.isArray(p.days)),
      blockTemplates: list<BlockTemplate>('blockTemplates', (t) => typeof t.id === 'string' && isObj(t.block)),
      timerTemplates: list<TimerTemplate>('timerTemplates', (t) => typeof t.id === 'string' && isObj(t.timer)),
      sessions,
      bodyWeights: list<BodyWeight>('bodyWeights', (w) => typeof w.id === 'string' && typeof w.weightKg === 'number'),
      profile: { ...DEFAULT_PROFILE, ...(isObj(data.profile) ? (data.profile as Partial<Profile>) : {}) },
      settings: isObj(data.settings) ? (data.settings as Partial<Settings>) : {},
    },
  };
}

export interface RestoreSummary {
  exercises: number;
  programs: number;
  sessions: number;
  bodyWeights: number;
}

export function summarize(file: BackupFile): RestoreSummary {
  return {
    exercises: file.data.exercises.length,
    programs: file.data.programs.length,
    sessions: file.data.sessions.length,
    bodyWeights: file.data.bodyWeights.length,
  };
}

/**
 * replace: this device ends up with exactly the backup's data (built-in exercises are kept).
 * merge: records are added; when both sides have the same record, the newer one wins.
 */
export async function restoreBackup(db: WorkoutDB, file: BackupFile, mode: 'replace' | 'merge'): Promise<void> {
  const d = file.data;
  await db.transaction('rw', [db.exercises, db.programs, db.blockTemplates, db.timerTemplates, db.sessions, db.bodyWeights, db.kv], async () => {
    if (mode === 'replace') {
      await db.exercises.filter((e) => e.isCustom).delete();
      await db.programs.clear();
      await db.blockTemplates.clear();
      await db.blockTemplates.bulkPut(d.blockTemplates);
      await db.timerTemplates.clear();
      await db.timerTemplates.bulkPut(d.timerTemplates);
      await db.sessions.clear();
      await db.bodyWeights.clear();
      await db.exercises.bulkPut(d.exercises);
      await db.programs.bulkPut(d.programs);
      await db.sessions.bulkPut(d.sessions);
      await db.bodyWeights.bulkPut(d.bodyWeights);
      await db.kv.put({ key: 'profile', value: d.profile });
    } else {
      const newer = async <T extends { id: string; updatedAt?: number }>(table: { get: (id: string) => Promise<T | undefined>; put: (x: T) => Promise<unknown> }, rows: T[]) => {
        for (const r of rows) {
          const cur = await table.get(r.id);
          if (!cur || (r.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) await table.put(r);
        }
      };
      await db.exercises.bulkPut(d.exercises);
      await newer(db.programs, d.programs);
      await newer(db.blockTemplates, d.blockTemplates);
      await newer(db.timerTemplates, d.timerTemplates);
      await newer(db.sessions, d.sessions);
      await db.bodyWeights.bulkPut(d.bodyWeights);
      const cur = await db.kv.get('profile');
      if (!cur) await db.kv.put({ key: 'profile', value: d.profile });
    }
    const curSettings = ((await db.kv.get('settings'))?.value ?? {}) as Partial<Settings>;
    await db.kv.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...curSettings, ...d.settings, lastBackupAt: curSettings.lastBackupAt } });
  });
}

/**
 * Weekly reminder: due when there is data and the last backup (or dismissal) is over 7 days old.
 * Someone who never backed up is reminded once their oldest workout is a week old.
 */
export function backupReminderDue(
  settings: Pick<Settings, 'lastBackupAt' | 'backupReminderDismissedAt'>,
  oldestSessionAt: number | undefined,
  now = Date.now(),
): boolean {
  if (oldestSessionAt === undefined) return false;
  const week = 7 * 86_400_000;
  const last = Math.max(settings.lastBackupAt ?? 0, settings.backupReminderDismissedAt ?? 0, oldestSessionAt);
  return now - last > week;
}
