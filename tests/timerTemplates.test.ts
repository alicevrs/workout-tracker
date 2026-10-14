import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';
import { createBackup, readBackup, restoreBackup } from '../src/lib/backup';
import { addExercise, linkedBlock, newBlockTemplate } from '../src/lib/blockTemplates';
import { describeBlock, estimateBlockSeconds, newProgram } from '../src/lib/program';
import { createSession } from '../src/lib/session';
import { emptyPayload, mergePayloads } from '../src/lib/sync/merge';
import { autoTimerName, newTimerTemplate, syncTimer, unlinkTimer, withTimer } from '../src/lib/timerTemplates';

let n = 0;
async function freshDb() {
  const db = new WorkoutDB(`timer-tpl-test-${++n}`);
  await ensureSeeded(db);
  return db;
}

describe('saved timers', () => {
  it('start as a Tabata named after its settings', () => {
    const t = newTimerTemplate();
    expect(t.timer.kind).toBe('tabata');
    expect(t.name).toBe(autoTimerName(t.timer));
  });

  it('AMRAP / EMOM / For Time sets become one block per set with a set rest when a workout starts', () => {
    const t = newTimerTemplate('amrap');
    t.timer = { ...t.timer, minutes: 8, sets: 3, setRestSec: 90 };
    const b = withTimer(addExercise(newBlockTemplate().block, 'push-up', 60), t);
    expect(b.params).toMatchObject({ timeCapMin: 8, extraSets: 2, restBetweenSetsSec: 90 });
    expect(estimateBlockSeconds(b)).toBe(3 * 8 * 60 + 2 * 90);
    expect(describeBlock(b)).toContain('3 sets');

    const p = newProgram('W');
    p.days[0].blocks = [b];
    const s = createSession({ program: p, day: p.days[0] });
    expect(s.blocks.map((x) => x.name)).toEqual(['AMRAP · set 1/3', 'AMRAP · set 2/3', 'AMRAP · set 3/3']);
    expect(new Set(s.blocks.map((x) => x.id)).size).toBe(3);
    expect(s.blocks.map((x) => x.timer.restBeforeSec ?? 0)).toEqual([0, 90, 90]);
    expect(s.blocks[1].timer.prepSec).toBe(0);
    expect(s.blocks.every((x) => !x.params.extraSets && x.entries[0].exerciseId === 'push-up')).toBe(true);

    // one set: unchanged, and going back to one set clears the extra sets
    const single = withTimer(b, { ...t, timer: { ...t.timer, sets: 1 } });
    expect(single.params.extraSets).toBeUndefined();
    expect(createSession({ program: p, day: { ...p.days[0], blocks: [single] } }).blocks).toHaveLength(1);
  });

  it('count a training block by time and keep its exercises', () => {
    const t = newTimerTemplate('tabata');
    t.timer = { ...t.timer, rounds: 2, workSec: 40, restSec: 20 };
    const block = addExercise(newBlockTemplate().block, 'push-up', 60);
    const b = withTimer(block, t);
    expect(b.format).toBe('tabata');
    expect(b.timerId).toBe(t.id);
    expect(b.params).toMatchObject({ rounds: 2, workSec: 40, restSec: 20, extraSets: 0 });
    expect(b.entries.map((e) => e.exerciseId)).toEqual(['push-up']);
  });

  it('changes reach linked blocks and the workouts that use them; deleting keeps the times', async () => {
    const db = await freshDb();
    const t = newTimerTemplate('emom');
    await db.timerTemplates.add(t);
    const bt = newBlockTemplate();
    bt.block = withTimer(addExercise(bt.block, 'push-up', 60), t);
    await db.blockTemplates.add(bt);
    const p = newProgram('W');
    p.days[0].blocks = [linkedBlock(bt)];
    await db.programs.add(p);

    const changed = { ...t, timer: { ...t.timer, minutes: 12, everySec: 120 } };
    await db.timerTemplates.put(changed);
    expect(await syncTimer(db, changed)).toBe(1);
    expect((await db.blockTemplates.get(bt.id))!.block.params).toMatchObject({ totalMin: 12, intervalSec: 120 });
    expect((await db.programs.get(p.id))!.days[0].blocks[0].params).toMatchObject({ totalMin: 12, intervalSec: 120 });

    await unlinkTimer(db, t.id);
    const after = (await db.blockTemplates.get(bt.id))!.block;
    expect(after.timerId).toBeUndefined();
    expect(after.params).toMatchObject({ totalMin: 12, intervalSec: 120 });
  });

  it('are kept in backups and in sync merges (also with copies from older versions)', async () => {
    const a = await freshDb();
    await a.timerTemplates.add(newTimerTemplate('amrap'));
    const file = await createBackup(a);
    const b = await freshDb();
    await restoreBackup(b, readBackup(JSON.stringify(file)), 'replace');
    expect(await b.timerTemplates.count()).toBe(1);

    const local = { ...emptyPayload(), timerTemplates: [newTimerTemplate()] };
    const old = { ...emptyPayload() } as Partial<ReturnType<typeof emptyPayload>>;
    delete old.timerTemplates;
    expect(mergePayloads(local, old as ReturnType<typeof emptyPayload>).timerTemplates).toHaveLength(1);
  });
});

describe('timers from existing training blocks', () => {
  it('creates one timer per distinct setting, links the blocks and their workouts, and is stable across devices', async () => {
    const { timersFromBlocks } = await import('../src/lib/timerTemplates');
    const make = async () => {
      const db = await freshDb();
      const a = newBlockTemplate('tabata', 10, 'Abs');
      a.id = 'ba';
      a.block.params = { rounds: 4, workSec: 40, restSec: 0, extraSets: 3, restBetweenSetsSec: 20 };
      const b = newBlockTemplate('tabata', 10, 'Core');
      b.id = 'bb';
      b.block.params = { ...a.block.params };
      const c = newBlockTemplate('emom', 10, 'Hip thrust');
      c.id = 'bc';
      c.block.params = { totalMin: 12, intervalSec: 120 };
      const d = newBlockTemplate('sets_reps', 10, 'Squat');
      d.id = 'bd';
      await db.blockTemplates.bulkAdd([a, b, c, d]);
      const p = newProgram('W');
      p.days[0].blocks = [linkedBlock(c)];
      await db.programs.add(p);
      return { db, p };
    };
    const { db, p } = await make();
    expect(await timersFromBlocks(db)).toBe(2);
    const timers = await db.timerTemplates.toArray();
    expect(timers.map((t) => t.name).sort()).toEqual(['EMOM Every 2:00 for 12 min', 'Tabata 4 × 0:40 / 0:00 · 4 sets, rest 0:20']);
    const blocks = await db.blockTemplates.toArray();
    expect(blocks.find((x) => x.id === 'ba')!.block.timerId).toBe(blocks.find((x) => x.id === 'bb')!.block.timerId);
    expect(blocks.find((x) => x.id === 'bd')!.block.timerId).toBeUndefined();
    expect(blocks.find((x) => x.id === 'ba')!.block.params).toMatchObject({ rounds: 4, workSec: 40, restSec: 0, extraSets: 3, restBetweenSetsSec: 20 });
    expect((await db.programs.get(p.id))!.days[0].blocks[0].timerId).toBe(blocks.find((x) => x.id === 'bc')!.block.timerId);
    // nothing left to convert; another device makes the same timer ids
    expect(await timersFromBlocks(db)).toBe(0);
    const other = await make();
    await timersFromBlocks(other.db);
    expect((await other.db.timerTemplates.toArray()).map((t) => t.id).sort()).toEqual(timers.map((t) => t.id).sort());
  });
});
