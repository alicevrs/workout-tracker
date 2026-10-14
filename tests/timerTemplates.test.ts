import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';
import { createBackup, readBackup, restoreBackup } from '../src/lib/backup';
import { addExercise, linkedBlock, newBlockTemplate } from '../src/lib/blockTemplates';
import { newProgram } from '../src/lib/program';
import { emptyPayload, mergePayloads } from '../src/lib/sync/merge';
import { autoTimerName, newTimerTemplate, syncTimer, unlinkTimer, withTimer } from '../src/lib/timerTemplates';

let n = 0;
async function freshDb() {
  const db = new WorkoutDB(`timer-tpl-test-${++n}`);
  await ensureSeeded(db);
  return db;
}

describe('saved timers', () => {
  it('start as a Tabata named after its settings; sets stay only on Tabata', () => {
    const t = newTimerTemplate();
    expect(t.timer.kind).toBe('tabata');
    expect(t.name).toBe(autoTimerName(t.timer));
    expect(newTimerTemplate('amrap').timer.sets).toBeUndefined();
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
