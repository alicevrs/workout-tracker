import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, Sheet } from '../components/ui';
import { db } from '../db/db';

type Level = 'workouts' | 'blocks' | 'exercises';

const LEVELS: { id: Level; label: string; to: string; info: string[]; pink?: boolean }[] = [
  {
    id: 'workouts',
    label: 'Workout templates',
    to: '/workouts/templates',
    info: [
      'Whole workouts, ready to start from Home → Start a workout.',
      'Build one from exercises in the catalogue (setting sets, reps, weights and timer), or faster by adding exercise templates you already prepared.',
    ],
  },
  {
    id: 'blocks',
    label: 'Exercise templates',
    to: '/workouts/exercise-templates',
    info: [
      'Ready-made pieces of a workout: one or more exercises from the catalogue with their format (sets × reps, EMOM, Tabata…), reps, weights, rest and timer already set.',
      'Add them to workout templates in one tap. Duplicate one to make a similar version.',
    ],
  },
  {
    id: 'exercises',
    label: 'Exercises',
    to: '/exercises',
    pink: true,
    info: ['The exercise catalogue: the muscles each exercise works, your best values and the history of everything you logged. Add your own exercises here.'],
  },
];

/** Workouts hub: the three libraries (workout templates, exercise templates, exercises). */
export default function WorkoutsPage() {
  const [info, setInfo] = useState<Level | null>(null);
  const counts = useLiveQuery(async () => ({
    workouts: await db.programs.count(),
    blocks: await db.blockTemplates.count(),
    exercises: await db.exercises.count(),
  }));
  const current = LEVELS.find((l) => l.id === info);

  return (
    <div className="page">
      <PageHeader title="Workouts" subtitle="Your library, ready to use." />
      <section className="qt-list" aria-label="Libraries">
        {LEVELS.map((l) => (
          <div key={l.id} className={`qt-card${l.pink ? ' qt-mix' : ''}`}>
            <Link className="qt-card-main qt-card-two" to={l.to}>
              <span>{l.label}</span>
              {counts && <small>{counts[l.id]}</small>}
            </Link>
            <button className="qt-card-info" onClick={() => setInfo(l.id)} aria-label={`About ${l.label}`}>
              <Icon name="info" />
            </button>
          </div>
        ))}
      </section>
      <Sheet open={!!current} onClose={() => setInfo(null)} title={current?.label ?? ''}>
        <div className="stack">
          {current?.info.map((t, i) => (
            <p key={i} style={{ margin: 0 }}>
              {t}
            </p>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
