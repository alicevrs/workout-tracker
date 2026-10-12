import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader } from '../components/ui';
import { db } from '../db/db';
import { saveSettings, useSettings } from '../db/repo';
import { backupReminderDue } from '../lib/backup';
import { formatTime } from '../lib/dates';
import { describeBlock, WEEKDAYS, weekdayIndex } from '../lib/program';
import { DayActions } from '../components/DayActions';
import { createSession } from '../lib/session';

export default function TodayPage() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => db.sessions.where('status').equals('in_progress').toArray(), []);
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const today = weekdayIndex();
  const settings = useSettings();
  const oldest = useLiveQuery(() => db.sessions.orderBy('startedAt').first(), []);
  const remind = backupReminderDue(settings, oldest?.startedAt);
  const planned = (programs ?? []).flatMap((p) => p.days.filter((d) => d.weekday === today).map((d) => ({ program: p, day: d })));
  const otherDays = (programs ?? []).flatMap((p) => p.days.filter((d) => d.weekday !== today && d.blocks.length).map((d) => ({ program: p, day: d })));

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
          <h2 className="mb">Planned for today</h2>
          {planned.length === 0 ? (
            <p className="muted small">
              Nothing scheduled. Assign a weekday to a program day, or start a free workout.
            </p>
          ) : (
            planned.map(({ program, day }) => (
              <div key={day.id} className="row wrap" style={{ minHeight: 56 }}>
                <div className="grow" style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <strong>{day.name}</strong> <span className="small muted">· {program.name}</span>
                  <div className="small faint ellipsis">{day.blocks.map(describeBlock).join(' · ')}</div>
                </div>
                <DayActions program={program} day={day} />
              </div>
            ))
          )}
          {otherDays.length > 0 && (
            <details className="mt-s">
              <summary className="small muted" style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                Do another day of your program
              </summary>
              {otherDays.map(({ program, day }) => (
                <div key={day.id} className="row wrap" style={{ minHeight: 52, borderTop: '1px solid var(--border)' }}>
                  <div className="grow" style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <strong>{day.name}</strong>
                    <div className="small faint ellipsis">
                      {program.name}
                      {day.weekday !== undefined ? ` · ${WEEKDAYS[day.weekday]}` : ''}
                    </div>
                  </div>
                  <DayActions program={program} day={day} compact />
                </div>
              ))}
            </details>
          )}
          <div className="row wrap mt">
            <button className="btn" onClick={startEmpty}>
              <Icon name="plus" /> Free workout
            </button>
            <Link className="btn" to="/activity/new">
              <Icon name="flag" /> Log activity
            </Link>
            <Link className="btn" to="/programs">
              <Icon name="calendar" /> Programs
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
