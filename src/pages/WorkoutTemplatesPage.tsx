import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { PageHeader, Sheet, useToast } from '../components/ui';
import { db } from '../db/db';
import { formatDuration } from '../lib/dates';
import { cloneProgram, estimateBlockSeconds } from '../lib/program';
import { TEMPLATES } from '../lib/templates';
import { newWorkout, workoutDay } from '../lib/workouts';

/** Library of workout templates: create, open, duplicate. Workouts are started from Home. */
export default function WorkoutTemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');
  const [samples, setSamples] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (workouts ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => {
        const day = workoutDay(w);
        const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);
        return { id: w.id, name: w.name, to: `/workouts/${w.id}`, sub: `${day.blocks.length} part${day.blocks.length === 1 ? '' : 's'}${total ? ` · ≈ ${formatDuration(total)}` : ''}` };
      });
  }, [workouts, query]);

  const create = async () => {
    const w = newWorkout();
    await db.programs.add(w);
    navigate(`/workouts/${w.id}`);
  };
  const duplicate = async (id: string) => {
    const w = await db.programs.get(id);
    if (!w) return;
    const copy = cloneProgram(w);
    copy.days = copy.days.map((d) => ({ ...d, name: copy.name }));
    await db.programs.add(copy);
    toast('Workout duplicated');
    navigate(`/workouts/${copy.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Workouts"
        back="/workouts"
        actions={
          <InfoButton title="Workouts">
            <p style={{ margin: 0 }}>Whole workouts, ready to start from Home → Start a workout.</p>
            <p style={{ margin: 0 }}>Open one to change it. The copy icon makes a duplicate to adapt.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New workout
        </button>
      </div>
      {(workouts?.length ?? 0) > 6 && <SearchField value={query} onChange={setQuery} label="Search workouts" />}
      <LibraryList items={items} onDuplicate={duplicate} empty={query ? 'No workout matches.' : 'No workouts yet.'} />
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn small ghost" onClick={() => setSamples(true)}>
          <Icon name="plus" /> Add sample workouts
        </button>
      </div>
      <Sheet open={samples} onClose={() => setSamples(false)} title="Add sample workouts">
        <ul className="lib-list">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="lib-row">
              <button
                className="lib-main"
                onClick={async () => {
                  setSamples(false);
                  const list = t.create();
                  await db.programs.bulkAdd(list);
                  toast(`${list.length} workouts added`);
                }}
              >
                <span className="lib-name">{t.name}</span>
                <span className="lib-sub">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
