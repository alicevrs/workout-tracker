import type { ReactNode } from 'react';
import { quickClock, ROUND_OPTIONS, SET_OPTIONS, SIGNAL_OPTIONS, type QuickTimer } from '../lib/timer/quick';
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

/**
 * A time in minutes and seconds in one box: the minutes (before the colon) and the seconds (after
 * it, in 5 s steps) each open their own native wheel, so any time takes at most two taps.
 */
export function ClockPick({
  value,
  onChange,
  label,
  small,
  maxMin = 60,
  min = 0,
  emptyText,
}: {
  /** Seconds. */
  value: number;
  onChange: (sec: number) => void;
  label: string;
  small?: boolean;
  maxMin?: number;
  /** Smallest allowed value in seconds. */
  min?: number;
  /** Shown instead of 0:00 (e.g. “none”). */
  emptyText?: string;
}) {
  const total = Math.max(0, Math.round(value));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const minutes = Array.from({ length: Math.max(maxMin, m) + 1 }, (_, i) => i);
  const seconds = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!seconds.includes(s)) seconds.push(s), seconds.sort((a, b) => a - b);
  const set = (mm: number, ss: number) => onChange(Math.max(min, mm * 60 + ss));
  const empty = !total && emptyText;
  return (
    <span className={`vbox clock${small ? ' small' : ''}`}>
      <label className="clock-part clock-min">
        <span className="vbox-value num">{empty ? emptyText : m}</span>
        <select aria-label={`${label}, minutes`} value={m} onChange={(e) => set(Number(e.target.value), s)}>
          {minutes.map((o) => (
            <option key={o} value={o}>
              {o} min
            </option>
          ))}
        </select>
      </label>
      {!empty && <span className="vbox-value num clock-colon">:</span>}
      <label className={`clock-part clock-sec${empty ? ' clock-hidden' : ''}`}>
        {!empty && <span className="vbox-value num">{String(s).padStart(2, '0')}</span>}
        <select aria-label={`${label}, seconds`} value={s} onChange={(e) => set(m, Number(e.target.value))}>
          {seconds.map((o) => (
            <option key={o} value={o}>
              {String(o).padStart(2, '0')} s
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}

/** Minutes (possibly with seconds) to whole seconds. */
const toSec = (min: number | undefined, fallback: number) => Math.round((min ?? fallback) * 60);

export const secs = (v: number) => quickClock(v);
export const mins = (v: number) => `${v}`;

export function Line({ children }: { children: ReactNode }) {
  return <div className="sentence">{children}</div>;
}

/** The big “sentence” settings of one timer. `compact` is used inside the Mix list. */
export function TimerFields({ q, onChange, compact }: { q: QuickTimer; onChange: (q: QuickTimer) => void; compact?: boolean }) {
  const set = (patch: Partial<QuickTimer>) => onChange({ ...q, ...patch });
  const hasSets = (q.sets ?? 1) > 1;
  let fields: ReactNode = null;
  switch (q.kind) {
    case 'amrap':
      fields = (
        <>
          {!compact && <p className="sentence-lead">As many rounds as possible in</p>}
          <Line>
            <ClockPick value={toSec(q.minutes, 10)} min={5} maxMin={120} onChange={(v) => set({ minutes: v / 60 })} label="Time" small={compact} />
            <span>min</span>
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
            <ClockPick value={toSec(q.minutes, 0)} maxMin={120} emptyText="none" onChange={(v) => set({ minutes: v / 60 })} label="Time cap" small={compact} />
          </Line>
          <Line>
            <span>Signal every</span>
            <Pick value={q.everySec ?? 0} options={SIGNAL_OPTIONS} format={(v) => (v ? `${v / 60} min` : 'off')} onChange={(v) => set({ everySec: v })} label="Signal every" small={compact} />
          </Line>
        </>
      );
      break;
    case 'emom': {
      const count = Math.floor(toSec(q.minutes, 10) / (q.everySec ?? 60));
      fields = (
        <>
          <Line>
            <span>Every</span>
            <ClockPick value={q.everySec ?? 60} min={5} maxMin={10} onChange={(v) => set({ everySec: v })} label="Every" small={compact} />
          </Line>
          <Line>
            <span>for</span>
            <ClockPick value={toSec(q.minutes, 10)} min={5} maxMin={120} onChange={(v) => set({ minutes: v / 60 })} label="For" small={compact} />
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
            <ClockPick value={q.workSec ?? 20} min={5} maxMin={10} onChange={(v) => set({ workSec: v })} label="Work" small={compact} />
            <span>Work</span>
          </Line>
          <Line>
            <ClockPick value={q.restSec ?? 10} maxMin={10} onChange={(v) => set({ restSec: v })} label="Rest" small={compact} />
            <span>Rest</span>
          </Line>
        </>
      );
      break;
    case 'work':
      fields = (
        <Line>
          <ClockPick value={q.workSec ?? 60} min={5} maxMin={30} onChange={(v) => set({ workSec: v })} label="Work time" small={compact} />
          <input className="mix-label" value={q.label ?? ''} placeholder="Label" onChange={(e) => set({ label: e.target.value })} aria-label="Label" />
        </Line>
      );
      break;
    case 'rest':
      fields = (
        <Line>
          <ClockPick value={q.restSec ?? 60} min={5} maxMin={30} onChange={(v) => set({ restSec: v })} label="Rest time" small={compact} />
          <span>Rest</span>
        </Line>
      );
      break;
  }
  if (q.kind === 'work' || q.kind === 'rest') return <div className={`sentences${compact ? ' compact-sentences' : ''}`}>{fields}</div>;
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
            <ClockPick value={q.setRestSec ?? 60} maxMin={15} onChange={(v) => set({ setRestSec: v })} label="Rest between sets" small={compact} />
            <span>Rest</span>
          </Line>
        </div>
      ) : (
        <button className="btn ghost small add-sets" onClick={() => set({ sets: 2, setRestSec: q.setRestSec ?? 60 })}>
          <Icon name="plus" /> Add sets (optional)
        </button>
      )}
    </div>
  );
}

