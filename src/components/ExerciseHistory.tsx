import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import { formatClock, formatShortDate, fromDateKey } from '../lib/dates';
import { exerciseHistory } from '../lib/stats';
import { formatWeight } from '../lib/units';
import { Stat } from './ui';

/** Progression of one exercise: best values and a chronological list with changes. */
export function ExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const { unit } = useProfile();
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('completed').toArray(), []);
  if (!sessions) return null;
  const history = exerciseHistory(exerciseId, sessions);
  if (!history.length)
    return (
      <section className="card">
        <h2 className="mb">History</h2>
        <p className="muted small">Not logged yet. After your first session the progression appears here.</p>
      </section>
    );

  const bestE1rm = Math.max(...history.map((h) => h.metrics.e1rm));
  const bestWeight = Math.max(...history.map((h) => h.metrics.maxWeight));
  const bestReps = Math.max(...history.map((h) => h.metrics.maxReps));
  const bestTime = Math.max(...history.map((h) => h.metrics.maxDuration));

  return (
    <section className="card span-all">
      <div className="card-title">
        <h2>History</h2>
        <Link className="small" to={`/analytics?exercise=${exerciseId}`}>
          Chart
        </Link>
      </div>
      <div className="stat-tiles mb">
        {bestE1rm > 0 && <Stat label="Best est. 1RM" value={formatWeight(bestE1rm, unit)} />}
        {bestWeight > 0 && <Stat label="Max weight" value={formatWeight(bestWeight, unit)} />}
        {bestReps > 0 && <Stat label="Max reps" value={bestReps} />}
        {bestTime > 0 && <Stat label="Longest set" value={formatClock(bestTime)} />}
        <Stat label="Sessions" value={history.length} />
      </div>
      <ul className="list">
        {[...history].reverse().slice(0, 30).map((h) => (
          <li key={h.sessionId}>
            <Link to={`/history/${h.sessionId}`} className="list-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div style={{ width: 64 }} className="small muted">
                {formatShortDate(fromDateKey(h.date).getTime())}
              </div>
              <div className="grow small num">
                {h.sets
                  .map((s) => (s.weight ? `${formatWeight(s.weight, unit).replace(` ${unit}`, '')}×${s.reps ?? '–'}` : s.durationSec && !s.reps ? formatClock(s.durationSec) : `${s.reps ?? 0} reps`))
                  .join('  ')}
              </div>
              {h.improved && <span className="chip good">▲ Progress</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
