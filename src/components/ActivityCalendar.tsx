import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GROUP_INFO, type SportGroup } from '../data/sports';
import type { Session } from '../db/types';
import { activeDays, monthGrid, sessionActivity, sessionsByDay } from '../lib/activities';
import { addMonths, formatDuration, fromDateKey, startOfDay, startOfMonth, startOfYear, toDateKey } from '../lib/dates';
import { sessionDurationSec } from '../lib/session';
import { Icon } from './Icon';
import { Segmented } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type CalView = 'month' | 'year';
const VIEW_KEY = 'history-cal-view';

/** First day of the period containing `ms`, the first day of the next one, and its title. */
function period(view: CalView, ms: number): { start: number; end: number; title: string } {
  const month = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('en-GB', opts);
  switch (view) {
    case 'month': {
      const start = startOfMonth(ms);
      return { start, end: addMonths(start, 1), title: month(start, { month: 'long', year: 'numeric' }) };
    }
    case 'year': {
      const start = startOfYear(ms);
      return { start, end: addMonths(start, 12), title: String(new Date(start).getFullYear()) };
    }
  }
}
const stepPeriod = (view: CalView, ms: number, dir: 1 | -1) => addMonths(ms, dir * (view === 'month' ? 1 : 12));

/** Activity calendar by month or year: every day shows the colour of each activity type done. */
export function ActivityCalendar({ sessions }: { sessions: Session[] }) {
  const [view, setView] = useState<CalView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'year' ? 'year' : 'month';
    } catch {
      return 'month';
    }
  });
  const [anchor, setAnchor] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(toDateKey(Date.now()));
  const touch = useRef<{ x: number; y: number } | null>(null);

  const done = sessions.filter((s) => s.status === 'completed');
  const byDay = sessionsByDay(done);
  const today = toDateKey(Date.now());
  const p = period(view, anchor);
  const endOfToday = startOfDay(Date.now()) + 86_399_999;
  const summary = activeDays(done, p.start, Math.min(p.end - 1, endOfToday));
  const groups = (Object.keys(summary.daysByGroup) as SportGroup[]).sort((a, b) => (summary.daysByGroup[b] ?? 0) - (summary.daysByGroup[a] ?? 0));
  const dayList = selected ? byDay.get(selected) ?? [] : [];
  const isFuture = (key: string) => key > today;
  const canNext = stepPeriod(view, p.start, 1) <= Date.now();

  const changeView = (v: CalView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const go = (dir: 1 | -1) => {
    if (dir === 1 && !canNext) return;
    setAnchor(stepPeriod(view, p.start, dir));
  };
  const kindsOf = (key: string) => {
    const list = byDay.get(key) ?? [];
    return [...new Map(list.map((s) => [sessionActivity(s).group, sessionActivity(s)])).values()];
  };

  const dayCell = (d: { key: string; date: Date; inMonth: boolean }) => {
    const list = byDay.get(d.key) ?? [];
    const kinds = kindsOf(d.key);
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
  };

  const weekRow = (week: { key: string; date: Date; inMonth: boolean }[]) => {
    const active = week.filter((d) => byDay.has(d.key)).length;
    return (
      <div key={week[0].key} className="cal-row" role="row">
        {week.map(dayCell)}
        <div className="cal-week num" aria-label={isFuture(week[0].key) ? undefined : `${active} active days this week`}>
          {isFuture(week[0].key) ? '' : `${active}/7`}
        </div>
      </div>
    );
  };

  /** A small month for the year view: one coloured square per day. */
  const miniMonth = (start: number) => {
    const weeks = monthGrid(start);
    return (
      <div key={start} className="mini-month">
        <div className="mini-title">{new Date(start).toLocaleDateString('en-GB', { month: 'short' })}</div>
        <div className="mini-grid" role="grid" aria-label={new Date(start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}>
          {weeks.flat().map((d) => {
            if (!d.inMonth) return <span key={d.key} aria-hidden />;
            const kinds = kindsOf(d.key);
            const bg = kinds.length > 1 ? `linear-gradient(135deg, ${kinds[0].color} 50%, ${kinds[1].color} 50%)` : kinds[0]?.color;
            return (
              <button
                key={d.key}
                role="gridcell"
                className={`mini-day ${kinds.length ? 'on' : ''} ${d.key === today ? 'today' : ''} ${selected === d.key ? 'sel' : ''}`}
                style={bg ? { background: bg } : undefined}
                disabled={isFuture(d.key)}
                aria-label={`${d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}: ${kinds.length ? kinds.map((k) => k.label).join(', ') : 'no activity'}`}
                onClick={() => setSelected(d.key)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const months = view === 'year' ? Array.from({ length: 12 }, (_, i) => addMonths(p.start, i)) : [];

  return (
    <section
      className="card"
      aria-label="Activity calendar"
      // Swipe left or right to move to the next or previous period.
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t0 = touch.current;
        touch.current = null;
        if (!t0) return;
        const dx = e.changedTouches[0].clientX - t0.x;
        const dy = Math.abs(e.changedTouches[0].clientY - t0.y);
        if (Math.abs(dx) > 60 && dy < Math.abs(dx) * 0.6) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="mb">
        <Segmented<CalView>
          label="Calendar period"
          value={view}
          onChange={changeView}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
        />
      </div>
      <div className="row between mb">
        <button className="btn icon small" aria-label="Previous" onClick={() => go(-1)}>
          <Icon name="back" />
        </button>
        <h2 style={{ textAlign: 'center' }}>{p.title}</h2>
        <button className="btn icon small" aria-label="Next" onClick={() => go(1)} disabled={!canNext}>
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

      {view === 'month' && (
        <div className="cal" role="grid" aria-label="Days">
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
          {monthGrid(p.start).map(weekRow)}
        </div>
      )}
      {months.length > 0 && <div className={`mini-months ${view}`}>{months.map(miniMonth)}</div>}

      {selected && (
        <div className="mt">
          <div className="row between">
            <h3>{fromDateKey(selected).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
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
