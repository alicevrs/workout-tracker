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
