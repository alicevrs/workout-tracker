import { useMemo, useState, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField, UsedInSheet } from '../components/Library';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { uid } from '../lib/ids';
import { blocksUsingExercise } from '../lib/usage';
import { MUSCLES, MUSCLE_LABEL } from '../data/muscles';
import { useVisibleExercises } from '../db/repo';
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
  const exercises = useVisibleExercises();
  const toast = useToast();
  const [used, setUsed] = useState<ComponentProps<typeof UsedInSheet>['used']>(null);
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
    const { edited: _e, hidden: _h, ...rest } = e;
    void _e;
    void _h;
    await db.exercises.add({ ...rest, id: `custom-${uid()}`, name: `${e.name} (copy)`, isCustom: true, updatedAt: Date.now() });
    toast('Copied to your exercises');
  };
  const remove = async (id: string) => {
    const e = await db.exercises.get(id);
    if (!e) return;
    const blocks = await blocksUsingExercise(db, id);
    const msg = blocks.length
      ? `“${e.name}” is used in these training blocks: ${blocks.map((b) => b.name).join(', ')}. They and logged sessions keep it. Delete anyway?`
      : `Delete “${e.name}”?`;
    if (!confirm(msg)) return;
    // Built-in exercises would come back with the next catalogue update, so they are hidden instead.
    if (e.isCustom) await db.exercises.delete(id);
    else await db.exercises.put({ ...e, hidden: true, edited: true, updatedAt: Date.now() });
    toast('Exercise deleted');
  };
  const showUsage = async (id: string) => {
    const e = await db.exercises.get(id);
    const blocks = await blocksUsingExercise(db, id);
    setUsed({
      title: e?.name ?? 'Exercise',
      intro: 'Used in these training blocks. Changing the exercise changes it there too.',
      empty: 'Not used in any training block.',
      items: blocks.map((b) => ({ id: b.id, name: b.name, to: `/workouts/blocks/${b.id}?from=${encodeURIComponent('/exercises')}` })),
    });
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
            <p style={{ margin: 0 }}>Open an exercise and tap Edit to change it. In the list, the link icon shows the training blocks that use it, the copy icon duplicates it and × deletes it.</p>
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
            }))}
            onLinks={showUsage}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        )}
      </div>
      <UsedInSheet used={used} onClose={() => setUsed(null)} />
    </div>
  );
}
