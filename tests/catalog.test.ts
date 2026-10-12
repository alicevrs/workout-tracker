import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import { MUSCLE_IDS } from '../src/data/muscles';
import { WorkoutDB } from '../src/db/db';
import { ensureSeeded } from '../src/db/repo';

describe('exercise catalog', () => {
  it('has about 120+ exercises with unique ids', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(120);
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
  });

  it('only uses known muscle ids and every exercise has a primary muscle', () => {
    for (const e of exercises) {
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) expect(MUSCLE_IDS, `${e.id}: ${m}`).toContain(m);
      for (const m of e.primaryMuscles) expect(e.secondaryMuscles, e.id).not.toContain(m);
    }
  });

  it('seeds the database once and leaves custom exercises alone', async () => {
    const db = new WorkoutDB('seed-test');
    await db.exercises.add({ id: 'custom-1', name: 'Mine', category: 'strength', equipment: 'other', primaryMuscles: ['chest'], secondaryMuscles: [], isCustom: true });
    await ensureSeeded(db);
    await ensureSeeded(db);
    expect(await db.exercises.count()).toBe(exercises.length + 1);
    expect((await db.exercises.get('custom-1'))?.name).toBe('Mine');
  });
});
