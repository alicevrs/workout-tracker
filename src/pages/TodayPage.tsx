import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader } from '../components/ui';
import { StartWorkoutSheet } from '../components/StartWorkoutSheet';
import { db } from '../db/db';
import { formatTime } from '../lib/dates';

export default function TodayPage() {
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);
  const [starting, setStarting] = useState(false);
  return (
    <div className="page">
      <PageHeader
        title="Home"
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

        <section className="big-buttons" aria-label="Start">
          <button className="big-btn" onClick={() => setStarting(true)}>
            Start a workout
          </button>
          <Link className="big-btn pink" to="/activity/new">
            Start an activity
          </Link>
          <p className="tiny faint" style={{ textAlign: 'center', margin: 0 }}>
            You can also pick an earlier date to log something you already did.
          </p>
        </section>
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

      </div>
      <StartWorkoutSheet open={starting} onClose={() => setStarting(false)} />
    </div>
  );
}
