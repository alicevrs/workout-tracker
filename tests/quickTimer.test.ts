import { describe, expect, it } from 'vitest';
import { blockToPerformed } from '../src/lib/session';
import { initialState, start, upcomingCues, upcomingSounds } from '../src/lib/timer/engine';
import { buildPhases, totalPlannedSeconds } from '../src/lib/timer/phases';
import { defaultQuick, describeQuick, quickBlocks, quickSeconds } from '../src/lib/timer/quick';

const S = 1000;
const phasesOf = (blocks: ReturnType<typeof quickBlocks>) => buildPhases(blocks.map(blockToPerformed));

describe('quick timers', () => {
  it('builds a Tabata with sets as one block', () => {
    const blocks = quickBlocks([{ ...defaultQuick('tabata'), rounds: 4, workSec: 20, restSec: 5, sets: 2, setRestSec: 30 }], 10);
    expect(blocks).toHaveLength(1);
    const phases = phasesOf(blocks);
    expect(phases.filter((p) => p.kind === 'work')).toHaveLength(8);
    expect(totalPlannedSeconds(phases)).toBe(10 + 2 * (4 * 20 + 3 * 5) + 30);
    expect(quickSeconds(blocks)).toBe(10 + 2 * 4 * 25 + 30); // estimate counts the rest after the last round too
  });

  it('repeats EMOM sets as blocks with a rest before every set after the first', () => {
    const blocks = quickBlocks([{ ...defaultQuick('emom'), everySec: 120, minutes: 12, sets: 3, setRestSec: 60 }], 10);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.timer.prepSec)).toEqual([10, 0, 0]);
    expect(blocks.map((b) => b.timer.restBeforeSec)).toEqual([undefined, 60, 60]);
    expect(blocks[1].name).toBe('EMOM · set 2/3');
    const phases = phasesOf(blocks);
    expect(phases.filter((p) => p.kind === 'work')).toHaveLength(18);
    expect(phases.filter((p) => p.kind === 'rest').map((p) => p.durationSec)).toEqual([60, 60]);
    expect(quickSeconds(blocks)).toBe(10 + 3 * 12 * 60 + 2 * 60);
  });

  it('chains a mix: rest items become the rest before the next block, trailing rest dropped, repeat', () => {
    const items = [defaultQuick('amrap'), { kind: 'rest' as const, restSec: 90 }, { kind: 'work' as const, workSec: 80, label: 'Plank' }, { kind: 'rest' as const, restSec: 30 }];
    const blocks = quickBlocks(items, 5, 2);
    expect(blocks.map((b) => b.format)).toEqual(['amrap', 'intervals', 'amrap', 'intervals']);
    expect(blocks.map((b) => b.timer.restBeforeSec ?? 0)).toEqual([0, 90, 30, 90]);
    expect(blocks[1].name).toBe('Plank · round 1/2');
    const phases = phasesOf(blocks);
    expect(phases[phases.length - 1]).toMatchObject({ kind: 'work', label: 'Plank', durationSec: 80 });
  });

  it('For Time without cap is open-ended and keeps its interval signal', () => {
    const blocks = quickBlocks([{ ...defaultQuick('for_time'), minutes: 0, everySec: 60 }], 0);
    expect(quickSeconds(blocks)).toBeNull();
    const phases = phasesOf(blocks);
    expect(phases[0]).toMatchObject({ durationSec: null, signalEverySec: 60 });
    const sounds = upcomingSounds(phases, start(phases, initialState(), 0), 0, 3.5 * 60 * S);
    expect(sounds).toEqual([60, 120, 180].map((sec) => ({ at: sec * S, kind: 'signal' })));
  });

  it('describes timers in short form', () => {
    expect(describeQuick({ ...defaultQuick('emom'), everySec: 120, minutes: 12 })).toBe('Every 2:00 for 12 min');
    expect(describeQuick({ ...defaultQuick('tabata'), sets: 3, setRestSec: 60 })).toBe('8 × 0:20 / 0:10 · 3 sets, rest 1:00');
  });
});

describe('halfway signal', () => {
  it('adds a short signal halfway through work of 20 s or more, also in EMOM', () => {
    const tabata = phasesOf(quickBlocks([defaultQuick('tabata')], 0));
    const s = start(tabata, initialState(), 0);
    expect(upcomingSounds(tabata, s, 0).filter((x) => x.kind === 'half')).toHaveLength(0);
    const half = upcomingSounds(tabata, s, 0, undefined, { halfway: true }).filter((x) => x.kind === 'half');
    expect(half).toHaveLength(8);
    expect(half[0].at).toBe(10 * S);
    const emom = phasesOf(quickBlocks([defaultQuick('emom')], 0));
    const emomHalf = upcomingSounds(emom, start(emom, initialState(), 0), 0, undefined, { halfway: true }).filter((x) => x.kind === 'half');
    expect(emomHalf.slice(0, 2).map((x) => x.at)).toEqual([30 * S, 90 * S]);
  });
});

describe('voice cues', () => {
  it('says get ready, go, rest, halfway, ten seconds, last round and done at the right moments', () => {
    const phases = phasesOf(quickBlocks([{ ...defaultQuick('tabata'), rounds: 2, workSec: 30, restSec: 10 }], 10));
    const startAt = start(phases, initialState(), 0);
    const cues = upcomingCues(phases, startAt, 0, undefined, { halfway: true });
    expect(cues).toEqual([
      { at: 10 * S, cue: 'lets_go' },
      { at: 25 * S, cue: 'halfway' },
      { at: 30 * S, cue: 'ten_seconds' },
      { at: 40 * S, cue: 'rest' },
      { at: 50 * S, cue: 'last_round' },
      { at: 65 * S, cue: 'halfway' },
      { at: 70 * S, cue: 'ten_seconds' },
      { at: 80 * S, cue: 'done' },
    ]);
  });
});

describe('round cues', () => {
  it('counts rounds, then last round; set rest between Tabata sets and EMOM sets', () => {
    const tabata = phasesOf(quickBlocks([{ ...defaultQuick('tabata'), rounds: 4, sets: 2, setRestSec: 30 }], 0));
    const cues = upcomingCues(tabata, start(tabata, initialState(), 0), -1).map((c) => c.cue);
    expect(cues.slice(0, 8)).toEqual(['rest', 'round_2', 'rest', 'round_3', 'rest', 'last_round', 'set_rest', 'lets_go']);
    expect(cues[cues.length - 1]).toBe('done');
    const emom = phasesOf(quickBlocks([{ ...defaultQuick('emom'), minutes: 2, sets: 2, setRestSec: 60 }], 0));
    expect(upcomingCues(emom, start(emom, initialState(), 0), -1).map((c) => c.cue).filter((c) => c !== 'ten_seconds')).toEqual(['last_round', 'set_rest', 'lets_go', 'last_round', 'done']);
  });
});

