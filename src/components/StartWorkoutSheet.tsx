import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Program } from '../db/types';
import { toDateKey } from '../lib/dates';
import { estimateBlockSeconds } from '../lib/program';
import { createSession } from '../lib/session';
import { workoutDay } from '../lib/workouts';
import { Icon } from './Icon';
import { Sheet } from './ui';

/**
 * Pick a saved workout (or a free one) and a date. Today → the workout starts live (timer,
 * tick sets as you go). A past date → the workout is created on that day (at midday) to fill in.
 */
export function StartWorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const workouts = useLiveQuery(() => db.programs.orderBy('name').toArray(), []) ?? [];
  const today = toDateKey(Date.now());
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (open) setDate(toDateKey(Date.now()));
  }, [open]);

  const past = date < today;

  const start = async (w: Program | null) => {
    const day = w ? workoutDay(w) : undefined;
    let s;
    if (!past) {
      s = w ? createSession({ program: w, day }) : createSession({ title: 'Workout' });
    } else {
      // The time of day does not matter for a past workout: it is saved at midday.
      const startAt = new Date(`${date}T12:00:00`).getTime();
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
      <label className="field mb">
        Date
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
      </label>
      <ul className="list">
        {workouts.map((w) => (
          <li key={w.id}>
            <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }} onClick={() => start(w)}>
              <div className="grow" style={{ fontWeight: 650 }}>
                {w.name}
              </div>
              <Icon name={past ? 'edit' : 'play'} />
            </button>
          </li>
        ))}
        <li>
          <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => start(null)}>
            <div className="grow" style={{ fontWeight: 650 }}>
              Free workout
            </div>
            <Icon name="plus" />
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
