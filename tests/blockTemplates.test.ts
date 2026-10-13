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
