import { describe, expect, it } from 'vitest';
import type { PerformedBlock } from '../src/db/types';
import { defaultParams, defaultTimer, newBlock, newEntry } from '../src/lib/program';
import { blockToPerformed } from '../src/lib/session';
import { complete, finish, initialState, pause, resume, skip, snapshot, start, sync, upcomingSounds } from '../src/lib/timer/engine';
import { blockPhases, buildPhases, totalPlannedSeconds } from '../src/lib/timer/phases';

const S = 1000;

function performed(format: PerformedBlock['format'], entries = [newEntry('burpee', format)], prepSec = 10): PerformedBlock {
  const b = newBlock(format, prepSec);
  b.entries = entries;
  return blockToPerformed(b);
}

describe('phase building', () => {
  it('builds a default Tabata: get ready + 8 work + 7 rest = 4 minutes', () => {
    const phases = blockPhases(performed('tabata'), 0);
    expect(phases.map((p) => p.kind).join(',')).toBe(['prep', ...Array(8).fill('work,rest')].join(',').replace(/,rest$/, ''));
    expect(phases.filter((p) => p.kind === 'work')).toHaveLength(8);
    expect(totalPlannedSeconds(phases)).toBe(10 + 8 * 20 + 7 * 10);
    expect(phases[1]).toMatchObject({ round: 1, totalRounds: 8, durationSec: 20 });
  });

  it('adds extra Tabata sets with rest between sets', () => {
    const b = performed('tabata', [newEntry('a', 'tabata'), newEntry('b', 'tabata')], 0);
    b.params = { ...defaultParams('tabata'), extraSets: 1, restBetweenSetsSec: 60 };
    const phases = blockPhases(b, 0);
    expect(phases.filter((p) => p.kind === 'work')).toHaveLength(16);
    expect(phases.filter((p) => p.label === 'Set rest')).toHaveLength(1);
    // exercises alternate by round
    expect(phases.filter((p) => p.kind === 'work').slice(0, 3).map((p) => p.exerciseId)).toEqual(['a', 'b', 'a']);
  });

  it('builds EMOM intervals that cycle through the exercises', () => {
    const b = performed('emom', [newEntry('a', 'emom'), newEntry('b', 'emom')], 0);
    b.params = { totalMin: 10, intervalSec: 60 };
    const phases = blockPhases(b, 0);
    expect(phases).toHaveLength(10);
    expect(phases.every((p) => p.durationSec === 60 && p.kind === 'work')).toBe(true);
    expect(phases.map((p) => p.exerciseId).slice(0, 4)).toEqual(['a', 'b', 'a', 'b']);
    expect(phases[9]).toMatchObject({ interval: 10, totalIntervals: 10 });
  });

  it('builds AMRAP as one countdown and For Time as an open count-up', () => {
    const amrap = performed('amrap', undefined, 0);
    amrap.params = { timeCapMin: 12 };
    expect(blockPhases(amrap, 0)).toMatchObject([{ kind: 'work', durationSec: 720, countUp: false }]);
    const ft = performed('for_time', undefined, 0);
    ft.params = { targetRounds: 3 };
    expect(blockPhases(ft, 0)).toMatchObject([{ kind: 'work', durationSec: null, countUp: true }]);
  });

  it('runs supersets back to back and rests after the pair', () => {
    const a = { ...newEntry('a', 'sets_reps'), sets: 2, restSec: 0, grouping: 'superset' as const, groupLabel: 'A' };
    const b = { ...newEntry('b', 'sets_reps'), sets: 2, restSec: 90, grouping: 'superset' as const, groupLabel: 'A' };
    const phases = blockPhases(performed('sets_reps', [a, b], 0), 0);
    expect(phases.map((p) => `${p.kind}${p.exerciseId ?? ''}${p.set ?? ''}`)).toEqual(['worka1', 'workb1', 'rest', 'worka2', 'workb2']);
    expect(phases[0].durationSec).toBeNull(); // rep-based sets end when the user taps Done
  });

  it('continues drop sets without rest', () => {
    const e = { ...newEntry('curl', 'sets_reps'), sets: 1, targetWeight: 20, grouping: 'dropset' as const, drops: 2, dropPercent: 25 };
    const phases = blockPhases(performed('sets_reps', [e], 0), 0);
    expect(phases.map((p) => p.label)).toEqual(['Work', 'Drop 1', 'Drop 2']);
    expect(phases.map((p) => p.targetWeight)).toEqual([20, 15, 11.5]);
  });

  it('chains several blocks into one mixed run', () => {
    const blocks = [performed('tabata'), performed('amrap'), performed('emom')];
    const phases = buildPhases(blocks);
    expect(new Set(phases.map((p) => p.blockIndex))).toEqual(new Set([0, 1, 2]));
    expect(phases.filter((p) => p.kind === 'prep')).toHaveLength(3);
  });

  it('respects per-segment sound settings for intervals', () => {
    const b = blockToPerformed({ ...newBlock('intervals', 0), timer: defaultTimer(0) });
    b.params.segments![1].sound = false;
    b.params.repeats = 2;
    const phases = blockPhases(b, 0);
    expect(phases.map((p) => `${p.kind}:${p.sound}`)).toEqual(['work:true', 'rest:false', 'work:true']);
  });
});

describe('timer engine', () => {
  const tabata = blockPhases(performed('tabata'), 0); // prep 10, work 20, rest 10, …

  it('derives the phase from wall-clock time, even after a long background pause', () => {
    let s = start(tabata, initialState(), 0);
    // App suspended until 35 s: prep (0–10) and work 1 (10–30) passed; rest 1 runs 30–40.
    s = sync(tabata, s, 35 * S);
    const snap = snapshot(tabata, s, 35 * S);
    expect(snap.phase?.kind).toBe('rest');
    expect(snap.remainingMs).toBe(5 * S);
    expect(s.completed.map((c) => c.index)).toEqual([0, 1]);
    // Phases chain from the planned end time, not from when the app woke up.
    expect(s.phaseStartedAt).toBe(30 * S);
  });

  it('finishes when all timed phases have passed', () => {
    let s = start(tabata, initialState(), 0);
    s = sync(tabata, s, 10 * 60 * S);
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(240 * S);
    expect(s.completed).toHaveLength(tabata.length);
  });

  it('pause and resume shift the schedule by the paused time', () => {
    let s = start(tabata, initialState(), 0);
    s = pause(s, 5 * S);
    expect(snapshot(tabata, s, 60 * S).remainingMs).toBe(5 * S); // frozen while paused
    s = resume(s, 65 * S);
    s = sync(tabata, s, 69 * S);
    expect(snapshot(tabata, s, 69 * S).remainingMs).toBe(1 * S);
    s = sync(tabata, s, 70 * S);
    expect(snapshot(tabata, s, 70 * S).phase?.kind).toBe('work');
    expect(snapshot(tabata, s, 70 * S).totalElapsedMs).toBe(10 * S);
  });

  it('open-ended work waits for Done, then rest counts down', () => {
    const e = { ...newEntry('bench', 'sets_reps'), sets: 2, restSec: 90 };
    const phases = blockPhases(performed('sets_reps', [e], 0), 0);
    let s = start(phases, initialState(), 0);
    s = sync(phases, s, 10 * 60 * S);
    expect(s.index).toBe(0); // still on set 1
    s = complete(phases, s, 45 * S);
    expect(snapshot(phases, s, 45 * S).phase?.kind).toBe('rest');
    expect(s.completed[0]).toMatchObject({ index: 0, elapsedMs: 45 * S, skipped: false });
    s = sync(phases, s, 135 * S);
    expect(snapshot(phases, s, 135 * S).phase).toMatchObject({ kind: 'work', set: 2 });
  });

  it('skip marks the phase as skipped and starts the next one now', () => {
    let s = start(tabata, initialState(), 0);
    s = skip(tabata, s, 3 * S);
    expect(s.completed[0]).toMatchObject({ index: 0, skipped: true });
    expect(s.phaseStartedAt).toBe(3 * S);
    expect(snapshot(tabata, s, 3 * S).phase?.kind).toBe('work');
  });

  it('For Time records the elapsed time on Finish', () => {
    const ft = performed('for_time', undefined, 0);
    ft.params = { targetRounds: 3 };
    const phases = blockPhases(ft, 0);
    let s = start(phases, initialState(), 1000);
    s = finish(phases, s, 1000 + 312 * S);
    expect(s.status).toBe('finished');
    expect(s.completed[0].elapsedMs).toBe(312 * S);
  });

  it('schedules countdown ticks for the last 3 seconds and a sound at each phase change', () => {
    const s = start(tabata, initialState(), 0);
    const sounds = upcomingSounds(tabata, s, 0).slice(0, 8);
    expect(sounds).toEqual([
      { at: 7 * S, kind: 'tick' },
      { at: 8 * S, kind: 'tick' },
      { at: 9 * S, kind: 'tick' },
      { at: 10 * S, kind: 'work' },
      { at: 27 * S, kind: 'tick' },
      { at: 28 * S, kind: 'tick' },
      { at: 29 * S, kind: 'tick' },
      { at: 30 * S, kind: 'rest' },
    ]);
    const all = upcomingSounds(tabata, s, 0);
    expect(all[all.length - 1]).toEqual({ at: 240 * S, kind: 'finish' });
  });

  it('does not schedule sounds while paused or past an open-ended phase', () => {
    const e = { ...newEntry('bench', 'sets_reps'), sets: 2, restSec: 60 };
    const phases = blockPhases(performed('sets_reps', [e], 10), 0);
    const s = start(phases, initialState(), 0);
    expect(upcomingSounds(phases, s, 0).map((x) => x.kind)).toEqual(['tick', 'tick', 'tick', 'work']);
    expect(upcomingSounds(phases, pause(s, 1), 1)).toEqual([]);
  });
});
