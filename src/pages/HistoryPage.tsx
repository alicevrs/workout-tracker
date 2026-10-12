import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import { formatDuration, formatTime } from '../lib/dates';
import { createSession } from '../lib/session';
import { sessionSummary } from '../lib/stats';
import { compact } from '../lib/units';

const SOURCE_LABEL: Record<string, string> = { fit: 'Garmin FIT', tcx: 'TCX', strava: 'Strava', timer: 'Timer', manual: '' };

export default function HistoryPage() {
  const navigate = useNavigate();
  const { unit } = useProfile();
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);

  const groups = new Map<string, NonNullable<typeof sessions>>();
  for (const s of sessions ?? []) {
    const key = new Date(s.startedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const logPast = async () => {
    const start = Date.now() - 3600_000;
    const s = { ...createSession({ title: 'Workout', now: start }), status: 'completed' as const, endedAt: start + 3600_000 };
    await db.sessions.add(s);
    navigate(`/workout/${s.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="History"
        actions={
          <button className="btn" onClick={logPast}>
            <Icon name="plus" /> Log past workout
          </button>
        }
      />
      {sessions && sessions.length === 0 && (
        <div className="card">
          <EmptyState icon="history" title="No workouts yet" action={<Link className="btn primary" to="/">Start a workout</Link>}>
            Finished workouts, timer runs and imported activities appear here.
          </EmptyState>
        </div>
      )}
      {[...groups.entries()].map(([month, list]) => (
        <section key={month} className="mb">
          <h2 className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 4px' }}>
            {month}
          </h2>
          <ul className="list list-card">
            {list.map((s) => {
              const sum = sessionSummary(s);
              return (
                <li key={s.id}>
                  <Link className="list-item" to={s.status === 'in_progress' ? `/workout/${s.id}` : `/history/${s.id}`}>
                    <div style={{ width: 44, textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{new Date(s.startedAt).getDate()}</div>
                      <div className="tiny faint">{new Date(s.startedAt).toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                    </div>
                    <div className="grow">
                      <div className="ellipsis" style={{ fontWeight: 650 }}>
                        {s.title} {s.status === 'in_progress' && <span className="chip primary">In progress</span>}
                        {SOURCE_LABEL[s.source] && <span className="chip info">{SOURCE_LABEL[s.source]}</span>}
                      </div>
                      <div className="small muted num ellipsis">
                        {formatTime(s.startedAt)}
                        {sum.durationSec > 0 && ` · ${formatDuration(sum.durationSec)}`}
                        {sum.sets > 0 && ` · ${sum.sets} sets`}
                        {sum.volume > 0 && ` · ${compact(unit === 'kg' ? sum.volume : sum.volume / 0.45359237)} ${unit}`}
                        {s.distanceM ? ` · ${(s.distanceM / 1000).toFixed(2)} km` : ''}
                      </div>
                    </div>
                    <Icon name="forward" size={18} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
