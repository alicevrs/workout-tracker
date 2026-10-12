import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader } from '../components/ui';
import { db } from '../db/db';
import { formatTime } from '../lib/dates';
import { describeBlock, weekdayIndex } from '../lib/program';
import { createSession } from '../lib/session';

export default function TodayPage() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const today = weekdayIndex();
  const planned = (programs ?? []).flatMap((p) => p.days.filter((d) => d.weekday === today).map((d) => ({ program: p, day: d })));

  const startEmpty = async () => {
    const s = createSession({ title: 'Workout' });
    await db.sessions.add(s);
    navigate(`/workout/${s.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Link className="btn icon ghost mobile-only" to="/settings" aria-label="Settings">
            <Icon name="settings" />
          </Link>
        }
      />
      <div className="stack">
        {!isStandalone() && (
          <div className="banner info">
            <div className="grow">
              Install the app on your Home Screen for full-screen use and offline access. <Link to="/settings">How to install</Link>
            </div>
          </div>
        )}

        {active && active.length > 0 && (
          <section className="card" style={{ borderColor: 'var(--accent)' }}>
            <h2 className="mb">Workout in progress</h2>
            {active.map((s) => (
              <Link key={s.id} to={`/workout/${s.id}`} className="row" style={{ minHeight: 48, color: 'var(--text)' }}>
                <Icon name="play" />
                <span className="grow">
                  <strong>{s.title}</strong>
                  <span className="small muted"> · started {formatTime(s.startedAt)}</span>
                </span>
                <span className="btn small primary">Resume</span>
              </Link>
            ))}
          </section>
        )}

        <section className="card">
          <h2 className="mb">Planned for today</h2>
          {planned.length === 0 ? (
            <p className="muted small">
              Nothing scheduled. Assign a weekday to a program day, or start a free workout.
            </p>
          ) : (
            planned.map(({ program, day }) => (
              <div key={day.id} className="row" style={{ minHeight: 56 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong>{day.name}</strong> <span className="small muted">· {program.name}</span>
                  <div className="small faint ellipsis">{day.blocks.map(describeBlock).join(' · ')}</div>
                </div>
                <button
                  className="btn primary small"
                  onClick={async () => {
                    const s = createSession({ program, day });
                    await db.sessions.add(s);
                    navigate(`/workout/${s.id}`);
                  }}
                >
                  <Icon name="play" /> Start
                </button>
              </div>
            ))
          )}
          <div className="row wrap mt">
            <button className="btn" onClick={startEmpty}>
              <Icon name="plus" /> Free workout
            </button>
            <Link className="btn" to="/programs">
              <Icon name="calendar" /> Programs
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
