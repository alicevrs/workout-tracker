import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { LogPastWorkout } from '../components/LogPastWorkout';
import { toDateKey } from '../lib/dates';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader, Sheet } from '../components/ui';
import { db } from '../db/db';
import { saveSettings, useSettings } from '../db/repo';
import { backupReminderDue } from '../lib/backup';
import { formatTime } from '../lib/dates';
import { describeBlock } from '../lib/program';
import { workoutDay } from '../lib/workouts';
import type { Program } from '../db/types';
import { createSession } from '../lib/session';

export default function TodayPage() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const settings = useSettings();
  const oldest = useLiveQuery(() => db.sessions.orderBy('startedAt').first(), []);
  const remind = backupReminderDue(settings, oldest?.startedAt);
  const start = async (w: Program | null) => {
    const s = w ? createSession({ program: w, day: workoutDay(w) }) : createSession({ title: 'Workout' });
    await db.sessions.add(s);
    setStarting(false);
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
            <button className="btn primary block" style={{ minHeight: 56 }} onClick={() => setStarting(true)}>
              <Icon name="play" /> Start a workout
            </button>
            <div className="grid two">
              <button className="btn block" onClick={() => setLogDate(toDateKey(Date.now()))}>
                <Icon name="check" /> Log a workout
              </button>
              <button className="btn block" onClick={() => setLogDate(toDateKey(Date.now() - 86_400_000))}>
                <Icon name="history" /> Log a past workout
              </button>
            </div>
            <Link className="btn block ghost" to="/activity/new">
              <Icon name="flag" /> Log a sport or outdoor activity
            </Link>
          </div>
          {workouts && workouts.length === 0 && (
            <p className="small muted mt">
              Save the workouts you do often in <Link to="/workouts">Workouts</Link> to start or log them with one tap.
            </p>
          )}
        </section>
      </div>
      <LogPastWorkout open={logDate !== null} onClose={() => setLogDate(null)} date={logDate ?? undefined} />
      <Sheet open={starting} onClose={() => setStarting(false)} title="Start a workout">
        <ul className="list">
          {(workouts ?? []).map((w) => (
            <li key={w.id}>
              <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }} onClick={() => start(w)}>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{w.name}</div>
                  <div className="small muted ellipsis">{workoutDay(w).blocks.map((b) => b.name ?? describeBlock(b)).join(' · ')}</div>
                </div>
                <Icon name="play" />
              </button>
            </li>
          ))}
          <li>
            <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => start(null)}>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>Free workout</div>
                <div className="small muted">Start empty and add blocks as you go</div>
              </div>
              <Icon name="plus" />
            </button>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
