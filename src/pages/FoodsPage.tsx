import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Food } from '../db/types';
import { useCameBack, useScrollMemory, useStickyState } from '../hooks/useStickyState';
import { useFoods } from '../hooks/useFoods';
import { CREA_SOURCE, round1, searchFoods } from '../lib/nutrition';

/** The longest list shown at once; typing narrows it. */
const MAX_ROWS = 150;

export const foodLine = (f: Food) => `${Math.round(f.kcal)} kcal · P ${round1(f.protein)} · C ${round1(f.carbs)} · F ${round1(f.fat)} per 100 g`;

/** Food archive: the reference table (CREA) and the user's own foods. */
export default function FoodsPage() {
  const { foods } = useFoods();
  const navigate = useNavigate();
  const toast = useToast();
  const cameBack = useCameBack((p) => p.startsWith('/nutrition/foods/'));
  const [query, setQuery] = useStickyState('foods:query', '', cameBack);
  const [category, setCategory] = useStickyState('foods:category', '', cameBack);
  const [mine, setMine] = useStickyState('foods:mine', false, cameBack);

  const categories = useMemo(() => [...new Set((foods ?? []).map((f) => f.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [foods]);
  const found = useMemo(() => searchFoods((foods ?? []).filter((f) => !mine || f.source === 'custom'), query, category), [foods, query, category, mine]);
  useScrollMemory('foods', !!foods, cameBack);

  const duplicate = (id: string) => navigate(`/nutrition/foods/new?copy=${encodeURIComponent(id)}`);
  const remove = async (id: string) => {
    const f = await db.foods.get(id);
    if (!f || !confirm(`Delete “${f.name}”? Diary entries keep their name but lose its values.`)) return;
    await db.foods.delete(id);
    toast('Food deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Foods"
        back="/nutrition"
        actions={
          <InfoButton title="Foods">
            <p style={{ margin: 0 }}>The food archive: values per 100 g of the edible part.</p>
            <p style={{ margin: 0 }}>Reference foods come from the official Italian food composition tables. Source: {CREA_SOURCE}. They cannot be changed: the copy icon makes your own editable copy.</p>
            <p style={{ margin: 0 }}>New food adds a food of your own with the values of its label. Your foods are synced to your other devices.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <Link className="big-btn" to="/nutrition/foods/new">
          <Icon name="plus" /> New food
        </Link>
      </div>
      <div className="stack">
        <SearchField value={query} onChange={setQuery} label="Search foods" />
        <div className="scroll-x" role="group" aria-label="Show">
          <button className="chip" aria-pressed={mine} onClick={() => setMine(!mine)}>
            My foods
          </button>
        </div>
        <label className="field">
          <span className="sr-only">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {foods && found.length === 0 ? (
          <EmptyState icon="search" title="No foods match">
            {mine && !query && !category ? 'You have not added any food yet.' : 'Try a different search or category.'}
          </EmptyState>
        ) : (
          <LibraryList
            items={found.slice(0, MAX_ROWS).map((f) => ({
              id: f.id,
              name: f.name,
              sub: foodLine(f),
              badge: f.source === 'custom' ? 'Mine' : undefined,
              to: `/nutrition/foods/${encodeURIComponent(f.id)}`,
              noDelete: f.source !== 'custom',
            }))}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        )}
        {found.length > MAX_ROWS && <p className="small muted" style={{ textAlign: 'center' }}>Type more of the name to narrow the list.</p>}
      </div>
    </div>
  );
}
