import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader } from '../components/ui';
import { StartWorkoutSheet } from '../components/StartWorkoutSheet';
import { db } from '../db/db';
import { saveSettings, useSettings } from '../db/repo';
import { backupReminderDue } from '../lib/backup';
import { formatTime } from '../lib/dates';

export default function TodayPage() {
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []);
  const [starting, setStarting] = useState(false);
  const settings = useSettings();
  const oldest = useLiveQuery(() => db.sessions.orderBy('startedAt').first(), []);
  const remind = backupReminderDue(settings, oldest?.startedAt);
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

        {remind && (
          <div className="banner warn" role="status">
            <div className="grow">
              <strong>Weekly backup.</strong> Your data lives only on this device. Export a backup to iCloud Drive or your Mac.
            </div>
            <div className="row">
              <Link className="btn small primary" to="/settings#backup">
                Back up
              </Link>
              <button className="btn small ghost" onClick={() => saveSettings({ backupReminderDismissedAt: Date.now() })}>
                Later
              </button>
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
          <h2 className="mb">Train</h2>
          <div className="stack">
            <button className="btn primary block" style={{ minHeight: 60 }} onClick={() => setStarting(true)}>
              <Icon name="play" /> Start a workout
            </button>
            <Link className="btn block" style={{ minHeight: 60 }} to="/activity/new">
              <Icon name="flag" /> Start a sport or outdoor activity
            </Link>
          </div>
          <p className="tiny faint mt-s">You can pick another date to log something you did earlier.</p>
          {workouts && workouts.length === 0 && (
            <p className="small muted mt">
              Save the workouts you do often in <Link to="/workouts">Workouts</Link> to find them here.
            </p>
          )}
        </section>
      </div>
      <StartWorkoutSheet open={starting} onClose={() => setStarting(false)} />
    </div>
  );
}
