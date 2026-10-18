import { describe, expect, it } from 'vitest';
import { columnsFor } from '../src/components/SetLogger';
import type { Exercise, PerformedEntry } from '../src/db/types';

const ex = (tracking: Exercise['tracking']) => ({ id: 'x', name: 'X', category: 'strength', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], isCustom: true, tracking }) as Exercise;
const entry = (planned: Partial<PerformedEntry['planned']> = {}): PerformedEntry => ({
  id: 'e',
  exerciseId: 'x',
  planned: { id: 'e', exerciseId: 'x', sets: 3, restSec: 60, grouping: 'none', ...planned },
  sets: [],
});

describe('log columns per exercise', () => {
  it('weight × reps, weight × time (also older values), time and distance', () => {
    expect(columnsFor(ex('weight_reps'), entry({ reps: 10 }), 'sets_reps')).toEqual(['weight', 'reps']);
    expect(columnsFor(ex('reps'), entry({ reps: 10 }), 'sets_reps')).toEqual(['weight', 'reps']);
    expect(columnsFor(ex('weight_time'), entry({ durationSec: 40 }), 'sets_reps')).toEqual(['weight', 'time']);
    expect(columnsFor(ex('time'), entry({ durationSec: 40 }), 'sets_reps')).toEqual(['weight', 'time']);
    expect(columnsFor(ex('time_distance'), entry({ durationSec: 600 }), 'sets_reps')).toEqual(['time', 'distance']);
  });
});

describe('log columns follow the block', () => {
  it('the block log type wins over the exercise', () => {
    const ex = { id: 'x', name: 'X', category: 'strength', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], isCustom: true, tracking: 'weight_reps' } as Exercise;
    const entry: PerformedEntry = { id: 'e', exerciseId: 'x', planned: { id: 'e', exerciseId: 'x', sets: 3, restSec: 60, grouping: 'none', durationSec: 40 }, sets: [] };
    expect(columnsFor(ex, entry, 'sets_reps', 'weight_time')).toEqual(['weight', 'time']);
  });
});

describe('log columns from the block log', () => {
  it('weight with reps or time; time and distance when distance is logged', () => {
    const ex = { id: 'x', name: 'X', category: 'strength', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], isCustom: true } as Exercise;
    const entry: PerformedEntry = { id: 'e', exerciseId: 'x', sets: [] };
    expect(columnsFor(ex, entry, 'sets_reps', undefined, ['reps'])).toEqual(['weight', 'reps']);
    expect(columnsFor(ex, entry, 'sets_reps', undefined, ['time'])).toEqual(['weight', 'reps']);
    expect(columnsFor(ex, entry, 'tabata', undefined, ['reps', 'time'])).toEqual(['weight', 'reps']);
    expect(columnsFor(ex, entry, 'sets_reps', undefined, ['distance'])).toEqual(['time', 'distance']);
    expect(columnsFor(ex, entry, 'tabata', undefined, ['reps', 'time', 'distance'])).toEqual(['time', 'distance']);
  });
});
