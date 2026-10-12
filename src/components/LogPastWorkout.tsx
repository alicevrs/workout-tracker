import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Program, ProgramDay } from '../db/types';
import { pad, toDateKey } from '../lib/dates';
import { FORMAT_INFO } from '../lib/program';
import { loggedDaySession } from '../lib/quickLog';
import { createSession } from '../lib/session';
import { Icon } from './Icon';
import { Sheet, useToast } from './ui';

/** Local timestamp for a YYYY-MM-DD date and HH:MM time. */
function at(date: string, time: string): number {
  return new Date(`${date}T${time || '18:00'}:00`).getTime();
}

/**
 * Register a workout on any date, also afterwards: either “as planned” in one tap, or with
 * the sets open so they can be ticked and corrected one by one.
 */
export function LogPastWorkout({
  open,
  onClose,
  date: initialDate,
  program: fixedProgram,
  day: fixedDay,
}: {
  open: boolean;
  onClose: () => void;
  /** YYYY-MM-DD, default today. */
  date?: string;
  /** When set, the sheet is for this program day only. */
  program?: Program;
  day?: ProgramDay;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const programs = useLiveQuery(() => db.programs.toArray(), []) ?? [];
  const days = fixedDay && fixedProgram ? [{ program: fixedProgram, day: fixedDay }] : programs.flatMap((p) => p.days.filter((d) => d.blocks.length).map((d) => ({ program: p, day: d })));
  const [date, setDate] = useState(initialDate ?? toDateKey(Date.now()));
  const [time, setTime] = useState('');
  const [choice, setChoice] = useState<string>(fixedDay?.id ?? '');
  const [include, setInclude] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? toDateKey(Date.now()));
    const now = new Date();
    setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setChoice(fixedDay?.id ?? '');
    setInclude([]);
  }, [open, initialDate, fixedDay?.id]);

  const picked = days.find((d) => d.day.id === choice);
  const optional = picked?.day.blocks.filter((b) => b.optional) ?? [];
  const today = toDateKey(Date.now());
  const endAt = Math.min(at(date, time), Date.now());
  const future = date > today;

  const logAsPlanned = async () => {
    if (!picked) return;
    const s = loggedDaySession(picked.program, picked.day, { includeOptional: include, endAt });
    await db.sessions.add(s);
    onClose();
    toast(`${picked.day.name} logged`);
    navigate(`/history/${s.id}`);
  };

  const enterSets = async () => {
    let s;
    if (picked) {
      const planned = loggedDaySession(picked.program, picked.day, { includeOptional: include, endAt });
      const fresh = createSession({ program: picked.program, day: picked.day, now: planned.startedAt });
      s = {
        ...fresh,
        blocks: fresh.blocks.map((b, i) => (b.optional && !include.includes(picked.day.blocks[i].id) ? { ...b, skipped: true } : b)),
        status: 'completed' as const,
        endedAt: planned.endedAt,
      };
    } else {
      s = { ...createSession({ title: 'Workout', now: endAt - 3600_000 }), status: 'completed' as const, endedAt: endAt };
    }
    await db.sessions.add(s);
    onClose();
    navigate(`/workout/${s.id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title={fixedDay ? `Log “${fixedDay.name}”` : 'Log a workout'}>
      <div className="form-grid mb">
        <label className="field">
          Date
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Finished at
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {!fixedDay && (
        <div className="mb">
          <h3 className="small muted" style={{ marginBottom: 6 }}>
            What did you do?
          </h3>
          {days.map(({ program, day }) => (
            <label key={day.id} className="check-row">
              <input type="radio" name="past-day" checked={choice === day.id} onChange={() => setChoice(day.id)} />
              <span>
                {day.name} <span className="small faint">· {program.name}</span>
              </span>
            </label>
          ))}
          <label className="check-row">
            <input type="radio" name="past-day" checked={choice === ''} onChange={() => setChoice('')} />
            Other workout (empty, add blocks yourself)
          </label>
          <Link className="btn small ghost" to={`/activity/new?date=${date}`} onClick={onClose}>
            <Icon name="flag" /> A sport or outdoor activity instead
          </Link>
        </div>
      )}

      {optional.length > 0 && (
        <div className="mb">
          <h3 className="small muted" style={{ marginBottom: 6 }}>
            Optional blocks done
          </h3>
          {optional.map((b) => (
            <label key={b.id} className="check-row">
              <input type="checkbox" checked={include.includes(b.id)} onChange={(e) => setInclude(e.target.checked ? [...include, b.id] : include.filter((x) => x !== b.id))} />
              {b.name ?? FORMAT_INFO[b.format].label}
            </label>
          ))}
        </div>
      )}

      {future && (
        <div className="banner warn mb" role="alert">
          The date is in the future.
        </div>
      )}
      <div className="stack">
        {picked && (
          <button className="btn primary block" onClick={logAsPlanned} disabled={future}>
            <Icon name="check" /> Log as done (everything as planned)
          </button>
        )}
        <button className={`btn block ${picked ? '' : 'primary'}`} onClick={enterSets} disabled={future}>
          <Icon name="edit" /> {picked ? 'Enter the sets myself' : 'Create and fill in'}
        </button>
        <p className="tiny faint">You can change any value afterwards from History.</p>
      </div>
    </Sheet>
  );
}
