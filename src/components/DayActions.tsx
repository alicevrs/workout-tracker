import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Program, ProgramDay } from '../db/types';
import { createSession } from '../lib/session';
import { Icon } from './Icon';
import { LogPastWorkout } from './LogPastWorkout';

/** Start / Log-as-done buttons for a program day. Logging asks for the date, so past days work too. */
export function DayActions({ program, day, compact = false }: { program: Program; day: ProgramDay; compact?: boolean }) {
  const navigate = useNavigate();
  const [logging, setLogging] = useState(false);

  const start = async () => {
    const s = createSession({ program, day });
    await db.sessions.add(s);
    navigate(`/workout/${s.id}`);
  };

  return (
    <>
      <button className="btn primary small" onClick={start} disabled={!day.blocks.length}>
        <Icon name="play" /> Start
      </button>
      <button className="btn small" onClick={() => setLogging(true)} disabled={!day.blocks.length} aria-label={`Log ${day.name} as done`}>
        <Icon name="check" /> {compact ? 'Log' : 'Log as done'}
      </button>
      <LogPastWorkout open={logging} onClose={() => setLogging(false)} program={program} day={day} />
    </>
  );
}
