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
  it('combines exercises in sequence, alternating (superset) or circuit, with rest after each round', async () => {
    const { addExercise, withStructure, withSetsRest, structureOf, restOf, setsOf } = await import('../src/lib/blockTemplates');
    let b = newBlock('sets_reps');
    b = addExercise(b, 'hip-abduction', 90);
    b = addExercise(b, 'hip-adduction', 90);
    expect(structureOf(b)).toBe('sequence');
    b = withSetsRest(b, 4, 60);
    expect(b.entries.map((e) => [e.sets, e.restSec])).toEqual([[4, 60], [4, 60]]);
    b = withStructure(b, 'alternate');
    expect(b.entries.map((e) => [e.grouping, e.groupLabel, e.restSec])).toEqual([['superset', 'A', 0], ['superset', 'A', 60]]);
    expect([setsOf(b), restOf(b)]).toEqual([4, 60]);
    b = withStructure(b, 'circuit');
    expect(b.entries.every((e) => e.grouping === 'circuit')).toBe(true);
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
