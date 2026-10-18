import { useEffect, useMemo, useState } from 'react';
import type { Food } from '../db/types';
import { useFoods } from '../hooks/useFoods';
import { nutrientsFor, searchFoods } from '../lib/nutrition';
import { SearchField } from './Library';
import { NumberField, Sheet } from './ui';

const MAX_RESULTS = 40;

/**
 * Sheet to choose a food of the archive. With `withGrams` the person also sets the quantity
 * (the food's portion is suggested) before confirming.
 */
export function FoodPicker({
  open,
  onClose,
  onPick,
  title = 'Choose a food',
  withGrams = false,
  confirmLabel = 'Add',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (food: Food, grams?: number) => void;
  title?: string;
  withGrams?: boolean;
  confirmLabel?: string;
}) {
  const { foods } = useFoods();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number | undefined>();
  useEffect(() => {
    if (!open) {
      setQuery('');
      setChosen(null);
      setGrams(undefined);
    }
  }, [open]);
  const found = useMemo(() => (query.trim() ? searchFoods(foods ?? [], query).slice(0, MAX_RESULTS) : []), [foods, query]);

  const pick = (f: Food) => {
    if (!withGrams) return onPick(f);
    setChosen(f);
    setGrams(f.portionG ?? 100);
  };
  const n = chosen && grams ? nutrientsFor(chosen, grams) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={chosen ? chosen.name : title}>
      {chosen ? (
        <div className="stack">
          <NumberField label="Quantity" suffix="g" value={grams} onChange={setGrams} stepper step={10} />
          {n && (
            <p className="small muted" style={{ margin: 0 }}>
              {Math.round(n.kcal)} kcal · P {Math.round(n.protein)} g · C {Math.round(n.carbs)} g · F {Math.round(n.fat)} g
            </p>
          )}
          <div className="row">
            <button className="btn ghost" onClick={() => setChosen(null)}>
              Back
            </button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!grams} onClick={() => chosen && grams && onPick(chosen, grams)}>
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <SearchField value={query} onChange={setQuery} label="Search foods" />
          {found.length > 0 && (
            <ul className="search-results" role="listbox" aria-label="Matching foods">
              {found.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => pick(f)}>
                    <span>{f.name}</span>
                    <span className="tiny faint" style={{ flexShrink: 0 }}>
                      {Math.round(f.kcal)} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && foods && found.length === 0 && <p className="small muted">No foods match. Add it in Nutrition → Foods.</p>}
        </div>
      )}
    </Sheet>
  );
}
