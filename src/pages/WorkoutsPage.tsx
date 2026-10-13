import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { InfoButton } from '../components/Library';
import { PageHeader } from '../components/ui';
import { db } from '../db/db';

type Level = 'workouts' | 'blocks' | 'exercises';

const LEVELS: { id: Level; label: string; to: string; pink?: boolean }[] = [
  { id: 'workouts', label: 'Workout templates', to: '/workouts/templates' },
  { id: 'blocks', label: 'Exercise blocks', to: '/workouts/blocks' },
  { id: 'exercises', label: 'Exercises', to: '/exercises', pink: true },
];

/** Workouts hub: the three libraries, from the biggest piece to the smallest. */
export default function WorkoutsPage() {
  const counts = useLiveQuery(async () => ({
    workouts: await db.programs.count(),
    blocks: await db.blockTemplates.count(),
    exercises: await db.exercises.count(),
  }));

  return (
    <div className="page">
      <PageHeader
        title="Workouts"
        subtitle="Your library, ready to use."
        actions={
          <InfoButton title="Workouts">
            <p style={{ margin: 0 }}>
              <strong>Exercises</strong>: the catalogue (single movements, muscles, history).
            </p>
            <p style={{ margin: 0 }}>
              <strong>Exercise blocks</strong>: one or more exercises, already set with reps or a timer and weights.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Workout templates</strong>: whole workouts made of blocks, started from Home.
            </p>
          </InfoButton>
        }
      />
      <section className="qt-list" aria-label="Libraries">
        {LEVELS.map((l) => (
          <Link key={l.id} className={`big-btn qt-card-two${l.pink ? ' pink' : ''}`} to={l.to}>
            <span>{l.label}</span>
            {counts && <small>{counts[l.id]}</small>}
          </Link>
        ))}
      </section>
    </div>
  );
}
