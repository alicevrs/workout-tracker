import type { Block, Exercise, ExerciseEntry, SetTarget, WeightUnit } from '../db/types';
import { blockLog, logMode } from '../lib/blockTemplates';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { NumberField } from './ui';

/**
 * Changing a part during a workout: only the values the training block already set and that do
 * not change its structure (reps, weight; distance, incline, speed). Exercises, format, name and
 * per-set targets cannot be added or removed here; per-set targets are editable only when the
 * block already had them.
 */
export function SessionPlanEditor({
  block,
  exercises,
  unit,
  onChange,
}: {
  block: Block;
  exercises: Map<string, Exercise>;
  unit: WeightUnit;
  onChange: (b: Block) => void;
}) {
  const log = blockLog(block, exercises);
  const mode = logMode(log);
  const distance = log.includes('distance');
  const showReps = !distance && (mode === 'R' || mode === 'RT' || mode === 'T');
  const setEntry = (id: string, patch: Partial<ExerciseEntry>) => onChange({ ...block, entries: block.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const setRow = (e: ExerciseEntry, i: number, patch: Partial<SetTarget>) =>
    setEntry(e.id, { setTargets: (e.setTargets ?? []).map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const step = unit === 'kg' ? 2.5 : 5;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {block.entries.map((e) => (
        <div key={e.id} className="target-row">
          <div className="target-name">{exercises.get(e.exerciseId)?.name ?? 'Exercise'}</div>
          {e.setTargets?.length ? (
            // The block has a target per set: change each one.
            <div className="stack" style={{ gap: 6 }}>
              {e.setTargets.map((r, i) => (
                <div key={i} className="form-grid">
                  <NumberField label={`${block.format === 'emom' ? 'Interval' : 'Set'} ${i + 1} · reps`} placeholder="none" value={r.reps} onChange={(v) => setRow(e, i, { reps: v })} inputMode="numeric" stepper />
                  <NumberField
                    label={`Weight (${unit})`}
                    placeholder="none"
                    value={toDisplayWeight(r.weight, unit)}
                    onChange={(v) => setRow(e, i, { weight: fromDisplayWeight(v, unit) })}
                    stepper
                    step={step}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="form-grid">
              {showReps && <NumberField label="Reps" placeholder="none" value={e.reps} onChange={(v) => setEntry(e.id, { reps: v })} inputMode="numeric" stepper />}
              {!distance && (
                <NumberField
                  label={`Weight (${unit})`}
                  placeholder="none"
                  value={toDisplayWeight(e.targetWeight, unit)}
                  onChange={(v) => setEntry(e.id, { targetWeight: fromDisplayWeight(v, unit) })}
                  stepper
                  step={step}
                />
              )}
              {distance && (mode === 'D' || mode === 'DR') && (
                <NumberField label="Distance (km)" placeholder="none" value={e.distanceKm} onChange={(v) => setEntry(e.id, { distanceKm: v })} stepper step={0.5} />
              )}
              {distance && <NumberField label="Incline (%)" placeholder="none" value={e.incline} onChange={(v) => setEntry(e.id, { incline: v })} stepper step={0.5} />}
              {distance && <NumberField label="Speed (km/h)" placeholder="none" value={e.speedKmh} onChange={(v) => setEntry(e.id, { speedKmh: v })} stepper step={0.5} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
