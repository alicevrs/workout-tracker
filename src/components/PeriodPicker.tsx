import { useState } from 'react';
import type { Session } from '../db/types';
import { monthGrid, sessionActivity, sessionsByDay } from '../lib/activities';
import { addMonths, startOfMonth, startOfWeek, startOfYear, toDateKey } from '../lib/dates';
import { Icon } from './Icon';
import { Sheet } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i);

export type PickMode = 'session' | 'week' | 'month';

/**
 * Pick a workout, a week or a month from a calendar that shows what was done on each day,
 * instead of stepping back one at a time.
 */
export function PeriodPicker({
  open,
  onClose,
  mode,
  sessions,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  mode: PickMode;
  sessions: Session[];
  /** The currently shown day, week start or month start. */
  value: number;
  /** A day (week mode), a month start (month mode) or a session (session mode). */
  onPick: (ms: number, session?: Session) => void;
}) {
  const [anchor, setAnchor] = useState(() => (mode === 'month' ? startOfYear(value) : startOfMonth(value)));
  const [day, setDay] = useState<string | null>(null);
  const now = Date.now();
  const today = toDateKey(now);
  const byDay = sessionsByDay(sessions);
  const step = mode === 'month' ? 12 : 1;
  const canNext = addMonths(anchor, step) <= now;
  const title = mode === 'session' ? 'Choose a workout' : mode === 'week' ? 'Choose a week' : 'Choose a month';
  const selWeek = mode === 'week' ? startOfWeek(value) : null;
  const dayList = day ? byDay.get(day) ?? [] : [];

  const header = (label: string) => (
    <div className="row between mb">
      <button className="btn icon small" aria-label="Previous" onClick={() => setAnchor(addMonths(anchor, -step))}>
        <Icon name="back" />
      </button>
      <h3 style={{ textAlign: 'center' }}>{label}</h3>
      <button className="btn icon small" aria-label="Next" disabled={!canNext} onClick={() => setAnchor(addMonths(anchor, step))}>
        <Icon name="forward" />
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {mode === 'month' ? (
        <>
          {header(String(new Date(anchor).getFullYear()))}
          <div className="month-pick">
            {MONTHS.map((m) => {
              const start = addMonths(anchor, m);
              const end = addMonths(start, 1);
              const active = sessions.some((s) => s.startedAt >= start && s.startedAt < end);
              return (
                <button
                  key={m}
                  className={`month-cell ${active ? 'on' : ''} ${startOfMonth(value) === start ? 'sel' : ''}`}
                  disabled={start > now}
                  onClick={() => onPick(start)}
                >
                  {new Date(start).toLocaleDateString('en-GB', { month: 'short' })}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {header(new Date(anchor).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}
          <div className="cal" role="grid">
            <div className="cal-row pick cal-head" role="row">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader">
                  {d}
                </div>
              ))}
            </div>
            {monthGrid(anchor).map((week) => (
              <div key={week[0].key} className="cal-row pick" role="row">
                {week.map((d) => {
                  const list = byDay.get(d.key) ?? [];
                  const kinds = [...new Map(list.map((s) => [sessionActivity(s).group, sessionActivity(s)])).values()];
                  const inWeek = selWeek !== null && startOfWeek(d.date.getTime()) === selWeek;
                  return (
                    <button
                      key={d.key}
                      role="gridcell"
                      className={`cal-day ${d.inMonth ? '' : 'out'} ${d.key === today ? 'today' : ''} ${inWeek || day === d.key ? 'sel' : ''}`}
                      disabled={d.key > today || (mode === 'session' && list.length === 0)}
                      aria-label={d.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      onClick={() => {
                        if (mode === 'week') return onPick(d.date.getTime());
                        if (list.length === 1) return onPick(list[0].startedAt, list[0]);
                        setDay(d.key);
                      }}
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
              </div>
            ))}
          </div>
          {mode === 'session' && dayList.length > 1 && (
            <ul className="lib-list mt">
              {dayList.map((s) => (
                <li key={s.id} className="lib-row">
                  <button className="lib-main" onClick={() => onPick(s.startedAt, s)}>
                    <span className="lib-name">{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
