import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type { Food } from '../db/types';
import { loadReferenceFoods } from '../lib/nutrition';

/** The whole food archive: the reference table plus the user's own foods. Undefined while loading. */
export function useFoods(): { foods: Food[] | undefined; map: Map<string, Food> } {
  const [reference, setReference] = useState<Food[] | undefined>();
  const own = useLiveQuery(() => db.foods.toArray(), []);
  useEffect(() => {
    let alive = true;
    void loadReferenceFoods().then((f) => alive && setReference(f));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => {
    if (!reference || !own) return { foods: undefined, map: new Map() };
    const foods = [...own, ...reference];
    return { foods, map: new Map(foods.map((f) => [f.id, f])) };
  }, [reference, own]);
}
