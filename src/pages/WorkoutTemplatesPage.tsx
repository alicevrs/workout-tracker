import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { formatDuration } from '../lib/dates';
import { setDraft } from '../lib/drafts';
import { cloneProgram, estimateBlockSeconds } from '../lib/program';
import { newWorkout, workoutDay } from '../lib/workouts';

/** Library of workout templates: create, open, duplicate. Workouts are started from Home. */
export default function WorkoutTemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (workouts ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => {
        const day = workoutDay(w);
        const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);
        return { id: w.id, name: w.name, to: `/workouts/${w.id}`, sub: total ? `≈ ${formatDuration(total)}` : undefined };
      });
  }, [workouts, query]);

  const create = () => {
    const w = newWorkout();
    setDraft(`workout:${w.id}`, w, true); // stored only when saved
    navigate(`/workouts/${w.id}?draft=1`);
  };
  const duplicate = async (id: string) => {
    const w = await db.programs.get(id);
    if (!w) return;
    const copy = cloneProgram(w);
    copy.days = copy.days.map((d) => ({ ...d, name: copy.name }));
    // The copy opens as a draft: it is stored only when saved.
    setDraft(`workout:${copy.id}`, copy, true);
    navigate(`/workouts/${copy.id}?draft=1`);
  };
  const remove = async (id: string) => {
    const w = await db.programs.get(id);
    if (!w || !confirm(`Delete “${w.name}”? Logged sessions are kept.`)) return;
    await db.programs.delete(id);
    toast('Workout deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Workouts"
        back="/workouts"
        actions={
          <InfoButton title="Workouts">
            <p style={{ margin: 0 }}>Whole workouts, ready to start from Home → Start a workout.</p>
            <p style={{ margin: 0 }}>Open one to change it, then tap Save. In the list, the copy icon duplicates a workout and × deletes it.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New workout
        </button>
      </div>
      {(workouts?.length ?? 0) > 6 && <SearchField value={query} onChange={setQuery} label="Search workouts" />}
      <LibraryList items={items} onDuplicate={duplicate} onDelete={remove} empty={query ? 'No workout matches.' : 'No workouts yet.'} />
    </div>
  );
}
