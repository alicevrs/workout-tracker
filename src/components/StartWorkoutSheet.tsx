import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Program } from '../db/types';
import { toDateKey } from '../lib/dates';
import { describeBlock, estimateBlockSeconds } from '../lib/program';
import { createSession } from '../lib/session';
import { workoutDay } from '../lib/workouts';
import { Icon } from './Icon';
import { Sheet } from './ui';

/**
 * Pick a saved workout (or a free one) and a date. Today → the workout starts live (timer,
 * tick sets as you go). A past date → the workout is created on that day to fill in.
 */
export function StartWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []) ?? [];
  const today = toDateKey(Date.now());
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('18:00');

  useEffect(() => {
    if (open) {
      setDate(toDateKey(Date.now()));
      setTime('18:00');
    }
  }, [open]);

  const past = date < today;

  const start = async (w: Program | null) => {
    const day = w ? workoutDay(w) : undefined;
    let s;
    if (!past) {
      s = w ? createSession({ program: w, day }) : createSession({ title: 'Workout' });
    } else {
      const startAt = new Date(`${date}T${time || '18:00'}:00`).getTime();
      const seconds = day ? day.blocks.reduce((t, b) => t + estimateBlockSeconds(b), 0) || 3600 : 3600;
      const base = w ? createSession({ program: w, day, now: startAt }) : createSession({ title: 'Workout', now: startAt });
      s = { ...base, status: 'completed' as const, endedAt: startAt + Math.round(seconds) * 1000 };
    }
    await db.sessions.add(s);
    onClose();
    navigate(`/workout/${s.id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Start a workout">
      <div className="form-grid mb">
        <label className="field">
          Date
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        {past ? (
          <label className="field">
            Started at
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        ) : (
          <p className="small muted" style={{ alignSelf: 'end', margin: 0 }}>
            Today: the workout starts now, with the timer.
          </p>
        )}
      </div>
      {past && <p className="small muted">The workout is saved on {new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. Tick the sets you did, or use “Mark all as done”.</p>}
      <ul className="list">
        {workouts.map((w) => (
          <li key={w.id}>
            <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }} onClick={() => start(w)}>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>{w.name}</div>
                <div className="small muted ellipsis">{workoutDay(w).blocks.map((b) => b.name ?? describeBlock(b)).join(' · ')}</div>
              </div>
              <Icon name={past ? 'edit' : 'play'} />
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
  );
}
