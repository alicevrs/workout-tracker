import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GROUP_INFO, type SportGroup } from '../data/sports';
import type { Session } from '../db/types';
import { activeDays, monthGrid, sessionActivity, sessionsByDay } from '../lib/activities';
import { addMonths, formatDuration, fromDateKey, startOfDay, startOfMonth, toDateKey } from '../lib/dates';
import { sessionDurationSec } from '../lib/session';
import { Icon } from './Icon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Month calendar: every day shows a coloured bar per activity type done that day. */
export function ActivityCalendar({ sessions }: { sessions: Session[] }) {
  const [month, setMonth] = useState(() => startOfMonth(Date.now()));
  const [selected, setSelected] = useState<string | null>(toDateKey(Date.now()));
  const done = sessions.filter((s) => s.status === 'completed');
  const byDay = sessionsByDay(done);
  const weeks = monthGrid(month);
  const today = toDateKey(Date.now());
  const monthEnd = Math.min(addMonths(month, 1) - 1, startOfDay(Date.now()) + 86_399_999);
  const summary = activeDays(done, month, monthEnd);
  const groups = (Object.keys(summary.daysByGroup) as SportGroup[]).sort((a, b) => (summary.daysByGroup[b] ?? 0) - (summary.daysByGroup[a] ?? 0));
  const dayList = selected ? byDay.get(selected) ?? [] : [];
  const isFuture = (key: string) => key > today;

  return (
    <section className="card" aria-label="Activity calendar">
      <div className="row between mb">
        <button className="btn icon small" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="back" />
        </button>
        <h2 style={{ textAlign: 'center' }}>{new Date(month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button className="btn icon small" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={addMonths(month, 1) > Date.now()}>
          <Icon name="forward" />
        </button>
      </div>

      <p className="small muted">
        <strong style={{ color: 'var(--text)', fontSize: '1.1rem' }}>{summary.activeDays}</strong> active days out of {summary.days}
        {summary.days ? ` (${Math.round((summary.activeDays / summary.days) * 100)}%)` : ''}
      </p>
      {groups.length > 0 && (
        <div className="chips mb" aria-label="Days per activity type">
          {groups.map((g) => (
            <span key={g} className="chip" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, background: GROUP_INFO[g].color, borderRadius: 2 }} aria-hidden />
              {GROUP_INFO[g].label}: {summary.daysByGroup[g]} {summary.daysByGroup[g] === 1 ? 'day' : 'days'}
            </span>
          ))}
        </div>
      )}

      <div className="cal" role="grid" aria-label="Days of the month">
        <div className="cal-row cal-head" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader">
              {d}
            </div>
          ))}
          <div role="columnheader" title="Active days in the week">
            Days
          </div>
        </div>
        {weeks.map((week) => {
          const active = week.filter((d) => byDay.has(d.key)).length;
          return (
            <div key={week[0].key} className="cal-row" role="row">
              {week.map((d) => {
                const list = byDay.get(d.key) ?? [];
                const kinds = [...new Map(list.map((s) => [sessionActivity(s).group, sessionActivity(s)])).values()];
                const label = `${d.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length ? list.map((s) => sessionActivity(s).label).join(', ') : 'no activity'}`;
                return (
                  <button
                    key={d.key}
                    role="gridcell"
                    className={`cal-day ${d.inMonth ? '' : 'out'} ${d.key === today ? 'today' : ''} ${selected === d.key ? 'sel' : ''}`}
                    aria-label={label}
                    aria-selected={selected === d.key}
                    disabled={isFuture(d.key)}
                    onClick={() => setSelected(d.key)}
                  >
                    <span className="num">{d.date.getDate()}</span>
                    <span className="cal-bars" aria-hidden>
                      {kinds.slice(0, 3).map((k) => (
                        <span key={k.group} style={{ background: k.color }} />
                      ))}
                    </span>
                  </button>
                );
              })}
              <div className="cal-week num" aria-label={isFuture(week[0].key) ? undefined : `${active} active days this week`}>
                {isFuture(week[0].key) ? '' : `${active}/7`}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt">
          <div className="row between">
            <h3>{fromDateKey(selected).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {!isFuture(selected) && (
              <Link className="btn small" to={`/activity/new?date=${selected}`}>
                <Icon name="plus" /> Activity
              </Link>
            )}
          </div>
          {dayList.length === 0 ? (
            <p className="small muted mt-s">No activity logged.</p>
          ) : (
            <ul className="list mt-s">
              {dayList.map((s) => {
                const k = sessionActivity(s);
                const dur = sessionDurationSec(s);
                return (
                  <li key={s.id}>
                    <Link to={`/history/${s.id}`} className="list-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <span style={{ width: 4, alignSelf: 'stretch', background: k.color, borderRadius: 2 }} aria-hidden />
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                        <div className="small muted">
                          {k.label}
                          {dur ? ` · ${formatDuration(dur)}` : ''}
                          {s.distanceM ? ` · ${(s.distanceM / 1000).toFixed(1)} km` : ''}
                          {s.elevationGainM ? ` · +${Math.round(s.elevationGainM)} m` : ''}
                        </div>
                      </div>
                      <Icon name="forward" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
