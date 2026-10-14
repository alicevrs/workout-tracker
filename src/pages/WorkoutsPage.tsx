import { Link } from 'react-router-dom';
import { InfoButton } from '../components/Library';
import { PageHeader } from '../components/ui';

type Level = 'workouts' | 'blocks' | 'timers' | 'exercises';

const LEVELS: { id: Level; label: string; to: string; pink?: boolean }[] = [
  { id: 'exercises', label: 'Exercises', to: '/exercises' },
  { id: 'timers', label: 'Timers', to: '/workouts/timers' },
  { id: 'blocks', label: 'Training blocks', to: '/workouts/blocks' },
  { id: 'workouts', label: 'Workouts', to: '/workouts/templates', pink: true },
];

/** Workouts hub: the three libraries, from the smallest piece to the biggest. */
export default function WorkoutsPage() {
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
              <strong>Timers</strong>: preset timers with rounds, minutes and rests.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Training blocks</strong>: exercises combined with reps or a timer, and weights.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Workouts</strong>: whole workouts made of blocks, started from Home.
            </p>
          </InfoButton>
        }
      />
      <section className="qt-list" aria-label="Libraries">
        {LEVELS.map((l) => (
          <Link key={l.id} className={`big-btn${l.pink ? ' pink' : ''}`} to={l.to}>
            {l.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
