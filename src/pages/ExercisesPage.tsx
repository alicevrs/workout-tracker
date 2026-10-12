import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { MUSCLES, MUSCLE_LABEL } from '../data/muscles';
import { useExercises } from '../db/repo';
import type { ExerciseCategory, MuscleId } from '../db/types';

const CATEGORIES: { value: ExerciseCategory | 'all' | 'custom'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'custom', label: 'My exercises' },
];

export default function ExercisesPage() {
  const exercises = useExercises();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('all');
  const [muscle, setMuscle] = useState<MuscleId | ''>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exercises ?? []).filter((e) => {
      if (category === 'custom' && !e.isCustom) return false;
      if (category !== 'all' && category !== 'custom' && e.category !== category) return false;
      if (muscle && !e.primaryMuscles.includes(muscle) && !e.secondaryMuscles.includes(muscle)) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.equipment.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, query, category, muscle]);

  return (
    <div className="page">
      <PageHeader
        title="Exercises"
        subtitle={exercises ? `${exercises.length} exercises` : undefined}
        actions={
          <Link className="btn primary" to="/exercises/new">
            <Icon name="plus" /> New
          </Link>
        }
      />
      <div className="stack">
        <label className="field">
          <span className="sr-only">Search exercises</span>
          <input type="search" placeholder="Search by name or equipment" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="scroll-x" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button key={c.value} className="chip" aria-pressed={category === c.value} onClick={() => setCategory(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="sr-only">Muscle group</span>
          <select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId | '')}>
            <option value="">All muscle groups</option>
            {MUSCLES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {exercises && filtered.length === 0 ? (
          <div className="card">
            <EmptyState icon="search" title={category === 'custom' && !query ? 'No custom exercises yet' : 'No exercises match'}>
              {category === 'custom' ? 'Create your own exercise with the New button.' : 'Try a different search or filter.'}
            </EmptyState>
          </div>
        ) : (
          <ul className="list list-card">
            {filtered.map((e) => (
              <li key={e.id}>
                <Link className="list-item" to={`/exercises/${e.id}`}>
                  <div className="grow">
                    <div className="ellipsis" style={{ fontWeight: 600 }}>
                      {e.name} {e.isCustom && <span className="chip primary tiny">Custom</span>}
                    </div>
                    <div className="small muted ellipsis">
                      {e.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {e.equipment}
                    </div>
                  </div>
                  <Icon name="forward" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
