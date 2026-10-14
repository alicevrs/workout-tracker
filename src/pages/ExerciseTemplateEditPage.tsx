import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BlockEditor, SetTargetsEditor } from '../components/BlockEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { Line, Pick, TimerFields, mins, secs } from '../components/TimerFields';
import { EmptyState, NumberField, PageHeader, Segmented, useToast } from '../components/ui';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat, BlockTemplate, ExerciseEntry } from '../db/types';
import { useDragReorder } from '../hooks/useDragReorder';
import {
  addExercise,
  countByOf,
  duplicateTemplate,
  hasStructure,
  isAdvanced,
  NEW_BLOCK_NAME,
  OLD_BLOCK_NAME,
  paramsFromQuick,
  quickFromParams,
  restOf,
  setsOf,
  structureOf,
  syncTemplate,
  TIME_FORMATS,
  unlinkTemplate,
  withFormat,
  withSetsRest,
  withStructure,
  type Structure,
} from '../lib/blockTemplates';
import { formatDuration } from '../lib/dates';
import { estimateBlockSeconds } from '../lib/program';
import { describeQuick, QUICK_LABEL, REST_OPTIONS, SET_OPTIONS } from '../lib/timer/quick';
import { withTimer } from '../lib/timerTemplates';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';

const STRUCTURE_HINT: Record<Structure, string> = {
  sequence: 'All sets of the first exercise, then all sets of the next.',
  alternate: 'One set of each exercise in turn, then rest.',
  circuit: 'Go through all exercises one after the other, rest, and repeat for each round.',
};
const TIME_LABEL: Partial<Record<BlockFormat, string>> = { timed_sets: 'Timed sets', tabata: 'Tabata', amrap: 'AMRAP', emom: 'EMOM', for_time: 'For Time' };

/** The block without its link to a saved timer (its times become its own). */
function unlinkTimer(b: Block): Block {
  const next = { ...b };
  delete next.timerId;
  return next;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="step">
      <h2 className="step-title">
        <span className="step-n">{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** Create or edit an training block, step by step. Saved automatically; linked workouts follow. */
export default function ExerciseTemplateEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const back = params.get('from') || '/workouts/blocks';
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const unit = profile.unit;
  const [tpl, setTpl] = useState<BlockTemplate | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<BlockTemplate | null>(null);
  const tplRef = useRef<BlockTemplate | null | undefined>(tpl);
  tplRef.current = tpl;
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useLiveQuery(() => db.timerTemplates.orderBy('name').toArray(), []) ?? [];

  useEffect(() => {
    db.blockTemplates.get(id).then((t) => setTpl(t ?? null));
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      const t = pending.current;
      pending.current = null;
      await db.blockTemplates.put(t);
      await syncTemplate(db, t); // linked workout parts follow
    }
  }, []);
  useEffect(() => () => void flush(), [flush]);

  const update = (patch: Partial<BlockTemplate>) => {
    const cur = tplRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    tplRef.current = next;
    setTpl(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };
  const setBlock = (block: Block) => update({ block });

  const moveEntry = (from: number, to: number) => {
    const cur = tplRef.current;
    if (!cur) return;
    const entries = [...cur.block.entries];
    [entries[from], entries[to]] = [entries[to], entries[from]];
    setBlock(withSetsRest({ ...cur.block, entries }, setsOf(cur.block), restOf(cur.block)));
  };
  const { drag, handle, rowStyle } = useDragReorder(listRef, tpl?.block.entries.length ?? 0, moveEntry);

  if (tpl === undefined) return <div className="page" />;
  if (tpl === null)
    return (
      <div className="page">
        <PageHeader title="Training block" back={back} />
        <EmptyState title="Training block not found" />
      </div>
    );

  const b = tpl.block;
  const linkedTimer = b.timerId ? timers.find((t) => t.id === b.timerId) : undefined;
  const countBy = countByOf(b);
  const structured = hasStructure(b.format);
  const total = estimateBlockSeconds(b);
  const autoName = (block: Block) => block.entries.map((e) => exercises.get(e.exerciseId)?.name ?? '').filter(Boolean).join(' / ');
  const nameIsAuto = tpl.name === NEW_BLOCK_NAME || tpl.name === OLD_BLOCK_NAME || tpl.name === autoName(b);
  const setEntry = (entryId: string, patch: Partial<ExerciseEntry>) => setBlock({ ...b, entries: b.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) });
  const changeEntries = (block: Block) => update({ block, ...(nameIsAuto ? { name: autoName(block) || NEW_BLOCK_NAME } : {}) });

  return (
    <div className="page">
      <PageHeader
        title={tpl.name || 'Training block'}
        back={back}
        subtitle={total ? `≈ ${formatDuration(total)}` : undefined}
        actions={
          <InfoButton title="Training blocks">
            <p style={{ margin: 0 }}>A block is a ready-made piece of a workout. Build it in order:</p>
            <p style={{ margin: 0 }}>
              <strong>1.</strong> pick the exercises from the catalogue; <strong>2.</strong> with more than one, choose how they are combined; <strong>3.</strong> count by reps
              (sets, reps, rest) or by time with one of the timers; <strong>4.</strong> add reps and weights; then notes if you like.
            </p>
            <p style={{ margin: 0 }}>Workouts that use this block follow every change from their next session. Workouts already done stay as they were.</p>
          </InfoButton>
        }
      />
      <div className="stack">
        <label className="field">
          Name
          <input value={tpl.name} onChange={(e) => update({ name: e.target.value })} />
        </label>

        <Step n={1} title="Exercises">
          <div className="entry-list" ref={listRef}>
            {b.entries.map((e, i) => (
              <div key={e.id} data-drag-index={i} className={`pick-row${drag?.index === i ? ' dragging' : ''}`} style={rowStyle(i)} {...handle(i)}>
                <span className="grow">{exercises.get(e.exerciseId)?.name ?? 'Unknown exercise'}</span>
                <button
                  className="btn icon small ghost"
                  aria-label="Remove exercise"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => changeEntries(withSetsRest({ ...b, entries: b.entries.filter((x) => x.id !== e.id) }, setsOf(b), restOf(b)))}
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
          {b.entries.length > 1 && <p className="tiny faint" style={{ margin: '6px 0 0' }}>Hold and drag to change the order.</p>}
          <button className="btn block mt-s" onClick={() => setPicking(true)}>
            <Icon name="plus" /> Add exercise
          </button>
        </Step>

        {b.entries.length > 1 && (
          <Step n={2} title="How they are combined">
            {structured ? (
              <>
                <Segmented<Structure>
                  label="How the exercises are combined"
                  value={structureOf(b)}
                  onChange={(s) => setBlock(withStructure(b, s))}
                  options={[
                    { value: 'sequence', label: 'In sequence' },
                    { value: 'alternate', label: 'Alternating' },
                    { value: 'circuit', label: 'Circuit' },
                  ]}
                />
                <p className="small muted" style={{ margin: '8px 0 0' }}>
                  {STRUCTURE_HINT[structureOf(b)]}
                </p>
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                With {TIME_LABEL[b.format]} the exercises take turns automatically, one per {b.format === 'emom' ? 'interval' : 'round'}.
              </p>
            )}
          </Step>
        )}

        <Step n={b.entries.length > 1 ? 3 : 2} title="Count by">
          <Segmented<'reps' | 'time'>
            label="Count by"
            value={countBy}
            onChange={(c) => setBlock(unlinkTimer(withFormat(b, c === 'reps' ? 'sets_reps' : 'tabata')))}
            options={[
              { value: 'reps', label: 'Reps' },
              { value: 'time', label: 'Time' },
            ]}
          />
          {countBy === 'time' && (
            <label className="field mt-s">
              Saved timer
              <select
                value={linkedTimer?.id ?? ''}
                onChange={(e) => {
                  const t = timers.find((x) => x.id === e.target.value);
                  setBlock(t ? withTimer(b, t) : unlinkTimer(b));
                }}
              >
                <option value="">Set the timer here</option>
                {timers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {countBy === 'time' && !timers.length && <p className="tiny faint" style={{ margin: '6px 0 0' }}>Timers saved in Workouts → Timers appear here.</p>}
          {countBy === 'time' && !linkedTimer && (
            <div className="scroll-x mt-s" role="group" aria-label="Timer">
              {TIME_FORMATS.filter((f) => f !== 'timed_sets' || b.format === 'timed_sets').map((f) => (
                <button key={f} className="chip" aria-pressed={b.format === f} onClick={() => setBlock(withFormat(b, f))}>
                  {TIME_LABEL[f]}
                </button>
              ))}
            </div>
          )}
          <div className="mt">
            {linkedTimer ? (
              <div className="linked-timer">
                <p className="small" style={{ margin: 0 }}>
                  <strong>{QUICK_LABEL[linkedTimer.timer.kind]}</strong> · {describeQuick(linkedTimer.timer)}
                </p>
                <p className="tiny faint" style={{ margin: '4px 0 8px' }}>
                  Changes to this timer update the block.
                </p>
                <Link className="btn small" to={`/workouts/timers/${linkedTimer.id}?from=${encodeURIComponent(`/workouts/blocks/${tpl.id}`)}`}>
                  Open timer
                </Link>
              </div>
            ) : structured ? (
              <div className="sentences compact-sentences">
                <Line>
                  <Pick small value={setsOf(b)} options={SET_OPTIONS} format={mins} onChange={(v) => setBlock(withSetsRest(b, v, restOf(b)))} label="Sets" />
                  <span>{structureOf(b) === 'sequence' || b.entries.length < 2 ? 'sets' : 'rounds'}</span>
                </Line>
                <Line>
                  <Pick small value={restOf(b)} options={REST_OPTIONS} format={secs} onChange={(v) => setBlock(withSetsRest(b, setsOf(b), v))} label="Rest" />
                  <span>rest</span>
                </Line>
              </div>
            ) : (
              <TimerFields compact noSets q={quickFromParams(b.format, b.params)} onChange={(q) => setBlock({ ...b, params: paramsFromQuick(q, b.params) })} />
            )}
          </div>
        </Step>

        {b.entries.length > 0 && (
          <Step n={b.entries.length > 1 ? 4 : 3} title={b.format === 'tabata' ? 'Weight' : b.format === 'timed_sets' ? 'Time and weight' : 'Reps and weight'}>
            <div className="stack" style={{ gap: 10 }}>
              {b.entries.map((e) => (
                <div key={e.id} className="target-row">
                  <div className="target-name">{exercises.get(e.exerciseId)?.name ?? 'Exercise'}</div>
                  <div className="form-grid">
                    {b.format === 'timed_sets' ? (
                      <NumberField label="Time (s)" value={e.durationSec} onChange={(v) => setEntry(e.id, { durationSec: v })} inputMode="numeric" stepper step={5} />
                    ) : b.format !== 'tabata' ? (
                      <NumberField
                        label={b.format === 'sets_reps' ? 'Reps' : b.format === 'emom' ? 'Reps per interval' : 'Reps per round'}
                        value={e.reps}
                        onChange={(v) => setEntry(e.id, { reps: v })}
                        inputMode="numeric"
                        stepper
                      />
                    ) : null}
                    <NumberField
                      label={`Weight (${unit})`}
                      placeholder="none"
                      value={toDisplayWeight(e.targetWeight, unit)}
                      onChange={(v) => setEntry(e.id, { targetWeight: fromDisplayWeight(v, unit) })}
                      stepper
                      step={unit === 'kg' ? 2.5 : 5}
                    />
                  </div>
                  {(b.format === 'sets_reps' || b.format === 'timed_sets' || b.format === 'emom') && (
                    <SetTargetsEditor entry={e} unit={unit} perInterval={b.format === 'emom'} onChange={(patch) => setEntry(e.id, patch)} />
                  )}
                </div>
              ))}
            </div>
          </Step>
        )}

        <label className="field">
          Notes
          <textarea value={b.note ?? ''} placeholder="Optional" onChange={(e) => setBlock({ ...b, note: e.target.value || undefined })} />
        </label>

        <details className="advanced" open={isAdvanced(b)}>
          <summary>Advanced settings</summary>
          {isAdvanced(b) && <p className="small muted">This block uses settings the simple form above cannot show. Edit them here.</p>}
          <BlockEditor
            hideName
            hideOptional
            block={b}
            onChange={(next) => setBlock(next.format !== b.format || JSON.stringify(next.params) !== JSON.stringify(b.params) ? unlinkTimer(next) : next)}
          />
        </details>

        <div className="big-buttons" style={{ paddingTop: 0 }}>
          <button
            className="btn small"
            onClick={async () => {
              await flush();
              const copy = duplicateTemplate(tpl);
              await db.blockTemplates.add(copy);
              toast('Training block duplicated');
              navigate(`/workouts/blocks/${copy.id}`);
            }}
          >
            <Icon name="copy" /> Duplicate
          </button>
          <button
            className="btn ghost small"
            onClick={async () => {
              if (!confirm(`Delete “${tpl.name}”? Workouts that use it keep their current version.`)) return;
              pending.current = null;
              await unlinkTemplate(db, tpl.id);
              await db.blockTemplates.delete(tpl.id);
              navigate(back);
            }}
          >
            <Icon name="trash" /> Delete block
          </button>
        </div>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          const cur = tplRef.current;
          if (cur) changeEntries(addExercise(cur.block, exerciseId, profile.defaultRestSec));
        }}
      />
    </div>
  );
}
