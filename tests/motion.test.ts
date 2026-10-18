import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import { motionFor, skeleton } from '../src/lib/motion';

describe('exercise animations', () => {
  it('every catalogue exercise has one, with sane coordinates', () => {
    for (const e of exercises as { id: string; name: string }[]) {
      const m = motionFor(e.id, e.name);
      expect(m, e.id).not.toBeNull();
      for (const pose of [m!.a, m!.b].filter(Boolean)) {
        const s = skeleton(pose!);
        for (const [x, y] of Object.values(s)) {
          expect(Number.isFinite(x) && Number.isFinite(y), e.id).toBe(true);
          expect(x > -40 && x < 240 && y > -40 && y < 230, `${e.id} stays in view`).toBe(true);
        }
      }
    }
  });

  it('custom exercises get one from their name, or none', () => {
    expect(motionFor('custom-x', 'My Bulgarian split squat')).toBe(motionFor('bulgarian-split-squat'));
    expect(motionFor('custom-y', 'Something new')).toBeNull();
  });
});
