import type { ReactNode } from 'react';
import { EVERY_OPTIONS, MINUTE_OPTIONS, quickClock, REST_OPTIONS, ROUND_OPTIONS, SECOND_OPTIONS, SET_OPTIONS, SIGNAL_OPTIONS, type QuickTimer } from '../lib/timer/quick';
import { Icon } from './Icon';

// Big boxed values in sentences (“[8] Rounds · [0:20] Work”), shared by the Timer tab and training blocks.

/** A big boxed value; tapping it opens the native picker (a wheel on iPhone). */
export function Pick({ value, options, format, onChange, label, small }: { value: number; options: number[]; format: (v: number) => string; onChange: (v: number) => void; label: string; small?: boolean }) {
  const opts = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className={`vbox${small ? ' small' : ''}`}>
      <span className="vbox-value num">{format(value)}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

export const secs = (v: number) => quickClock(v);
export const mins = (v: number) => `${v}`;

export function Line({ children }: { children: ReactNode }) {
  return <div className="sentence">{children}</div>;
}

/** The big “sentence” settings of one timer. `compact` is used inside the Mix list. */
export function TimerFields({ q, onChange, compact, noSets }: { q: QuickTimer; onChange: (q: QuickTimer) => void; compact?: boolean; noSets?: boolean }) {
  const set = (patch: Partial<QuickTimer>) => onChange({ ...q, ...patch });
  const hasSets = (q.sets ?? 1) > 1;
  let fields: ReactNode = null;
  switch (q.kind) {
    case 'amrap':
      fields = (
        <>
          {!compact && <p className="sentence-lead">As many rounds as possible in</p>}
          <Line>
            <Pick value={q.minutes ?? 10} options={MINUTE_OPTIONS} format={mins} onChange={(v) => set({ minutes: v })} label="Minutes" small={compact} />
            <span>minutes</span>
          </Line>
        </>
      );
      break;
    case 'for_time':
      fields = (
        <>
          {!compact && <p className="sentence-lead">As fast as possible, for time</p>}
          <Line>
            <span>Time cap</span>
            <Pick value={q.minutes ?? 0} options={[0, ...MINUTE_OPTIONS]} format={(v) => (v ? `${v} min` : 'none')} onChange={(v) => set({ minutes: v })} label="Time cap" small={compact} />
          </Line>
          <Line>
            <span>Signal every</span>
            <Pick value={q.everySec ?? 0} options={SIGNAL_OPTIONS} format={(v) => (v ? `${v / 60} min` : 'off')} onChange={(v) => set({ everySec: v })} label="Signal every" small={compact} />
          </Line>
        </>
      );
      break;
    case 'emom': {
      const count = Math.floor(((q.minutes ?? 10) * 60) / (q.everySec ?? 60));
      fields = (
        <>
          <Line>
            <span>Every</span>
            <Pick value={q.everySec ?? 60} options={EVERY_OPTIONS} format={secs} onChange={(v) => set({ everySec: v })} label="Every" small={compact} />
          </Line>
          <Line>
            <span>for</span>
            <Pick value={q.minutes ?? 10} options={MINUTE_OPTIONS} format={mins} onChange={(v) => set({ minutes: v })} label="For minutes" small={compact} />
            <span>min</span>
          </Line>
          {!compact && <p className="sentence-note">{count} interval{count === 1 ? '' : 's'}</p>}
        </>
      );
      break;
    }
    case 'tabata':
      fields = (
        <>
          {!compact && <p className="sentence-lead">Set your Tabata</p>}
          <Line>
            <Pick value={q.rounds ?? 8} options={ROUND_OPTIONS} format={mins} onChange={(v) => set({ rounds: v })} label="Rounds" small={compact} />
            <span>Rounds</span>
          </Line>
          <Line>
            <Pick value={q.workSec ?? 20} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ workSec: v })} label="Work" small={compact} />
            <span>Work</span>
          </Line>
          <Line>
            <Pick value={q.restSec ?? 10} options={REST_OPTIONS} format={secs} onChange={(v) => set({ restSec: v })} label="Rest" small={compact} />
            <span>Rest</span>
          </Line>
        </>
      );
      break;
    case 'work':
      fields = (
        <Line>
          <Pick value={q.workSec ?? 60} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ workSec: v })} label="Work time" small={compact} />
          <input className="mix-label" value={q.label ?? ''} placeholder="Label, e.g. Plank" onChange={(e) => set({ label: e.target.value })} aria-label="Label" />
        </Line>
      );
      break;
    case 'rest':
      fields = (
        <Line>
          <Pick value={q.restSec ?? 60} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ restSec: v })} label="Rest time" small={compact} />
          <span>Rest</span>
        </Line>
      );
      break;
  }
  if (q.kind === 'work' || q.kind === 'rest' || (noSets && q.kind !== 'tabata')) return <div className={`sentences${compact ? ' compact-sentences' : ''}`}>{fields}</div>;
  return (
    <div className={`sentences${compact ? ' compact-sentences' : ''}`}>
      {fields}
      {hasSets ? (
        <div className="sets-box">
          <button className="btn icon ghost small sets-remove" onClick={() => set({ sets: 1 })} aria-label="Remove sets">
            <Icon name="x" />
          </button>
          <Line>
            <Pick value={q.sets ?? 2} options={SET_OPTIONS.slice(1)} format={mins} onChange={(v) => set({ sets: v })} label="Sets" small={compact} />
            <span>Sets</span>
          </Line>
          <Line>
            <Pick value={q.setRestSec ?? 60} options={REST_OPTIONS} format={secs} onChange={(v) => set({ setRestSec: v })} label="Rest between sets" small={compact} />
            <span>Rest</span>
          </Line>
        </div>
      ) : (
        <button className="btn ghost small add-sets" onClick={() => set({ sets: 2 })}>
          <Icon name="plus" /> Add sets (optional)
        </button>
      )}
    </div>
  );
}

