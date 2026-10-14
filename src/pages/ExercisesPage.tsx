import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { uid } from '../lib/ids';
import { MUSCLES, MUSCLE_LABEL } from '../data/muscles';
import { useExercises } from '../db/repo';
import type { ExerciseCategory, MuscleId } from '../db/types';

const CATEGORIES: { value: ExerciseCategory | 'all' | 'custom'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'custom', label: 'Mine' },
];

export default function ExercisesPage() {
  const exercises = useExercises();
  const toast = useToast();
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

  const duplicate = async (id: string) => {
    const e = await db.exercises.get(id);
    if (!e) return;
    await db.exercises.add({ ...e, id: `custom-${uid()}`, name: `${e.name} (copy)`, isCustom: true });
    toast('Copied to your exercises');
  };
  const remove = async (id: string) => {
    const e = await db.exercises.get(id);
    if (!e?.isCustom) return;
    const used = await db.programs.filter((p) => p.days.some((d) => d.blocks.some((b) => b.entries.some((en) => en.exerciseId === id)))).count();
    const msg = used ? `“${e.name}” is used in ${used} workout(s). Logged sessions keep their data. Delete anyway?` : `Delete “${e.name}”?`;
    if (!confirm(msg)) return;
    await db.exercises.delete(id);
    toast('Exercise deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Exercises"
        back="/workouts"
        subtitle={exercises ? `${exercises.length} exercises` : undefined}
        actions={
          <InfoButton title="Exercises">
            <p style={{ margin: 0 }}>The exercise catalogue. Open an exercise to see the muscles it works, your best values and its history.</p>
            <p style={{ margin: 0 }}>In the list, the copy icon makes your own version of an exercise and × deletes your own exercises (built-in ones stay).</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <Link className="big-btn" to="/exercises/new">
          <Icon name="plus" /> New exercise
        </Link>
      </div>
      <div className="stack">
        <SearchField value={query} onChange={setQuery} label="Search exercises by name or equipment" />
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
          <EmptyState icon="search" title={category === 'custom' && !query ? 'No custom exercises yet' : 'No exercises match'}>
            {category === 'custom' ? 'Create your own exercise with New exercise.' : 'Try a different search or filter.'}
          </EmptyState>
        ) : (
          <LibraryList
            items={filtered.map((e) => ({
              id: e.id,
              name: e.name,
              to: `/exercises/${e.id}`,
              badge: e.isCustom ? 'Mine' : undefined,
              sub: `${e.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · ${e.equipment}`,
              noDelete: !e.isCustom,
            }))}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        )}
      </div>
    </div>
  );
}
