import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Exercise, PerformedBlock, PerformedEntry, SetRecord, WeightUnit } from '../db/types';
import { formatClock, formatShortDate } from '../lib/dates';
import { plannedSet } from '../lib/session';
import { trackingOf } from '../db/repo';
import { compareSet, isDone } from '../lib/stats';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { Icon } from './Icon';

export type PrevLookup = (exerciseId: string) => { date: number; sets: SetRecord[] } | null;

type Col = 'weight' | 'reps' | 'time' | 'distance';

export function columnsFor(ex: Exercise | undefined, entry: PerformedEntry, format: PerformedBlock['format'], logAs?: PerformedBlock['logAs'], log?: PerformedBlock['log']): Col[] {
  if (log?.length) {
    // What the training block logs: weight with reps or time; with distance, the time and the distance.
    const d = log.includes('distance');
    const out: Col[] = [];
    if (!d) out.push('weight');
    if (log.includes('reps') && !d) out.push('reps');
    if (log.includes('time') || d) out.push('time');
    if (d) out.push('distance');
    return out;
  }
  // The block decides how its exercises are logged; older sessions fall back to the exercise.
  const tracking = logAs ?? trackingOf(ex);
  const planned = entry.planned;
  const cols: Col[] = [];
  const anyWeight = entry.sets.some((s) => s.weight) || !!planned?.targetWeight;
  const timeBased = tracking === 'weight_time' || tracking === 'time_distance' || format === 'tabata' || format === 'intervals' || format === 'timed_sets' || (!!planned?.durationSec && !planned?.reps);
  if (tracking !== 'time_distance' || anyWeight) cols.push('weight');
  if (!timeBased || planned?.reps || entry.sets.some((s) => s.reps)) cols.push('reps');
  if (timeBased || entry.sets.some((s) => s.durationSec)) cols.push('time');
  if (tracking === 'time_distance') cols.push('distance');
  return cols.length ? cols : ['reps'];
}

/** Accepts "90", "1:30" or "1:02:00" and returns seconds. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const parts = t.split(':').map((p) => Number(p.replace(',', '.')));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

function CellInput({ value, onCommit, label, mode, placeholder }: { value: string; onCommit: (t: string) => void; label: string; mode: 'decimal' | 'numeric' | 'text'; placeholder?: string }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode={mode === 'text' ? 'text' : mode}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== last.current) {
          last.current = text;
          onCommit(text);
        }
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const num = (t: string) => {
  const n = Number(t.replace(',', '.'));
  return t.trim() === '' || Number.isNaN(n) ? undefined : n;
};

export function SetLogger({
  entry,
  exercise,
  format,
  logAs,
  log,
  unit,
  prev,
  update,
}: {
  entry: PerformedEntry;
  exercise: Exercise | undefined;
  format: PerformedBlock['format'];
  logAs?: PerformedBlock['logAs'];
  log?: PerformedBlock['log'];
  unit: WeightUnit;
  prev: { date: number; sets: SetRecord[] } | null;
  /** Functional update applied to the latest stored entry, so quick taps never overwrite each other. */
  update: (fn: (e: PerformedEntry) => PerformedEntry) => void;
}) {
  const cols = columnsFor(exercise, entry, format, logAs, log);
  const setSet = (i: number, patch: Partial<SetRecord> | ((s: SetRecord) => Partial<SetRecord>)) =>
    update((e) => ({ ...e, sets: e.sets.map((s, k) => (k === i ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)) }));
  const grid = `34px ${cols.map(() => 'minmax(0,1fr)').join(' ')} 48px`;
  const name = exercise?.name ?? 'Unknown exercise';

  const addSet = () =>
    update((e) => {
      const last = e.sets[e.sets.length - 1];
      const base: SetRecord = last
        ? { ...last, completed: false, skipped: false, rpe: undefined }
        : e.planned
          ? plannedSet(e.planned, 1)
          : { exerciseId: e.exerciseId, setNumber: 1, completed: false };
      return { ...e, sets: [...e.sets, { ...base, setNumber: e.sets.length + 1 }] };
    });

  const prevText = prev?.sets
    .map((s) => (s.weight ? `${toDisplayWeight(s.weight, unit)}×${s.reps ?? '–'}` : s.durationSec && !s.reps ? formatClock(s.durationSec) : `${s.reps ?? 0}`))
    .join(', ');

  return (
    <div className="entry-row" style={{ background: 'transparent' }}>
      <div className="row between">
        <Link to={`/exercises/${entry.exerciseId}`} style={{ color: 'var(--text)', fontWeight: 650, minWidth: 0 }}>
          {name}
        </Link>
        {entry.planned?.grouping && entry.planned.grouping !== 'none' && (
          <span className="group-tag">{entry.planned.grouping === 'dropset' ? 'DROP SET' : `${entry.planned.grouping.toUpperCase()} ${entry.planned.groupLabel ?? ''}`}</span>
        )}
      </div>
      {entry.planned?.note && <div className="small" style={{ color: 'var(--accent)', marginTop: 2 }}>{entry.planned.note}</div>}
      <div className="small faint" style={{ marginTop: 2 }}>
        {prev ? (
          <>
            Last time ({formatShortDate(prev.date)}): <span className="num">{prevText}</span>
          </>
        ) : (
          'First time logging this exercise'
        )}
      </div>

      {entry.sets.length > 0 && (
        <div className="set-row" style={{ gridTemplateColumns: grid, marginTop: 6 }} aria-hidden>
          <span className="set-head">Set</span>
          {cols.map((c) => (
            <span key={c} className="set-head">
              {c === 'weight' ? unit : c === 'time' ? 'time' : c === 'distance' ? 'km' : 'reps'}
            </span>
          ))}
          <span className="set-head">Done</span>
        </div>
      )}

      {entry.sets.map((s, i) => {
        const p = prev?.sets[i];
        const cmp = isDone(s) ? compareSet(s, p) : null;
        return (
          <div key={i}>
            <div className={`set-row ${isDone(s) ? 'done' : ''} ${s.skipped ? 'skipped' : ''}`} style={{ gridTemplateColumns: grid }}>
              <button
                className="btn ghost small set-no"
                style={{ padding: 0, minHeight: 44 }}
                aria-label={`Set ${i + 1}: ${s.skipped ? 'unskip' : 'skip'}`}
                title={s.skipped ? 'Tap to unskip' : s.warmup ? 'Warm-up set · tap to skip' : 'Tap to skip this set'}
                onClick={() => setSet(i, (cur) => ({ skipped: !cur.skipped, completed: false }))}
              >
                {s.skipped ? '–' : s.warmup ? 'W' : i + 1}
              </button>
              {cols.map((c) =>
                c === 'weight' ? (
                  <CellInput key={c} label={`Set ${i + 1} weight (${unit})`} mode="decimal" value={s.weight !== undefined ? String(toDisplayWeight(s.weight, unit)) : ''} placeholder={p?.weight ? String(toDisplayWeight(p.weight, unit)) : ''} onCommit={(t) => setSet(i, { weight: fromDisplayWeight(num(t), unit) })} />
                ) : c === 'reps' ? (
                  <CellInput key={c} label={`Set ${i + 1} reps`} mode="numeric" value={s.reps !== undefined ? String(s.reps) : ''} placeholder={s.toFailure ? 'max' : p?.reps ? String(p.reps) : ''} onCommit={(t) => setSet(i, { reps: num(t) })} />
                ) : c === 'time' ? (
                  <CellInput key={c} label={`Set ${i + 1} time (seconds or m:ss)`} mode="text" value={s.durationSec !== undefined ? formatClock(s.durationSec) : ''} placeholder={p?.durationSec ? formatClock(p.durationSec) : 'm:ss'} onCommit={(t) => setSet(i, { durationSec: parseDuration(t) })} />
                ) : (
                  <CellInput key={c} label={`Set ${i + 1} distance (km)`} mode="decimal" value={s.distanceM !== undefined ? String(Math.round(s.distanceM) / 1000) : ''} onCommit={(t) => setSet(i, { distanceM: num(t) !== undefined ? num(t)! * 1000 : undefined })} />
                ),
              )}
              <button className="check-btn" aria-pressed={isDone(s)} aria-label={`Set ${i + 1} ${isDone(s) ? 'done' : 'not done'}`} onClick={() => setSet(i, (cur) => ({ completed: !cur.completed, skipped: false }))}>
                <Icon name="check" />
              </button>
            </div>
            {s.dropWeights && s.dropWeights.length > 0 && (
              <div className="small muted" style={{ paddingLeft: 40, marginTop: -2 }}>
                Drops:{' '}
                {s.dropWeights.map((w, d) => (
                  <span key={d} className="num" style={{ marginRight: 10 }}>
                    {toDisplayWeight(w, unit)}
                    {unit}×
                    <input
                      aria-label={`Set ${i + 1} drop ${d + 1} reps`}
                      inputMode="numeric"
                      style={{ width: 48, minHeight: 32, padding: '2px 4px', display: 'inline-block', textAlign: 'center' }}
                      value={s.dropReps?.[d] ?? ''}
                      onChange={(e) => {
                        const value = num(e.target.value) ?? 0;
                        setSet(i, (cur) => {
                          const reps = [...(cur.dropReps ?? [])];
                          reps[d] = value;
                          return { dropReps: reps };
                        });
                      }}
                    />
                  </span>
                ))}
              </div>
            )}
            {cmp === 'up' && (
              <div className="tiny" style={{ paddingLeft: 40, color: 'var(--good)' }}>
                ▲ Progress vs last time
              </div>
            )}
          </div>
        );
      })}
      <div className="row mt-s">
        <button className="btn small" onClick={addSet}>
          <Icon name="plus" /> Add set
        </button>
        {entry.sets.length > 0 && (
          <button className="btn small ghost" onClick={() => update((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
            Remove last
          </button>
        )}
      </div>
    </div>
  );
}
