import { useState } from 'react';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat, BlockParams, ExerciseEntry, Grouping, IntervalSegment, SetTarget, TimerOptions, WeightUnit } from '../db/types';
import { uid } from '../lib/ids';
import { defaultParams, FORMAT_INFO, FORMATS, GROUPING_LABEL, newEntry } from '../lib/program';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { ExercisePicker } from './ExercisePicker';
import { Icon } from './Icon';
import { NumberField } from './ui';

const CONDITIONING: BlockFormat[] = ['tabata', 'amrap', 'emom', 'for_time', 'intervals'];

export function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const profile = useProfile();
  const exercises = useExerciseMap();
  const [picking, setPicking] = useState<null | { replace?: string }>(null);
  const unit = profile.unit;

  const setParams = (patch: Partial<BlockParams>) => onChange({ ...block, params: { ...block.params, ...patch } });
  const setTimer = (patch: Partial<TimerOptions>) => onChange({ ...block, timer: { ...block.timer, ...patch } });
  const setEntry = (id: string, patch: Partial<ExerciseEntry>) =>
    onChange({ ...block, entries: block.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const moveEntry = (i: number, dir: -1 | 1) => {
    const entries = [...block.entries];
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j], entries[i]];
    onChange({ ...block, entries });
  };
  const changeFormat = (format: BlockFormat) => {
    const wasCond = CONDITIONING.includes(block.format);
    const isCond = CONDITIONING.includes(format);
    onChange({
      ...block,
      format,
      params: defaultParams(format),
      entries: block.entries.map((e): ExerciseEntry => {
        const fresh = newEntry(e.exerciseId, format, profile.defaultRestSec);
        // Keep sets/rest when moving between similar formats; otherwise start from the new format's defaults.
        const base = wasCond === isCond ? e : { ...fresh, id: e.id, reps: e.reps ?? fresh.reps, targetWeight: e.targetWeight };
        if (format === 'timed_sets') return { ...base, durationSec: base.durationSec ?? 30 };
        return isCond ? { ...base, grouping: 'none', groupLabel: undefined, drops: undefined, dropPercent: undefined } : base;
      }),
    });
  };

  const p = block.params;
  const conditioning = CONDITIONING.includes(block.format);

  return (
    <div className="stack">
      <div className="form-grid">
        <label className="field">
          Format
          <select value={block.format} onChange={(e) => changeFormat(e.target.value as BlockFormat)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_INFO[f].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Name
          <input value={block.name ?? ''} placeholder={FORMAT_INFO[block.format].label} onChange={(e) => onChange({ ...block, name: e.target.value || undefined })} />
        </label>
        <p className="full small faint" style={{ margin: 0 }}>
          {FORMAT_INFO[block.format].description}
        </p>

        {block.format === 'tabata' && (
          <>
            <NumberField label="Rounds" value={p.rounds} onChange={(v) => setParams({ rounds: v })} stepper inputMode="numeric" />
            <NumberField label="Work" suffix="s" value={p.workSec} onChange={(v) => setParams({ workSec: v })} stepper step={5} inputMode="numeric" />
            <NumberField label="Rest" suffix="s" value={p.restSec} onChange={(v) => setParams({ restSec: v })} stepper step={5} inputMode="numeric" />
            <NumberField label="Extra sets" value={p.extraSets} onChange={(v) => setParams({ extraSets: v })} stepper inputMode="numeric" />
            {(p.extraSets ?? 0) > 0 && (
              <NumberField label="Rest between sets" suffix="s" value={p.restBetweenSetsSec} onChange={(v) => setParams({ restBetweenSetsSec: v })} stepper step={15} inputMode="numeric" />
            )}
          </>
        )}
        {block.format === 'amrap' && <NumberField label="Time cap" suffix="min" value={p.timeCapMin} onChange={(v) => setParams({ timeCapMin: v })} stepper />}
        {block.format === 'emom' && (
          <>
            <NumberField label="Total time" suffix="min" value={p.totalMin} onChange={(v) => setParams({ totalMin: v })} stepper />
            <NumberField label="Interval" suffix="s" value={p.intervalSec} onChange={(v) => setParams({ intervalSec: v })} stepper step={15} inputMode="numeric" />
          </>
        )}
        {block.format === 'for_time' && (
          <>
            <NumberField label="Target rounds" value={p.targetRounds} onChange={(v) => setParams({ targetRounds: v })} stepper inputMode="numeric" />
            <NumberField label="or target reps" value={p.targetReps} onChange={(v) => setParams({ targetReps: v })} inputMode="numeric" />
            <NumberField label="Time cap" suffix="min, optional" value={p.timeCapMin} onChange={(v) => setParams({ timeCapMin: v })} />
            <NumberField
              label="Signal every"
              suffix="min, optional"
              value={p.signalEverySec ? p.signalEverySec / 60 : undefined}
              onChange={(v) => setParams({ signalEverySec: v ? Math.round(v * 60) : undefined })}
            />
          </>
        )}
      </div>

      {block.format === 'intervals' && <SegmentsEditor params={p} onChange={setParams} />}

      <div>
        <h3 className="mb" style={{ marginBottom: 8 }}>
          Exercises
        </h3>
        {block.entries.length === 0 && (
          <p className="small muted">
            {block.format === 'intervals' ? 'Optional: add exercises to label the work segments.' : 'No exercises yet.'}
          </p>
        )}
        {block.entries.map((e, i) => {
          const ex = exercises.get(e.exerciseId);
          return (
            <div key={e.id} className="entry-row">
              <div className="row">
                {e.grouping !== 'none' && (
                  <span className="group-tag">
                    {e.grouping === 'dropset' ? 'DROP' : `${e.grouping === 'superset' ? 'SS' : 'C'} ${e.groupLabel ?? ''}`}
                  </span>
                )}
                <button
                  type="button"
                  className="btn ghost small"
                  style={{ justifyContent: 'flex-start', padding: 0, flex: 1, minWidth: 0, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.25 }}
                  aria-label={`Change exercise ${ex?.name ?? ''}`}
                  onClick={() => setPicking({ replace: e.id })}
                >
                  <span style={{ fontWeight: 650 }}>
                    {ex?.name ?? 'Unknown exercise'}
                  </span>
                </button>
                <button type="button" className="btn icon small ghost" aria-label="Move up" onClick={() => moveEntry(i, -1)} disabled={i === 0}>
                  <Icon name="up" />
                </button>
                <button type="button" className="btn icon small ghost" aria-label="Move down" onClick={() => moveEntry(i, 1)} disabled={i === block.entries.length - 1}>
                  <Icon name="down" />
                </button>
                <button type="button" className="btn icon small ghost" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={() => onChange({ ...block, entries: block.entries.filter((x) => x.id !== e.id) })}>
                  <Icon name="trash" />
                </button>
              </div>
              <div className="form-grid four mt-s">
                {!conditioning && <NumberField label="Sets" value={e.sets} onChange={(v) => setEntry(e.id, { sets: Math.max(1, v ?? 1) })} inputMode="numeric" />}
                {block.format === 'timed_sets' ? (
                  <NumberField label="Duration" suffix="s" value={e.durationSec} onChange={(v) => setEntry(e.id, { durationSec: v })} inputMode="numeric" />
                ) : (
                  <NumberField label={conditioning ? 'Reps per round' : 'Reps'} value={e.reps} onChange={(v) => setEntry(e.id, { reps: v })} inputMode="numeric" />
                )}
                <NumberField
                  label="Weight"
                  suffix={unit}
                  value={toDisplayWeight(e.targetWeight, unit)}
                  onChange={(v) => setEntry(e.id, { targetWeight: fromDisplayWeight(v, unit) })}
                />
                {!conditioning && <NumberField label="Rest" suffix="s" value={e.restSec} onChange={(v) => setEntry(e.id, { restSec: v ?? 0 })} inputMode="numeric" />}
                {conditioning && block.format !== 'tabata' && (
                  <NumberField label="or time" suffix="s" value={e.durationSec} onChange={(v) => setEntry(e.id, { durationSec: v })} inputMode="numeric" />
                )}
              </div>
              <label className="field mt-s">
                <span>
                  Note <span className="faint">(optional, e.g. “18% incline · 4 km/h”)</span>
                </span>
                <input value={e.note ?? ''} onChange={(ev) => setEntry(e.id, { note: ev.target.value || undefined })} />
              </label>
              {(block.format === 'sets_reps' || block.format === 'timed_sets' || block.format === 'emom') && (
                <SetTargetsEditor entry={e} unit={unit} perInterval={block.format === 'emom'} onChange={(patch) => setEntry(e.id, patch)} />
              )}
              {!conditioning && (
                <div className="form-grid four mt-s">
                  <label className="field">
                    Grouping
                    <select
                      value={e.grouping}
                      onChange={(ev) => {
                        const grouping = ev.target.value as Grouping;
                        setEntry(e.id, {
                          grouping,
                          groupLabel: grouping === 'superset' || grouping === 'circuit' ? e.groupLabel ?? 'A' : undefined,
                          drops: grouping === 'dropset' ? e.drops ?? 2 : undefined,
                          dropPercent: grouping === 'dropset' ? e.dropPercent ?? 20 : undefined,
                        });
                      }}
                    >
                      {(Object.keys(GROUPING_LABEL) as Grouping[]).map((g) => (
                        <option key={g} value={g}>
                          {GROUPING_LABEL[g]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(e.grouping === 'superset' || e.grouping === 'circuit') && (
                    <label className="field">
                      Group
                      <select value={e.groupLabel ?? 'A'} onChange={(ev) => setEntry(e.id, { groupLabel: ev.target.value })}>
                        {['A', 'B', 'C', 'D', 'E', 'F'].map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {e.grouping === 'dropset' && (
                    <>
                      <NumberField label="Drops" value={e.drops} onChange={(v) => setEntry(e.id, { drops: v })} inputMode="numeric" />
                      <NumberField label="Drop by" suffix="%" value={e.dropPercent} onChange={(v) => setEntry(e.id, { dropPercent: v })} inputMode="numeric" />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!conditioning && block.entries.some((e) => e.grouping === 'superset' || e.grouping === 'circuit') && (
          <p className="tiny faint mt-s">
            Superset: exercises in the same group run back to back, then the rest of the last exercise. Circuit: the group repeats for the number of sets, using each exercise’s rest as transition.
          </p>
        )}
        <button type="button" className="btn block mt-s" onClick={() => setPicking({})}>
          <Icon name="plus" /> Add exercise
        </button>
      </div>

      <details>
        <summary className="small muted" style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
          Timer options
        </summary>
        <div className="form-grid mt-s">
          <NumberField label="Get ready" suffix="s" value={block.timer.prepSec} onChange={(v) => setTimer({ prepSec: v ?? 0 })} inputMode="numeric" />
          <span />
          <label className="field">
            Work label
            <input value={block.timer.workLabel} onChange={(e) => setTimer({ workLabel: e.target.value })} />
          </label>
          <label className="field">
            Rest label
            <input value={block.timer.restLabel} onChange={(e) => setTimer({ restLabel: e.target.value })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={block.timer.sound} onChange={(e) => setTimer({ sound: e.target.checked })} /> Sound
          </label>
          <label className="check-row">
            <input type="checkbox" checked={block.timer.vibrate} onChange={(e) => setTimer({ vibrate: e.target.checked })} /> Vibrate
          </label>
        </div>
      </details>

      <label className="check-row">
        <input type="checkbox" checked={!!block.optional} onChange={(e) => onChange({ ...block, optional: e.target.checked || undefined })} />
        Optional block (do it only when there is time)
      </label>
      <label className="field">
        Note
        <input value={block.note ?? ''} placeholder="Optional" onChange={(e) => onChange({ ...block, note: e.target.value || undefined })} />
      </label>

      <ExercisePicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onPick={(exerciseId) => {
          if (picking?.replace) setEntry(picking.replace, { exerciseId });
          else onChange({ ...block, entries: [...block.entries, newEntry(exerciseId, block.format, profile.defaultRestSec)] });
        }}
      />
    </div>
  );
}

function SegmentsEditor({ params, onChange }: { params: BlockParams; onChange: (p: Partial<BlockParams>) => void }) {
  const segs = params.segments ?? [];
  const set = (id: string, patch: Partial<IntervalSegment>) => onChange({ segments: segs.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>Segments</h3>
      {segs.map((s, i) => (
        <div key={s.id} className="entry-row">
          <div className="form-grid four">
            <label className="field">
              Label
              <input value={s.label} onChange={(e) => set(s.id, { label: e.target.value })} />
            </label>
            <label className="field">
              Type
              <select value={s.kind} onChange={(e) => set(s.id, { kind: e.target.value as 'work' | 'rest' })}>
                <option value="work">Work</option>
                <option value="rest">Rest</option>
              </select>
            </label>
            <NumberField label="Duration" suffix="s" value={s.durationSec} onChange={(v) => set(s.id, { durationSec: v ?? 0 })} inputMode="numeric" />
            <div className="row">
              <label className="check-row">
                <input type="checkbox" checked={s.sound !== false} onChange={(e) => set(s.id, { sound: e.target.checked })} /> Sound
              </label>
              <span className="spacer" />
              <button type="button" className="btn icon small ghost" aria-label={`Remove segment ${i + 1}`} onClick={() => onChange({ segments: segs.filter((x) => x.id !== s.id) })}>
                <Icon name="trash" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <div className="row mt-s">
        <button
          type="button"
          className="btn small"
          onClick={() => onChange({ segments: [...segs, { id: uid(), label: segs.length % 2 ? 'Work' : 'Rest', kind: segs.length % 2 ? 'work' : 'rest', durationSec: 30, sound: true }] })}
        >
          <Icon name="plus" /> Segment
        </button>
        <span className="spacer" />
        <div style={{ width: 150 }}>
          <NumberField label="Repeat" value={params.repeats} onChange={(v) => onChange({ repeats: v ?? 1 })} stepper inputMode="numeric" hideLabel />
        </div>
        <span className="small muted">times</span>
      </div>
    </div>
  );
}

/** Per-set targets: warm-up sets, pyramids, a last set to failure, or per-interval targets in EMOM. */
function SetTargetsEditor({ entry, unit, perInterval, onChange }: { entry: ExerciseEntry; unit: WeightUnit; perInterval: boolean; onChange: (p: Partial<ExerciseEntry>) => void }) {
  const on = !!entry.setTargets?.length;
  const rows = entry.setTargets ?? [];
  const word = perInterval ? 'interval' : 'set';
  const set = (i: number, patch: Partial<SetTarget>) => onChange({ setTargets: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const toggle = (checked: boolean) => {
    if (!checked) return onChange({ setTargets: undefined });
    const n = perInterval ? 4 : Math.max(1, entry.sets);
    onChange({ setTargets: Array.from({ length: n }, () => ({ reps: entry.reps, weight: entry.targetWeight, durationSec: entry.durationSec })), sets: perInterval ? entry.sets : n });
  };
  return (
    <div className="mt-s">
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        Different targets per {word} (warm-up, pyramid, last {word} to failure…)
      </label>
      {on && (
        <div className="stack" style={{ marginTop: 4 }}>
          {rows.map((r, i) => (
            <div key={i} className="row wrap" style={{ gap: 6, alignItems: 'flex-end' }}>
              <span className="small muted" style={{ width: 56 }}>
                {perInterval ? 'Int.' : 'Set'} {i + 1}
              </span>
              <div style={{ width: 80 }}>
                <NumberField label={r.toFailure ? 'Min reps' : 'Reps'} value={r.reps} onChange={(v) => set(i, { reps: v })} inputMode="numeric" />
              </div>
              <div style={{ width: 90 }}>
                <NumberField label={`Weight (${unit})`} value={toDisplayWeight(r.weight, unit)} onChange={(v) => set(i, { weight: fromDisplayWeight(v, unit) })} />
              </div>
              <label className="check-row small" style={{ minHeight: 40 }}>
                <input type="checkbox" checked={!!r.warmup} onChange={(e) => set(i, { warmup: e.target.checked || undefined })} /> Warm-up
              </label>
              <label className="check-row small" style={{ minHeight: 40 }}>
                <input type="checkbox" checked={!!r.toFailure} onChange={(e) => set(i, { toFailure: e.target.checked || undefined })} /> Max reps
              </label>
              <button type="button" className="btn icon small ghost" aria-label={`Remove ${word} ${i + 1}`} onClick={() => onChange({ setTargets: rows.filter((_, k) => k !== i), ...(perInterval ? {} : { sets: Math.max(1, rows.length - 1) }) })}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => onChange({ setTargets: [...rows, { ...rows[rows.length - 1] }], ...(perInterval ? {} : { sets: rows.length + 1 }) })}>
            <Icon name="plus" /> Add {word}
          </button>
        </div>
      )}
    </div>
  );
}
