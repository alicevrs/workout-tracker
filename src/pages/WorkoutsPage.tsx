import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DayActions } from '../components/DayActions';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Sheet, useToast } from '../components/ui';
import { db } from '../db/db';
import { formatDuration } from '../lib/dates';
import { describeBlock, estimateBlockSeconds } from '../lib/program';
import { TEMPLATES } from '../lib/templates';
import { newWorkout, workoutDay } from '../lib/workouts';

/** The library of saved workouts: pick one to start or to log (today or a past day). */
export default function WorkoutsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []);
  const [picking, setPicking] = useState(false);

  const create = async () => {
    const w = newWorkout();
    await db.programs.add(w);
    navigate(`/workouts/${w.id}`);
  };

  const addTemplate = async (t: (typeof TEMPLATES)[number]) => {
    setPicking(false);
    const list = t.create();
    await db.programs.bulkAdd(list);
    toast(`${list.length} workouts added`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Workouts"
        subtitle="Your saved workouts. Start one, or log it for today or a past day."
        actions={
          <button className="btn primary" onClick={create}>
            <Icon name="plus" /> New
          </button>
        }
      />
      <div className="stack">
        <Link to="/exercises" className="card row mobile-only">
          <Icon name="dumbbell" />
          <span className="grow">Exercise library</span>
          <Icon name="forward" size={18} />
        </Link>
        {workouts && workouts.length === 0 && (
          <div className="card">
            <EmptyState
              icon="dumbbell"
              title="No saved workouts yet"
              action={
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => setPicking(true)}>
                    Add from a template
                  </button>
                  <button className="btn" onClick={create}>
                    Create a workout
                  </button>
                </div>
              }
            >
              A workout is a list of blocks (Sets × Reps, Tabata, AMRAP, EMOM, intervals…) that you can reuse as often as you like.
            </EmptyState>
          </div>
        )}
        {workouts?.map((w) => {
          const day = workoutDay(w);
          const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);
          return (
            <section key={w.id} className="card">
              <Link to={`/workouts/${w.id}`} className="row" style={{ color: 'var(--text)' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.05rem' }}>{w.name}</h2>
                  <div className="small muted">
                    {day.blocks.length} block{day.blocks.length === 1 ? '' : 's'}
                    {total ? ` · ≈ ${formatDuration(total)}` : ''}
                  </div>
                  <div className="small faint ellipsis">{day.blocks.map((b) => b.name ?? describeBlock(b)).join(' · ')}</div>
                </div>
                <Icon name="edit" size={18} />
              </Link>
              <div className="row wrap mt-s">
                <DayActions program={w} day={day} />
              </div>
            </section>
          );
        })}
        {workouts && workouts.length > 0 && (
          <button className="btn small ghost" onClick={() => setPicking(true)}>
            <Icon name="plus" /> Add from a template
          </button>
        )}
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Add workouts">
        <ul className="list">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }} onClick={() => addTemplate(t)}>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{t.name}</div>
                  <div className="small muted">{t.description}</div>
                </div>
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
