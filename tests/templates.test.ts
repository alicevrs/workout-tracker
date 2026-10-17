import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import type { Exercise } from '../src/db/types';
import { DEFAULT_PROFILE } from '../src/db/repo';
import { sessionCalories } from '../src/lib/calories';
import { completeBlocks, loggedDaySession } from '../src/lib/quickLog';
import { createSession } from '../src/lib/session';
import { sessionSummary } from '../src/lib/stats';
import { blockPhases, buildPhases, totalPlannedSeconds } from '../src/lib/timer/phases';
import { myWorkouts, TEMPLATES } from '../src/lib/templates';
import { migrateProgramsToWorkouts, splitProgram } from '../src/lib/workouts';
import { WorkoutDB } from '../src/db/db';
import { sampleProgram } from '../src/lib/sampleProgram';

const ids = new Set((exercises as Exercise[]).map((e) => e.id));
const NAMES: Record<string, string> = { 'Abs + incline walk': 'Abs + cardio', 'Legs & glutes A': 'Legs & glutes 1', 'Legs & glutes B': 'Legs & glutes 2' };
const mine = myWorkouts();
const workout = (name: string) => mine.find((w) => w.name === (NAMES[name] ?? name))!;
const day = (name: string) => workout(name).days[0];
const blockOf = (dayName: string, blockName: string) => createSession({ program: workout(dayName), day: day(dayName) }).blocks.find((b) => b.name === blockName)!;

describe('templates', () => {
  it('only use exercises from the catalog', () => {
    for (const t of TEMPLATES) for (const w of t.create()) for (const d of w.days) for (const b of d.blocks) for (const e of b.entries) expect(ids, `${t.id}: ${e.exerciseId}`).toContain(e.exerciseId);
  });

  it('creates four single-workout templates without weekdays', () => {
    expect(mine.map((w) => w.name)).toEqual(['Abs + cardio', 'Legs & glutes 1', 'Legs & glutes 2', 'Body Pump']);
    expect(mine.every((w) => w.days.length === 1 && w.days[0].weekday === undefined && w.days[0].name === w.name)).toBe(true);
  });

  it('splits old multi-day programs into workouts, once per name, keeping day ids', () => {
    const old = { ...sampleProgram(), name: 'My training week' };
    old.days = [{ ...old.days[0], name: 'Abs + incline walk' }, { ...old.days[1], name: 'Legs & glutes A' }, { ...old.days[0], id: 'dup', name: 'Abs + incline walk' }];
    const split = splitProgram(old);
    expect(split.map((w) => w.name)).toEqual(['Abs + cardio', 'Legs & glutes 1']);
    expect(split[0].id).toBe(old.id);
    expect(split[1].days[0].id).toBe(old.days[1].id);
  });

  it('migrates stored programs and is safe to run twice', async () => {
    const db = new WorkoutDB('migrate-workouts');
    await db.programs.add(sampleProgram());
    expect(await migrateProgramsToWorkouts(db)).toBe(1);
    expect(await migrateProgramsToWorkouts(db)).toBe(0);
    expect((await db.programs.toArray()).every((p) => p.days.length === 1)).toBe(true);
    expect(await db.programs.count()).toBe(3);
  });
});

describe('my training week, as the timer runs it', () => {
  it('abs: 4 sets × 4 rounds of 40 s, no rest between rounds, 20 s between sets', () => {
    const phases = blockPhases(blockOf('Abs + incline walk', 'Abs'), 0).filter((p) => p.kind !== 'prep');
    expect(phases.filter((p) => p.kind === 'work')).toHaveLength(16);
    expect(phases.filter((p) => p.kind === 'rest').map((p) => p.durationSec)).toEqual([20, 20, 20]);
    expect(new Set(phases.map((p) => p.exerciseId).filter(Boolean))).toEqual(new Set(['abs-mixed']));
    expect(totalPlannedSeconds(phases)).toBe(16 * 40 + 3 * 20);
  });

  it('hip thrust: every 2 minutes, warm-up, 4 working sets and one set to failure', () => {
    const phases = blockPhases(blockOf('Legs & glutes A', 'Hip thrust'), 0).filter((p) => p.kind === 'work');
    expect(phases).toHaveLength(6);
    expect(phases.every((p) => p.durationSec === 120)).toBe(true);
    expect(phases.map((p) => [p.targetWeight, p.targetReps ?? 'max', !!p.warmup])).toEqual([
      [60, 15, true],
      [100, 8, false],
      [100, 8, false],
      [100, 8, false],
      [100, 8, false],
      [100, 'max', false],
    ]);
    expect(phases[5].toFailure).toBe(true);
  });

  it('RDL: 4 rounds of 1:20 with 40 s rest', () => {
    const p = blockPhases(blockOf('Legs & glutes A', 'Romanian deadlift'), 0).filter((x) => x.kind !== 'prep');
    expect(p.map((x) => `${x.kind}${x.durationSec}`)).toEqual(['work80', 'rest40', 'work80', 'rest40', 'work80', 'rest40', 'work80']);
  });

  it('bulgarian split squat: 8 minutes alternating legs, no rest', () => {
    const b = blockOf('Legs & glutes A', 'Bulgarian split squat');
    const p = blockPhases(b, 0).filter((x) => x.kind !== 'prep');
    expect(p.map((x) => x.label)).toEqual(['Right leg', 'Left leg', 'Right leg', 'Left leg', 'Right leg', 'Left leg', 'Right leg', 'Left leg']);
  });

  it('abduction/adduction: 4 × open and 3 × close, 1 min each, 15 s to change machine', () => {
    const p = blockPhases(blockOf('Legs & glutes B', 'Abduction / adduction'), 0).filter((x) => x.kind !== 'prep');
    const work = p.filter((x) => x.kind === 'work');
    expect(work.map((x) => x.exerciseId)).toEqual(['hip-abduction-machine', 'hip-adduction-machine', 'hip-abduction-machine', 'hip-adduction-machine', 'hip-abduction-machine', 'hip-adduction-machine', 'hip-abduction-machine']);
    expect(p.filter((x) => x.kind === 'rest').every((x) => x.durationSec === 15)).toBe(true);
  });

  it('cable kickback: 10 rounds of 1 min with 25 s to switch leg', () => {
    const p = blockPhases(blockOf('Legs & glutes B', 'Cable kickback'), 0).filter((x) => x.kind !== 'prep');
    expect(p.filter((x) => x.kind === 'work')).toHaveLength(10);
    expect(p.filter((x) => x.kind === 'rest')).toHaveLength(9);
  });

  it('uses the planned weights', () => {
    const w = (d: string, b: string) => blockPhases(blockOf(d, b), 0).find((p) => p.kind === 'work')?.targetWeight;
    expect(w('Legs & glutes A', 'Romanian deadlift')).toBe(16);
    expect(w('Legs & glutes A', 'Leg press')).toBe(80);
    expect(w('Legs & glutes B', 'Cable kickback')).toBe(8);
    expect(w('Legs & glutes A', 'Bulgarian split squat')).toBe(8);
    const abAd = blockPhases(blockOf('Legs & glutes B', 'Abduction / adduction'), 0).filter((p) => p.kind === 'work');
    expect(abAd.map((p) => p.targetWeight)).toEqual([60, 30, 60, 30, 60, 30, 60]);
    const pump = blockOf('Body Pump', 'Body Pump class (55 min)').entries;
    expect(pump.find((e) => e.exerciseId === 'back-squat')?.planned?.targetWeight).toBe(10);
    expect(pump.find((e) => e.exerciseId === 'push-up')?.planned?.targetWeight).toBeUndefined();
  });

  it('Body Pump lasts about 55 minutes', () => {
    const s = createSession({ program: workout('Body Pump'), day: day('Body Pump') });
    const minutes = totalPlannedSeconds(buildPhases(s.blocks)) / 60;
    expect(minutes).toBeGreaterThan(53);
    expect(minutes).toBeLessThan(57);
  });
});

describe('log as done', () => {
  it('logs every Body Pump exercise as done and makes a 55-minute session', () => {
    const end = new Date('2026-10-14T20:00:00').getTime();
    const s = loggedDaySession(workout('Body Pump'), day('Body Pump'), { endAt: end });
    expect(s.status).toBe('completed');
    expect((s.endedAt! - s.startedAt) / 60000).toBeCloseTo(55, 0);
    const sum = sessionSummary(s);
    expect(sum.sets).toBe(17);
    expect(sum.reps).toBe(90 + 70 + 20 + 30 + 30 + 16 + 40 + 30 + 60 + 60 + 30 + 20 + 15 + 50);
    const kcal = sessionCalories(s, { profile: { ...DEFAULT_PROFILE, weightKg: 60 }, weights: [], exercises: new Map((exercises as Exercise[]).map((e) => [e.id, e])) });
    expect(kcal.kcal).toBeGreaterThan(200);
  });

  it('logs every block, with no optional ones', () => {
    const s = loggedDaySession(workout('Legs & glutes A'), day('Legs & glutes A'));
    const b = s.blocks.find((x) => x.name === 'Bulgarian split squat')!;
    expect(b.skipped).toBeFalsy();
    expect(b.entries[0].sets).toHaveLength(8);
    expect(day('Legs & glutes A').blocks.some((x) => x.optional)).toBe(false);
  });

  it('logs the hip thrust sets with their own weights and reps', () => {
    const s = loggedDaySession(workout('Legs & glutes A'), day('Legs & glutes A'));
    const sets = s.blocks.find((b) => b.name === 'Hip thrust')!.entries[0].sets;
    expect(sets.map((x) => [x.weight, x.reps, !!x.warmup])).toEqual([
      [60, 15, true],
      [100, 8, false],
      [100, 8, false],
      [100, 8, false],
      [100, 8, false],
      [100, undefined, false],
    ]);
  });

  it('completeBlocks fills one block without touching the others', () => {
    const s = createSession({ program: workout('Legs & glutes B'), day: day('Legs & glutes B') });
    const { blocks } = completeBlocks(s.blocks, [2], 0);
    expect(blocks[2].entries[0].sets.every((x) => x.completed)).toBe(true);
    expect(blocks[3].entries[0].sets).toHaveLength(0);
  });
});
