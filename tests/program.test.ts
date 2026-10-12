import { describe, expect, it } from 'vitest';
import { cloneProgram, groupEntries, newEntry } from '../src/lib/program';
import { sampleProgram } from '../src/lib/sampleProgram';
import { applyBlockEdit, createSession, performedToBlock, plannedDropWeights } from '../src/lib/session';

describe('program helpers', () => {
  it('groups consecutive superset/circuit entries with the same label', () => {
    const a = { ...newEntry('a', 'sets_reps'), grouping: 'superset' as const, groupLabel: 'A' };
    const b = { ...newEntry('b', 'sets_reps'), grouping: 'superset' as const, groupLabel: 'A' };
    const c = { ...newEntry('c', 'sets_reps'), grouping: 'none' as const };
    const d = { ...newEntry('d', 'sets_reps'), grouping: 'circuit' as const, groupLabel: 'B' };
    const e = { ...newEntry('e', 'sets_reps'), grouping: 'circuit' as const, groupLabel: 'B' };
    const groups = groupEntries([a, b, c, d, e]);
    expect(groups.map((g) => g.entries.map((x) => x.exerciseId).join(''))).toEqual(['ab', 'c', 'de']);
    expect(groups.map((g) => g.kind)).toEqual(['superset', 'none', 'circuit']);
  });

  it('duplicates a program with fresh ids at every level', () => {
    const p = sampleProgram();
    const copy = cloneProgram(p);
    expect(copy.id).not.toBe(p.id);
    expect(copy.days[0].id).not.toBe(p.days[0].id);
    expect(copy.days[0].blocks[0].id).not.toBe(p.days[0].blocks[0].id);
    expect(copy.days[0].blocks[0].entries[0].id).not.toBe(p.days[0].blocks[0].entries[0].id);
    expect(copy.days[0].blocks[0].entries[0].exerciseId).toBe(p.days[0].blocks[0].entries[0].exerciseId);
  });

  it('computes drop set weights rounded to 0.5 kg', () => {
    const e = { ...newEntry('x', 'sets_reps'), targetWeight: 20, grouping: 'dropset' as const, drops: 2, dropPercent: 25 };
    expect(plannedDropWeights(e)).toEqual([15, 11.5]);
  });
});

describe('per-session override', () => {
  it('editing the session plan never changes the program', () => {
    const p = sampleProgram();
    const day = p.days[0];
    const before = JSON.stringify(p);
    const s = createSession({ program: p, day });
    const block = performedToBlock(s.blocks[0]);
    block.entries[0].sets = 6;
    block.entries[0].targetWeight = 100;
    s.blocks[0] = applyBlockEdit(s.blocks[0], block);
    expect(JSON.stringify(p)).toBe(before);
    expect(s.blocks[0].entries[0].sets).toHaveLength(6);
    expect(s.blocks[0].id).not.toBe(day.blocks[0].id);
  });

  it('keeps completed sets when the plan is edited mid-workout', () => {
    const p = sampleProgram();
    const s = createSession({ program: p, day: p.days[0] });
    const pb = s.blocks[0];
    pb.entries[0].sets[0] = { ...pb.entries[0].sets[0], completed: true, reps: 7, weight: 62.5 };
    const plan = performedToBlock(pb);
    plan.entries[0].sets = 2;
    plan.entries[0].targetWeight = 70;
    const edited = applyBlockEdit(pb, plan);
    expect(edited.entries[0].sets).toHaveLength(2);
    expect(edited.entries[0].sets[0]).toMatchObject({ completed: true, reps: 7, weight: 62.5 });
    expect(edited.entries[0].sets[1]).toMatchObject({ completed: false, weight: 70, setNumber: 2 });
  });
});
