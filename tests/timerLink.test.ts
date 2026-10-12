import { describe, expect, it } from 'vitest';
import { newBlock, newEntry } from '../src/lib/program';
import { blockToPerformed } from '../src/lib/session';
import { complete, initialState, skip, start, sync } from '../src/lib/timer/engine';
import { applyCompleted } from '../src/lib/timer/link';
import { buildPhases } from '../src/lib/timer/phases';

const S = 1000;

describe('timer → session link', () => {
  it('marks planned sets done with the values typed in the timer, and skipped sets as skipped', () => {
    const b = newBlock('sets_reps', 0);
    b.entries = [{ ...newEntry('bench', 'sets_reps'), sets: 3, reps: 8, targetWeight: 60, restSec: 60 }];
    const blocks = [blockToPerformed(b)];
    const phases = buildPhases(blocks);
    let s = start(phases, initialState(), 0);
    s = complete(phases, s, 40 * S); // set 1 done
    s = sync(phases, s, 100 * S); // rest over
    s = skip(phases, s, 101 * S); // set 2 skipped
    const out = applyCompleted(blocks, phases, s.completed, 0, { 0: { reps: 9, weight: 62.5 } });
    const sets = out[0].entries[0].sets;
    expect(sets[0]).toMatchObject({ completed: true, reps: 9, weight: 62.5 });
    expect(sets[1]).toMatchObject({ completed: false, skipped: true });
    expect(sets[2]).toMatchObject({ completed: false });
    expect(blocks[0].entries[0].sets[0].completed).toBe(false); // input not mutated
  });

  it('appends one set per Tabata work round and measures block time', () => {
    const b = newBlock('tabata', 10);
    b.entries = [newEntry('burpee', 'tabata'), newEntry('squat', 'tabata')];
    const blocks = [blockToPerformed(b)];
    const phases = buildPhases(blocks);
    let s = start(phases, initialState(), 0);
    s = sync(phases, s, 10 * 60 * S);
    const out = applyCompleted(blocks, phases, s.completed, 0);
    expect(out[0].entries[0].sets).toHaveLength(4);
    expect(out[0].entries[1].sets).toHaveLength(4);
    expect(out[0].entries[0].sets[0]).toMatchObject({ durationSec: 20, completed: true });
    expect(out[0].durationSec).toBe(230); // 8 × 20 + 7 × 10, get-ready excluded
  });

  it('is incremental: applying from an offset does not duplicate sets', () => {
    const b = newBlock('emom', 0);
    b.params = { totalMin: 3, intervalSec: 60 };
    b.entries = [{ ...newEntry('swing', 'emom'), reps: 15 }];
    const blocks = [blockToPerformed(b)];
    const phases = buildPhases(blocks);
    let s = start(phases, initialState(), 0);
    s = sync(phases, s, 61 * S);
    let out = applyCompleted(blocks, phases, s.completed, 0);
    const applied = s.completed.length;
    s = sync(phases, s, 200 * S);
    out = applyCompleted(out, phases, s.completed, applied, { 1: { reps: 12 } });
    expect(out[0].entries[0].sets.map((x) => x.reps)).toEqual([15, 12, 15]);
  });

  it('stores the For Time result when the user taps Finish', () => {
    const b = newBlock('for_time', 0);
    b.params = { targetRounds: 5 };
    const blocks = [blockToPerformed(b)];
    const phases = buildPhases(blocks);
    let s = start(phases, initialState(), 0);
    s = complete(phases, s, 425 * S);
    const out = applyCompleted(blocks, phases, s.completed, 0);
    expect(out[0].result?.timeSec).toBe(425);
    expect(s.status).toBe('finished');
  });
});
