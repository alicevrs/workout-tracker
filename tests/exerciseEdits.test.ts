import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';
import { createBackup, readBackup } from '../src/lib/backup';
import { addExercise, linkedBlock, newBlockTemplate } from '../src/lib/blockTemplates';
import { newProgram } from '../src/lib/program';
import { buildLocalPayload } from '../src/lib/sync/sync';
import { newTimerTemplate, withTimer } from '../src/lib/timerTemplates';
import { blocksUsingExercise, blocksUsingTimer, workoutsUsingBlock } from '../src/lib/usage';

let n = 0;
async function freshDb() {
  const db = new WorkoutDB(`ex-edit-test-${++n}`);
  await ensureSeeded(db);
  return db;
}

describe('changed and deleted built-in exercises', () => {
  it('survive a catalogue refresh and travel with sync and backups', async () => {
    const db = await freshDb();
    const push = (await db.exercises.get('push-up'))!;
    await db.exercises.put({ ...push, name: 'Push-up (mine)', edited: true, updatedAt: 1 });
    const squat = (await db.exercises.get('back-squat'))!;
    await db.exercises.put({ ...squat, hidden: true, edited: true, updatedAt: 1 });
    await db.kv.put({ key: 'seedVersion', value: 0 });
    await ensureSeeded(db);
    expect((await db.exercises.get('push-up'))!.name).toBe('Push-up (mine)');
    expect((await db.exercises.get('back-squat'))!.hidden).toBe(true);

    const payload = await buildLocalPayload(db, []);
    expect(payload.exercises.map((e) => e.id).sort()).toEqual(['back-squat', 'push-up']);
    const file = readBackup(JSON.stringify(await createBackup(db)));
    expect(file.data.exercises.every((e) => !e.isCustom && e.edited)).toBe(true);
  });
});

describe('where items are used', () => {
  it('lists blocks using an exercise or timer and workouts using a block', async () => {
    const db = await freshDb();
    const timer = newTimerTemplate('emom');
    await db.timerTemplates.add(timer);
    const bt = newBlockTemplate('sets_reps', 10, 'Push block');
    bt.block = withTimer(addExercise(bt.block, 'push-up', 60), timer);
    await db.blockTemplates.add(bt);
    const w = newProgram('Upper');
    w.days[0].blocks = [linkedBlock(bt)];
    await db.programs.add(w);
    expect((await blocksUsingExercise(db, 'push-up')).map((b) => b.name)).toEqual(['Push block']);
    expect((await blocksUsingExercise(db, 'back-squat')).length).toBe(0);
    expect((await blocksUsingTimer(db, timer.id)).map((b) => b.name)).toEqual(['Push block']);
    expect((await workoutsUsingBlock(db, bt.id)).map((p) => p.name)).toEqual(['Upper']);
  });
});

describe('how exercises are logged', () => {
  it('has three options; older “reps” and “time” become weight × reps and weight × time', async () => {
    const { trackingOf, migrateTracking, SEED_EXERCISES } = await import('../src/db/repo');
    expect(trackingOf({ tracking: 'reps' })).toBe('weight_reps');
    expect(trackingOf({ tracking: 'time' })).toBe('weight_time');
    expect(trackingOf({})).toBe('weight_reps');
    expect(new Set(SEED_EXERCISES.map((e) => e.tracking))).toEqual(new Set(['weight_reps', 'weight_time', 'time_distance']));
    const db = await freshDb();
    await db.exercises.bulkPut([
      { id: 'custom-a', name: 'A', category: 'strength', equipment: 'none', primaryMuscles: ['abs'], secondaryMuscles: [], isCustom: true, tracking: 'time' },
      { id: 'custom-b', name: 'B', category: 'bodyweight', equipment: 'none', primaryMuscles: ['abs'], secondaryMuscles: [], isCustom: true, tracking: 'reps' },
    ]);
    expect(await migrateTracking(db)).toBe(2);
    expect((await db.exercises.get('custom-a'))!.tracking).toBe('weight_time');
    expect((await db.exercises.get('custom-b'))!.tracking).toBe('weight_reps');
  });
});
