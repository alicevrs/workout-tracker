import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { MUSCLES } from '../data/muscles';
import { useExerciseMap, useProfile } from '../db/repo';
import type { ExerciseCategory, MuscleId } from '../db/types';
import { duplicateTemplate, newBlockTemplate } from '../lib/blockTemplates';
import { describeBlock, FORMAT_INFO } from '../lib/program';

const CATEGORIES: { value: ExerciseCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
];

/** Library of training blocks (ready-made parts of a workout). */
export default function ExerciseTemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const templates = useLiveQuery(() => db.blockTemplates.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleId | ''>('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (templates ?? [])
      .filter((t) => {
        const exs = t.block.entries.map((e) => exercises.get(e.exerciseId)).filter((x) => !!x);
        if (q && !t.name.toLowerCase().includes(q) && !exs.some((x) => x.name.toLowerCase().includes(q))) return false;
        if (category !== 'all' && !exs.some((x) => x.category === category)) return false;
        if (muscle && !exs.some((x) => x.primaryMuscles.includes(muscle) || x.secondaryMuscles.includes(muscle))) return false;
        return true;
      })
      .map((t) => ({ id: t.id, name: t.name, to: `/workouts/blocks/${t.id}`, badge: FORMAT_INFO[t.block.format].short, sub: describeBlock(t.block) }));
  }, [templates, query, exercises, category, muscle]);

  const create = async () => {
    const t = newBlockTemplate('sets_reps', profile.defaultPrepSec);
    await db.blockTemplates.add(t);
    navigate(`/workouts/blocks/${t.id}`);
  };
  const duplicate = async (id: string) => {
    const t = await db.blockTemplates.get(id);
    if (!t) return;
    const copy = duplicateTemplate(t);
    await db.blockTemplates.add(copy);
    toast('Training block duplicated');
    navigate(`/workouts/blocks/${copy.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Training blocks"
        back="/workouts"
        actions={
          <InfoButton title="Training blocks">
            <p style={{ margin: 0 }}>
              Structured pieces of a workout built from catalogue exercises: one exercise or several combined (in sequence, alternating or as a circuit), counted by reps or with a
              timer, with weights. Example: “Abduction / adduction”, “Hip thrust EMOM 2 × 12”.
            </p>
            <p style={{ margin: 0 }}>Add them to workouts. Change a block once and every workout that uses it follows from the next session.</p>
            <p style={{ margin: 0 }}>The copy icon makes a duplicate to adapt.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New block
        </button>
      </div>
      <div className="stack">
        <SearchField value={query} onChange={setQuery} label="Search training blocks" />
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
        <LibraryList
          items={items}
          onDuplicate={duplicate}
          empty={query || category !== 'all' || muscle ? 'No block matches.' : 'No training blocks yet. You can also save any part of a workout as a block.'}
        />
      </div>
    </div>
  );
}
