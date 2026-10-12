import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Session } from '../db/types';
import { sessionCalories, type CalorieResult } from '../lib/calories';

/** Returns a calorie function bound to the current profile, weight log and exercise catalog. */
export function useCalories(): { calories: (s: Session) => CalorieResult; ready: boolean } {
  const profile = useProfile();
  const exercises = useExerciseMap();
  const weights = useLiveQuery(() => db.bodyWeights.toArray(), []);
  return useMemo(() => {
    const cache = new Map<string, CalorieResult>();
    return {
      ready: weights !== undefined,
      calories: (s: Session) => {
        const key = `${s.id}:${s.updatedAt}`;
        let c = cache.get(key);
        if (!c) {
          c = sessionCalories(s, { profile, weights: weights ?? [], exercises });
          cache.set(key, c);
        }
        return c;
      },
    };
  }, [profile, exercises, weights]);
}
