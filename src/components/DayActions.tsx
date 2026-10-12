import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Program, ProgramDay } from '../db/types';
import { FORMAT_INFO } from '../lib/program';
import { loggedDaySession } from '../lib/quickLog';
import { createSession } from '../lib/session';
import { Icon } from './Icon';
import { Sheet, useToast } from './ui';

/** Start / Log-as-done buttons for a program day. */
export function DayActions({ program, day, compact = false }: { program: Program; day: ProgramDay; compact?: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const optional = day.blocks.filter((b) => b.optional);
  const [include, setInclude] = useState<string[]>([]);
  const [endTime, setEndTime] = useState('');

  const start = async () => {
    const s = createSession({ program, day });
    await db.sessions.add(s);
    navigate(`/workout/${s.id}`);
  };

  const log = async () => {
    let endAt: number | undefined;
    if (endTime) {
      const [h, m] = endTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      endAt = d.getTime();
    }
    const s = loggedDaySession(program, day, { includeOptional: include, endAt });
    await db.sessions.add(s);
    setAsking(false);
    toast(`${day.name} logged`);
    navigate(`/history/${s.id}`);
  };

  return (
    <>
      <button className="btn primary small" onClick={start} disabled={!day.blocks.length}>
        <Icon name="play" /> Start
      </button>
      <button className="btn small" onClick={() => setAsking(true)} disabled={!day.blocks.length} aria-label={`Log ${day.name} as done`}>
        <Icon name="check" /> {compact ? 'Done' : 'Log as done'}
      </button>
      <Sheet open={asking} onClose={() => setAsking(false)} title={`Log “${day.name}” as done`}>
        <p className="small muted">All exercises are logged exactly as planned. You can edit any value afterwards.</p>
        {optional.length > 0 && (
          <div className="mb">
            <h3 className="small muted mb" style={{ marginBottom: 6 }}>
              Optional blocks done today
            </h3>
            {optional.map((b) => (
              <label key={b.id} className="check-row">
                <input type="checkbox" checked={include.includes(b.id)} onChange={(e) => setInclude(e.target.checked ? [...include, b.id] : include.filter((x) => x !== b.id))} />
                {b.name ?? FORMAT_INFO[b.format].label}
              </label>
            ))}
          </div>
        )}
        <label className="field mb">
          Finished at <span className="faint">(leave empty for now)</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
        <button className="btn primary block" onClick={log}>
          <Icon name="check" /> Log workout
        </button>
      </Sheet>
    </>
  );
}
