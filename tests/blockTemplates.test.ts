import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';
import { createBackup, readBackup, restoreBackup } from '../src/lib/backup';
import { blockFromTemplate, duplicateTemplate, newBlockTemplate, templateFromBlock } from '../src/lib/blockTemplates';
import { newBlock, newEntry } from '../src/lib/program';

let n = 0;
async function freshDb() {
  const db = new WorkoutDB(`tpl-test-${++n}`);
  await ensureSeeded(db);
  return db;
}

describe('exercise templates', () => {
  it('copies blocks with fresh ids both ways, so templates and workouts stay independent', () => {
    const b = newBlock('emom');
    b.name = 'Hip thrust EMOM';
    b.entries = [newEntry('hip-thrust', 'emom')];
    const t = templateFromBlock(b);
    expect(t.name).toBe('Hip thrust EMOM');
    expect(t.block.id).not.toBe(b.id);
    expect(t.block.entries[0].id).not.toBe(b.entries[0].id);
    const used = blockFromTemplate(t);
    expect(used.name).toBe('Hip thrust EMOM');
    expect(used.id).not.toBe(t.block.id);
    const copy = duplicateTemplate(t);
    expect(copy.id).not.toBe(t.id);
    expect(copy.name).toBe('Hip thrust EMOM (copy)');
  });

  it('are included in backups, and older backups without them still import', async () => {
    const a = await freshDb();
    await a.blockTemplates.add(newBlockTemplate('tabata', 10, 'Abs tabata'));
    const file = await createBackup(a);
    const b = await freshDb();
    await restoreBackup(b, readBackup(JSON.stringify(file)), 'replace');
    expect((await b.blockTemplates.toArray()).map((t) => t.name)).toEqual(['Abs tabata']);

    const old = JSON.parse(JSON.stringify(file));
    delete old.data.blockTemplates;
    const c = await freshDb();
    await restoreBackup(c, readBackup(old), 'merge');
    expect(await c.blockTemplates.count()).toBe(0);
  });
});

describe('exercise block editor model', () => {
  it('combines exercises in sequence (rounds) or as a choreographed circuit, with rest after each round', async () => {
    const { addExercise, withStructure, withSetsRest, structureOf, restOf, setsOf } = await import('../src/lib/blockTemplates');
    let b = newBlock('sets_reps');
    b = addExercise(b, 'hip-abduction', 90);
    b = addExercise(b, 'hip-adduction', 90);
    expect(structureOf(b)).toBe('none');
    b = withSetsRest(b, 4, 60);
    expect(b.entries.map((e) => [e.grouping, e.sets, e.restSec])).toEqual([
      ['none', 4, 60],
      ['none', 4, 60],
    ]);
    b = withStructure(b, 'sequence');
    expect(structureOf(b)).toBe('sequence');
    expect(b.entries.map((e) => [e.grouping, e.groupLabel, e.sets, e.restSec])).toEqual([
      ['circuit', 'A', 4, 0],
      ['circuit', 'A', 4, 60],
    ]);
    expect([setsOf(b), restOf(b)]).toEqual([4, 60]);
    b = withStructure(b, 'circuit');
    expect(b.circuit).toBe(true);
    expect(structureOf(b)).toBe('circuit');
    expect([setsOf(b), restOf(b)]).toEqual([4, 60]);
    b = withStructure(b, 'none');
    expect(b.circuit).toBeUndefined();
    expect(b.entries.map((e) => [e.grouping, e.restSec])).toEqual([
      ['none', 60],
      ['none', 60],
    ]);
    // A single exercise can be a circuit too.
    let one = addExercise(newBlock('sets_reps'), 'back-squat', 90);
    one = withStructure(one, 'circuit');
    expect([structureOf(one), one.circuit]).toEqual(['circuit', true]);
  });

  it('switches between reps and timers keeping exercises and weights', async () => {
    const { addExercise, withFormat, quickFromParams, paramsFromQuick } = await import('../src/lib/blockTemplates');
    let b = addExercise(newBlock('sets_reps'), 'hip-thrust', 90);
    b.entries[0].targetWeight = 100;
    b = withFormat(b, 'emom');
    expect(b.format).toBe('emom');
    expect(b.entries[0]).toMatchObject({ exerciseId: 'hip-thrust', targetWeight: 100, grouping: 'none' });
    b.params = paramsFromQuick({ ...quickFromParams('emom', b.params), everySec: 120, minutes: 12 }, b.params);
    expect(b.params).toMatchObject({ intervalSec: 120, totalMin: 12 });
    b = withFormat(b, 'sets_reps');
    expect(b.entries[0]).toMatchObject({ sets: 3, restSec: 60, targetWeight: 100 });
  });

  it('updates linked workout parts when the block is saved, and unlinks them when it is deleted', async () => {
    const { linkedBlock, syncTemplate, unlinkTemplate } = await import('../src/lib/blockTemplates');
    const { newWorkout } = await import('../src/lib/workouts');
    const db = await freshDb();
    const t = newBlockTemplate('sets_reps', 10, 'Squat');
    const w = newWorkout('Legs');
    const part = linkedBlock(t);
    w.days[0].blocks = [part, newBlock('amrap')];
    await db.programs.add(w);
    const changed = { ...t, name: 'Back squat', block: { ...t.block, optional: true } };
    expect(await syncTemplate(db, changed)).toBe(1);
    const after = (await db.programs.get(w.id))!.days[0].blocks;
    expect(after[0]).toMatchObject({ id: part.id, name: 'Back squat', optional: true, templateId: t.id });
    expect(after[1].format).toBe('amrap');
    await unlinkTemplate(db, t.id);
    expect((await db.programs.get(w.id))!.days[0].blocks[0].templateId).toBeUndefined();
  });
});

describe('leftover empty blocks', () => {
  it('removes unnamed blocks without exercises that no workout uses', async () => {
    const { removeEmptyBlocks, OLD_BLOCK_NAME, addExercise, linkedBlock } = await import('../src/lib/blockTemplates');
    const { newProgram } = await import('../src/lib/program');
    const db = await freshDb();
    const old = newBlockTemplate('sets_reps', 10, OLD_BLOCK_NAME);
    const fresh = newBlockTemplate();
    const named = newBlockTemplate('sets_reps', 10, 'Warm-up');
    const withEx = newBlockTemplate();
    withEx.block = addExercise(withEx.block, 'push-up', 60);
    const inWorkout = newBlockTemplate();
    await db.blockTemplates.bulkAdd([old, fresh, named, withEx, inWorkout]);
    const p = newProgram('W');
    p.days[0].blocks = [linkedBlock(inWorkout)];
    await db.programs.add(p);
    expect(await removeEmptyBlocks(db)).toBe(2);
    expect((await db.blockTemplates.toArray()).map((t) => t.id).sort()).toEqual([named.id, withEx.id, inWorkout.id].sort());
  });
});

describe('count by follows the exercises', () => {
  it('reps for Weight × reps, time for timed exercises, nothing without exercises', async () => {
    const { blockKind, exerciseCountBy, addExercise } = await import('../src/lib/blockTemplates');
    const { SEED_EXERCISES } = await import('../src/db/repo');
    const map = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
    expect(exerciseCountBy(map.get('push-up'))).toBe('reps');
    expect(exerciseCountBy(map.get('dead-hang'))).toBe('time');
    const empty = newBlockTemplate().block;
    expect(blockKind(empty, map)).toBe('reps');
    expect(blockKind(addExercise(empty, 'dead-hang', 60), map)).toBe('time');
  });
});

describe('log as belongs to the training block', () => {
  it('older blocks and workout parts take it from their first exercise, once', async () => {
    const { migrateBlockLogAs, addExercise, linkedBlock, blockLogAs } = await import('../src/lib/blockTemplates');
    const { newProgram } = await import('../src/lib/program');
    const db = await freshDb();
    const hang = newBlockTemplate('tabata');
    hang.block = addExercise(hang.block, 'dead-hang', 60);
    const push = newBlockTemplate();
    push.block = addExercise(push.block, 'push-up', 60);
    const empty = newBlockTemplate();
    await db.blockTemplates.bulkAdd([hang, push, empty]);
    const p = newProgram('W');
    p.days[0].blocks = [linkedBlock(hang)];
    await db.programs.add(p);
    expect(await migrateBlockLogAs(db)).toBe(3);
    expect((await db.blockTemplates.get(hang.id))!.block.logAs).toBe('weight_time');
    expect((await db.blockTemplates.get(push.id))!.block.logAs).toBe('weight_reps');
    expect((await db.blockTemplates.get(empty.id))!.block.logAs).toBeUndefined();
    expect((await db.programs.get(p.id))!.days[0].blocks[0].logAs).toBe('weight_time');
    expect(await migrateBlockLogAs(db)).toBe(0);
    // A block's own choice wins over its exercises.
    expect(blockLogAs({ ...push.block, logAs: 'time_distance' }, new Map())).toBe('time_distance');
  });
});

describe('in sequence now means rounds', () => {
  it('older training blocks with straight sets or alternating become rounds, keeping sets and rest', async () => {
    const { migrateBlockStructure, linkedBlock } = await import('../src/lib/blockTemplates');
    const { newProgram, newEntry } = await import('../src/lib/program');
    const db = await freshDb();
    const old = newBlockTemplate();
    old.block.entries = [
      { ...newEntry('back-squat', 'sets_reps', 90), sets: 4, restSec: 90 },
      { ...newEntry('romanian-deadlift', 'sets_reps', 90), sets: 4, restSec: 90 },
    ];
    const single = newBlockTemplate();
    single.block.entries = [newEntry('push-up', 'sets_reps', 60)];
    await db.blockTemplates.bulkAdd([old, single]);
    const p = newProgram('W');
    p.days[0].blocks = [linkedBlock(old)];
    await db.programs.add(p);
    expect(await migrateBlockStructure(db)).toBe(1);
    const b = (await db.blockTemplates.get(old.id))!.block;
    expect(b.entries.map((e) => [e.grouping, e.sets, e.restSec])).toEqual([
      ['circuit', 4, 0],
      ['circuit', 4, 90],
    ]);
    expect((await db.programs.get(p.id))!.days[0].blocks[0].entries[0].grouping).toBe('circuit');
    expect(await migrateBlockStructure(db)).toBe(0);
  });
});

describe('log fields: reps, time, distance in any combination', () => {
  it('sets each combination up the right way', async () => {
    const { addExercise, withLog, logMode, durationOf, setsOf, restOf } = await import('../src/lib/blockTemplates');
    const base = addExercise(newBlockTemplate().block, 'treadmill-run', 60);
    expect(logMode(['reps'])).toBe('R');
    expect(logMode(['time', 'reps'])).toBe('RT');
    expect(logMode(['reps', 'time', 'distance'])).toBe('RTD');
    expect(withLog(base, ['reps']).format).toBe('sets_reps');
    const t = withLog(base, ['time']);
    expect([t.format, Math.round((t.params.timeCapMin ?? 0) * 60), setsOf(t), restOf(t)]).toEqual(['sets_reps', 600, 1, 0]);
    const dt = withLog(base, ['time', 'distance']);
    expect([dt.format, durationOf(dt), setsOf(dt), restOf(dt)]).toEqual(['timed_sets', 60, 1, 0]);
    const d = withLog(base, ['distance']);
    expect([d.format, setsOf(d), restOf(d)]).toEqual(['sets_reps', 1, 0]);
    expect(withLog(base, ['time', 'distance']).format).toBe('timed_sets');
    expect(withLog(base, ['reps', 'distance']).format).toBe('sets_reps');
    const rt = withLog(base, ['reps', 'time']);
    expect(['tabata', 'amrap', 'emom', 'for_time']).toContain(rt.format);
    expect(rt.timerId).toBeUndefined();
  });

  it('older blocks get their log from “Logged as” and their format', async () => {
    const { blockLog } = await import('../src/lib/blockTemplates');
    const { newBlock } = await import('../src/lib/program');
    const none = new Map();
    expect(blockLog({ ...newBlock('sets_reps'), logAs: 'weight_reps' }, none)).toEqual(['reps']);
    expect(blockLog({ ...newBlock('emom'), logAs: 'weight_reps' }, none)).toEqual(['reps', 'time']);
    expect(blockLog({ ...newBlock('timed_sets'), logAs: 'weight_time' }, none)).toEqual(['time']);
    expect(blockLog({ ...newBlock('tabata'), logAs: 'time_distance' }, none)).toEqual(['reps', 'time', 'distance']);
    expect(blockLog({ ...newBlock('sets_reps'), log: ['distance'] }, none)).toEqual(['distance']);
  });

  it('a distance done in several reps is split over the sets', async () => {
    const { plannedSet } = await import('../src/lib/session');
    const { newEntry } = await import('../src/lib/program');
    const e = { ...newEntry('running', 'sets_reps', 60), sets: 4, distanceKm: 2 };
    expect(plannedSet(e, 1).distanceM).toBe(500);
  });
});

describe('time-only blocks in the workout', () => {
  it('run as one countdown, are logged as planned sets with reps and weight, and show a Time tag', async () => {
    const { addExercise, withLog, withTotalTime } = await import('../src/lib/blockTemplates');
    const { blockTag, describeBlock, estimateBlockSeconds } = await import('../src/lib/program');
    const { blockToPerformed } = await import('../src/lib/session');
    const { blockPhases } = await import('../src/lib/timer/phases');
    let b = addExercise(addExercise(newBlockTemplate().block, 'push-up', 60), 'back-squat', 60);
    b.entries = b.entries.map((e) => ({ ...e, reps: 12, targetWeight: 20 }));
    b = withTotalTime(withLog(b, ['time']), 300);
    expect(blockTag(b)).toBe('Time');
    expect(describeBlock(b)).toBe('5 min · 2 exercises');
    expect(estimateBlockSeconds(b)).toBe(300);
    const pb = blockToPerformed(b);
    expect(pb.entries.map((e) => e.sets.map((x) => [x.reps, x.weight]))).toEqual([[[12, 20]], [[12, 20]]]);
    const work = blockPhases(pb, 0).filter((p) => p.kind === 'work');
    expect(work.map((p) => [p.label, p.durationSec])).toEqual([['Time', 300]]);
    const { completeBlocks } = await import('../src/lib/quickLog');
    const done = completeBlocks([pb], [0], 0).blocks[0];
    expect(done.entries.every((e) => e.sets.every((x) => x.completed && x.reps === 12 && x.weight === 20))).toBe(true);
    expect(done.durationSec).toBe(300);
  });
});
