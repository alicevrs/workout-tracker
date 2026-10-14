import { describe, expect, it } from 'vitest';
import { getDraft, setDraft, withDraftParam } from '../src/lib/drafts';

describe('drafts', () => {
  it('adds the draft flag to a route, keeping its other parameters', () => {
    expect(withDraftParam('/workouts/w1')).toBe('/workouts/w1?draft=1');
    expect(withDraftParam('/workouts/blocks/b1?addTo=w1&from=%2Fworkouts%2Fw1')).toBe('/workouts/blocks/b1?addTo=w1&from=%2Fworkouts%2Fw1&draft=1');
  });

  it('keeps an unsaved item until it is replaced', () => {
    setDraft('timer:t1', { id: 't1', name: 'A' }, true);
    expect(getDraft('timer:t1')).toEqual({ item: { id: 't1', name: 'A' }, isNew: true });
    setDraft('timer:t1', { id: 't1', name: 'B' }, false);
    expect(getDraft<{ name: string }>('timer:t1')?.item.name).toBe('B');
  });
});
