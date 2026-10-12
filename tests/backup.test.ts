import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded, SEED_EXERCISES } from '../src/db/repo';
import { BACKUP_SCHEMA_VERSION, BackupError, backupReminderDue, createBackup, readBackup, restoreBackup, type Migration } from '../src/lib/backup';
import { sampleProgram } from '../src/lib/sampleProgram';
import { block, session, set } from './helpers';

let dbn = 0;
async function freshDb() {
  const db = new WorkoutDB(`backup-test-${++dbn}`);
  await ensureSeeded(db);
  return db;
}

async function fill(db: WorkoutDB) {
  await db.exercises.add({ id: 'custom-x', name: 'Sled drag', category: 'strength', equipment: 'sled', primaryMuscles: ['quads'], secondaryMuscles: [], isCustom: true });
  await db.programs.add(sampleProgram());
  await db.sessions.bulkAdd([session('2026-09-01', [block([set('back-squat', 100, 5)])]), session('2026-09-03', [], { importedCalories: 420, source: 'fit', externalIds: ['fit:1'] })]);
  await db.bodyWeights.add({ id: 'w1', date: '2026-09-01', weightKg: 81.5 });
  await db.kv.put({ key: 'profile', value: { sex: 'female', heightCm: 170, unit: 'lb', defaultRestSec: 120, defaultPrepSec: 5, birthDate: '1992-02-02' } });
  await db.kv.put({ key: 'settings', value: { soundVolume: 0.5, backgroundAudio: false, stravaEnabled: true, lastBackupAt: 123 } });
  await db.kv.put({ key: 'stravaTokens', value: { accessToken: 'secret', refreshToken: 'secret' } });
}

describe('backup export and import', () => {
  it('round-trips all data between two devices (iPhone → Mac)', async () => {
    const phone = await freshDb();
    await fill(phone);
    const file = await createBackup(phone);
    const json = JSON.stringify(file);

    const mac = await freshDb();
    await restoreBackup(mac, readBackup(json), 'replace');

    expect(await mac.sessions.toArray()).toEqual(await phone.sessions.toArray());
    expect(await mac.programs.toArray()).toEqual(await phone.programs.toArray());
    expect(await mac.bodyWeights.toArray()).toEqual(await phone.bodyWeights.toArray());
    expect(await mac.exercises.get('custom-x')).toMatchObject({ name: 'Sled drag', isCustom: true });
    expect(await mac.exercises.count()).toBe(SEED_EXERCISES.length + 1);
    expect((await mac.kv.get('profile'))?.value).toMatchObject({ sex: 'female', unit: 'lb' });
    expect((await mac.kv.get('settings'))?.value).toMatchObject({ soundVolume: 0.5, stravaEnabled: true });
  });

  it('never exports Strava tokens or device-only settings', async () => {
    const db = await freshDb();
    await fill(db);
    const json = JSON.stringify(await createBackup(db));
    expect(json).not.toContain('secret');
    expect(json).not.toContain('lastBackupAt');
    expect(JSON.parse(json).schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('replace removes data that is not in the backup; merge keeps it and the newer record wins', async () => {
    const src = await freshDb();
    await fill(src);
    const file = readBackup(JSON.stringify(await createBackup(src)));

    const a = await freshDb();
    await a.sessions.add(session('2026-01-01', []));
    await restoreBackup(a, file, 'replace');
    expect(await a.sessions.count()).toBe(2);

    const b = await freshDb();
    const local = session('2026-01-01', []);
    const edited = { ...file.data.sessions[0], title: 'Edited later on this device', updatedAt: Date.now() + 1000 };
    await b.sessions.bulkAdd([local, edited]);
    await restoreBackup(b, file, 'merge');
    expect(await b.sessions.count()).toBe(3);
    expect((await b.sessions.get(edited.id))?.title).toBe('Edited later on this device');
  });
});

describe('backup schema migration', () => {
  const v0 = { app: 'workout-tracker', schemaVersion: 0, exportedAt: '2026-01-01T00:00:00Z', workouts: [{ id: 'old', startedAt: 1, date: '2026-01-01', blocks: [] }], weights: [{ id: 'w', date: '2026-01-01', kg: 70 }] };
  const migrations: Record<number, Migration> = {
    0: (f) => ({ ...f, data: { sessions: f.workouts, bodyWeights: (f.weights as { id: string; date: string; kg: number }[]).map((w) => ({ id: w.id, date: w.date, weightKg: w.kg })) } }),
  };

  it('upgrades older files step by step and fills missing fields', () => {
    const file = readBackup(JSON.stringify(v0), migrations, 1);
    expect(file.schemaVersion).toBe(1);
    expect(file.data.bodyWeights).toEqual([{ id: 'w', date: '2026-01-01', weightKg: 70 }]);
    expect(file.data.sessions[0]).toMatchObject({ id: 'old', intensity: 'moderate', source: 'manual', status: 'completed', title: 'Workout' });
    expect(file.data.programs).toEqual([]);
  });

  it('rejects files from a newer app version with a clear message', () => {
    expect(() => readBackup({ app: 'workout-tracker', schemaVersion: BACKUP_SCHEMA_VERSION + 1, data: {} })).toThrow(/newer version/);
  });

  it('rejects files it cannot read with clear messages', () => {
    expect(() => readBackup('{not json')).toThrow(BackupError);
    expect(() => readBackup('{not json')).toThrow(/not valid JSON/);
    expect(() => readBackup({ hello: 1 })).toThrow(/not a Workout Tracker backup/);
    expect(() => readBackup({ app: 'workout-tracker', schemaVersion: 'x' })).toThrow(/schema version/);
    expect(() => readBackup({ app: 'workout-tracker', schemaVersion: 0, data: {} }, {}, 1)).toThrow(/can no longer be imported/);
    expect(() => readBackup({ app: 'workout-tracker', schemaVersion: 1, data: { sessions: 'oops' } })).toThrow(/damaged/);
  });

  it('skips broken records instead of failing the whole import', () => {
    const file = readBackup({ app: 'workout-tracker', schemaVersion: 1, data: { sessions: [{ id: 'ok', startedAt: 5 }, { nope: true }, 7] } });
    expect(file.data.sessions.map((s) => s.id)).toEqual(['ok']);
  });
});

describe('weekly backup reminder', () => {
  const day = 86_400_000;
  const now = 100 * day;
  it('is due when the last backup is more than a week old', () => {
    expect(backupReminderDue({ lastBackupAt: now - 8 * day }, now - 30 * day, now)).toBe(true);
    expect(backupReminderDue({ lastBackupAt: now - 2 * day }, now - 30 * day, now)).toBe(false);
  });
  it('waits a week after the first workout, and after a dismissal', () => {
    expect(backupReminderDue({}, now - 3 * day, now)).toBe(false);
    expect(backupReminderDue({}, now - 9 * day, now)).toBe(true);
    expect(backupReminderDue({ backupReminderDismissedAt: now - day }, now - 30 * day, now)).toBe(false);
    expect(backupReminderDue({}, undefined, now)).toBe(false);
  });
});
