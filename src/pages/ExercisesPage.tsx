import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type ComponentProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EquipmentSelect, InfoButton, LibraryList, SearchField, UsedInSheet } from '../components/Library';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { blocksUsingExercise } from '../lib/usage';
import { MUSCLES } from '../data/muscles';
import { useVisibleExercises } from '../db/repo';
import type { ExerciseCategory, MuscleId } from '../db/types';
import { useScrollMemory, useStickyState } from '../hooks/useStickyState';

const CATEGORIES: { value: ExerciseCategory | 'all'; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
];

export default function ExercisesPage() {
  const exercises = useVisibleExercises();
  const usedIds = useLiveQuery(async () => new Set((await db.blockTemplates.toArray()).flatMap((b) => b.block.entries.map((e) => e.exerciseId))), []);
  const toast = useToast();
  const navigate = useNavigate();
  const [used, setUsed] = useState<ComponentProps<typeof UsedInSheet>['used']>(null);
  const [query, setQuery] = useStickyState('exercises:query', '');
  /** 'all' = no filter: tapping the selected chip again clears it. */
  const [category, setCategory] = useStickyState<ExerciseCategory | 'all'>('exercises:category', 'all');
  const [muscle, setMuscle] = useStickyState<MuscleId | ''>('exercises:muscle', '');
  const [equipment, setEquipment] = useStickyState('exercises:equipment', '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exercises ?? []).filter((e) => {
      if (category !== 'all' && e.category !== category) return false;
      if (muscle && !e.primaryMuscles.includes(muscle) && !e.secondaryMuscles.includes(muscle)) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.equipment.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, query, category, muscle, equipment]);
  useScrollMemory('exercises', !!exercises);

  // The copy opens in the exercise form: it is stored only when saved.
  const duplicate = (id: string) => navigate(`/exercises/new?copy=${encodeURIComponent(id)}`);
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
            <button key={c.value} className="chip" aria-pressed={category === c.value} onClick={() => setCategory(category === c.value ? 'all' : c.value)}>
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
        <EquipmentSelect exercises={exercises ?? []} value={equipment} onChange={setEquipment} />
        {exercises && filtered.length === 0 ? (
          <EmptyState icon="search" title="No exercises match">
            Try a different search or filter.
          </EmptyState>
        ) : (
          <LibraryList
            items={filtered.map((e) => ({
              id: e.id,
              name: e.name,
              to: `/exercises/${e.id}`,
              unused: !!usedIds && !usedIds.has(e.id),
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
