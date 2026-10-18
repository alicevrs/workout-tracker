import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Segmented } from '../components/ui';
import { historyFilterKey, sessionActivity } from '../lib/activities';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import { formatDuration, formatTime } from '../lib/dates';
import { sessionSummary } from '../lib/stats';
import { compact } from '../lib/units';

const SOURCE_LABEL: Record<string, string> = { fit: 'Garmin FIT', tcx: 'TCX', strava: 'Strava', timer: '', manual: '' };

export default function HistoryPage() {
  const { unit } = useProfile();
  const all = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const [filter, setFilter] = useState('');
  const names = new Map((programs ?? []).map((p) => [p.id, p.name]));
  const keyOf = (s: NonNullable<typeof all>[number]) => historyFilterKey(s, (id) => names.get(id));
  // Filter choices: the workouts and the sports that appear in the history.
  const choices = [...new Map((all ?? []).map((s) => [keyOf(s).key, keyOf(s)])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const sessions = filter ? all?.filter((s) => keyOf(s).key === filter) : all;
  const [view, setView] = useState<'list' | 'calendar'>(() => {
    try {
      return localStorage.getItem('history-view') === 'calendar' ? 'calendar' : 'list';
    } catch {
      return 'list';
    }
  });
  const changeView = (v: 'list' | 'calendar') => {
    setView(v);
    try {
      localStorage.setItem('history-view', v);
    } catch {
      /* ignore */
    }
  };

  const groups = new Map<string, NonNullable<typeof sessions>>();
  for (const s of sessions ?? []) {
    const key = new Date(s.startedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }


  return (
    <div className="page">
      <PageHeader
        title="History"
      />
      <div className="mb">
        <Segmented<'list' | 'calendar'>
          label="History view"
          value={view}
          onChange={changeView}
          options={[
            { value: 'list', label: 'List' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
      </div>
      {choices.length > 1 && (
        <label className="field mb">
          <span className="sr-only">Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All workouts and activities</option>
            {choices.some((c) => c.workout) && (
              <optgroup label="Workouts">
                {choices.filter((c) => c.workout).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            )}
            {choices.some((c) => !c.workout) && (
              <optgroup label="Activities">
                {choices.filter((c) => !c.workout).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      {view === 'calendar' && sessions && <ActivityCalendar sessions={sessions} />}
      {all && all.length === 0 && view === 'list' && (
        <div className="card">
          <EmptyState icon="history" title="No workouts yet" action={<Link className="btn primary" to="/">Start a workout</Link>}>
            Finished workouts, logged activities and imports appear here.
          </EmptyState>
        </div>
      )}
      {view === 'list' && [...groups.entries()].map(([month, list]) => (
        <section key={month} className="mb">
          <h2 className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 4px' }}>
            {month}
          </h2>
          <ul className="list list-card">
            {list.map((s) => {
              const sum = sessionSummary(s);
              const kind = sessionActivity(s);
              return (
                <li key={s.id}>
                  <Link className="list-item" to={s.status === 'in_progress' ? `/workout/${s.id}` : `/history/${s.id}`}>
                    <span style={{ width: 4, alignSelf: 'stretch', background: kind.color, borderRadius: 2 }} aria-hidden />
                    <div style={{ width: 40, textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{new Date(s.startedAt).getDate()}</div>
                      <div className="tiny faint">{new Date(s.startedAt).toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                    </div>
                    <div className="grow">
                      <div className="ellipsis" style={{ fontWeight: 650 }}>
                        {s.title} {s.status === 'in_progress' && <span className="chip primary">In progress</span>}
                        {SOURCE_LABEL[s.source] && <span className="chip info">{SOURCE_LABEL[s.source]}</span>}
                      </div>
                      <div className="small muted num ellipsis">
                        {kind.label} · {formatTime(s.startedAt)}
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
