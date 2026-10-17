import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SetTargetsEditor } from '../components/BlockEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { ClockPick, Line, Pick, TimerFields, mins } from '../components/TimerFields';
import { EmptyState, NumberField, PageHeader, Segmented, useToast } from '../components/ui';
import { getDraft, setDraft, useDraft, withDraftParam } from '../lib/drafts';
import { db } from '../db/db';
import { trackingOf, useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat, BlockTemplate, ExerciseEntry, Program } from '../db/types';
import { useDragReorder } from '../hooks/useDragReorder';
import {
  addExercise,
  blockKind,
  countByOf,
  exerciseCountBy,
  hasStructure,
  linkedBlock,
  NEW_BLOCK_NAME,
  OLD_BLOCK_NAME,
  paramsFromQuick,
  quickFromParams,
  restOf,
  setsOf,
  structureOf,
  syncTemplate,
  TIME_FORMATS,
  withFormat,
  withSetsRest,
  withStructure,
  type CountBy,
  type Structure,
} from '../lib/blockTemplates';
import { formatDuration } from '../lib/dates';
import { estimateBlockSeconds } from '../lib/program';
import { SET_OPTIONS } from '../lib/timer/quick';
import { withTimer } from '../lib/timerTemplates';
import { workoutDay } from '../lib/workouts';
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

/** A resumed draft takes the current settings of its saved timer (it may have been changed meanwhile). */
async function refreshTimer(t: BlockTemplate): Promise<BlockTemplate> {
  if (!t.block.timerId) return t;
  const timer = await db.timerTemplates.get(t.block.timerId);
  return { ...t, block: timer ? withTimer(t.block, timer) : unlinkTimer(t.block) };
}

/** Create or edit a training block, step by step. Nothing is stored until Save; linked workouts follow on save. */
export default function ExerciseTemplateEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const back = params.get('from') || '/workouts/blocks';
  /** Workout that asked for this new block: it gets the block when it is saved. */
  const addTo = params.get('addTo');
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const unit = profile.unit;
  const { item: tpl, setItem, current, dirty, markSaved } = useDraft<BlockTemplate>(`block:${id}`, () => db.blockTemplates.get(id), refreshTimer);
  const [picking, setPicking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useLiveQuery(() => db.timerTemplates.orderBy('name').toArray(), []) ?? [];

  /** This page, to come back to with the unsaved changes kept. */
  const selfUrl = encodeURIComponent(withDraftParam(location.pathname + location.search));
  const update = (patch: Partial<BlockTemplate>) => {
    const cur = current();
    if (cur) setItem({ ...cur, ...patch });
  };
  const setBlock = (block: Block) => update({ block });

  const save = async () => {
    const cur = current();
    if (!cur) return;
    const next = { ...cur, name: cur.name.trim() || NEW_BLOCK_NAME, updatedAt: Date.now() };
    await db.blockTemplates.put(next);
    await syncTemplate(db, next); // linked workout parts follow
    markSaved(next);
    if (addTo) {
      // Add the new block to the workout being edited (still unsaved there).
      const key = `workout:${addTo}`;
      const w = getDraft<Program>(key);
      if (w) {
        const day = workoutDay(w.item);
        if (!day.blocks.some((b) => b.templateId === next.id))
          setDraft(key, { ...w.item, days: [{ ...day, blocks: [...day.blocks, linkedBlock(next)] }] }, w.isNew);
      }
      navigate(back);
      return;
    }
    toast('Training block saved');
  };

  const moveEntry = (from: number, to: number) => {
    const cur = current();
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
  // How the block is counted follows its exercises (Logged as): reps, or time with a timer.
  const kind = blockKind(b, exercises);
  const countBy = countByOf(b);
  // Reps exercises: sets and rest set here, or a saved timer (which then sets the number of sets).
  // Timed exercises: always a timer. Older blocks that break this show a notice with a fix.
  const mismatch = kind === 'time' ? countBy === 'reps' : kind === 'reps' && countBy === 'time' && !linkedTimer;
  const structured = hasStructure(b.format);
  const total = estimateBlockSeconds(b);
  const autoName = (block: Block) => block.entries.map((e) => exercises.get(e.exerciseId)?.name ?? '').filter(Boolean).join(' / ');
  const nameIsAuto = tpl.name === NEW_BLOCK_NAME || tpl.name === OLD_BLOCK_NAME || tpl.name === autoName(b);
  /** Time × distance exercise: targets are incline and speed instead of weight and reps. */
  const distanceEx = (e: ExerciseEntry) => trackingOf(exercises.get(e.exerciseId)) === 'time_distance';
  /** Targets set per set / interval: the exercise's own reps and weight are not used. */
  const perSet = (e: ExerciseEntry) => !!e.setTargets?.length;
  /** EMOM: intervals that go to the i-th exercise (they take turns). */
  const intervalsFor = (i: number) => {
    if (b.format !== 'emom') return undefined;
    const total = Math.floor(Math.round((b.params.totalMin ?? 10) * 60) / Math.max(5, b.params.intervalSec ?? 60));
    return Math.max(1, Math.floor((total - i - 1) / Math.max(1, b.entries.length)) + 1);
  };
  const setEntry = (entryId: string, patch: Partial<ExerciseEntry>) => setBlock({ ...b, entries: b.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) });
  const changeEntries = (block: Block) => update({ block, ...(nameIsAuto ? { name: autoName(block) || NEW_BLOCK_NAME } : {}) });
  /** Count the block the way its exercises are logged: sets × reps, or a timer (Tabata unless one is set). */
  const countAs = (block: Block, k: CountBy): Block =>
    k === 'reps' ? unlinkTimer(withFormat(block, 'sets_reps')) : countByOf(block) === 'time' ? block : unlinkTimer(withFormat(block, 'tabata'));

  return (
    <div className="page">
      <PageHeader
        title={tpl.name || 'Training block'}
        back={back}
        confirmLeave={dirty}
        subtitle={total ? `≈ ${formatDuration(total)}` : undefined}
        actions={
          <InfoButton title="Training blocks">
            <p style={{ margin: 0 }}>A block is a ready-made piece of a workout. Build it in order:</p>
            <p style={{ margin: 0 }}>
              <strong>1.</strong> pick the exercises from the catalogue; <strong>2.</strong> with more than one, choose how they are combined; <strong>3.</strong> set how it is
              counted: exercises logged by reps use sets and rest set here, or a saved timer that sets the number of sets; exercises logged by time always use a timer (this
              follows “Logged as” of the exercises, and a block holds only one of the two kinds); <strong>4.</strong> add reps or times and weights; then notes if you like.
            </p>
            <p style={{ margin: 0 }}>Changes are kept only when you tap Save. Workouts that use this block then follow from their next session; workouts already done stay as they were.</p>
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
                <Link
                  className="btn icon small ghost"
                  to={`/exercises/${e.exerciseId}?from=${selfUrl}`}
                  aria-label={`Open ${exercises.get(e.exerciseId)?.name ?? 'exercise'}`}
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <Icon name="edit" />
                </Link>
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

        {b.entries.length > 0 && (
        <Step n={b.entries.length > 1 ? 3 : 2} title={kind === 'time' ? 'Count by time' : 'Count by reps'}>
          {mismatch && (
            <div className="banner">
              <p className="small" style={{ margin: 0 }}>
                {kind === 'reps'
                  ? 'This block uses a timer that is not one of your saved timers. Choose a saved timer, or set sets and rest here.'
                  : 'These exercises are logged by time, but this block still uses sets and reps.'}
              </p>
              <button className="btn small mt-s" onClick={() => kind && setBlock(countAs(b, kind))}>
                {kind === 'reps' ? 'Set sets and rest here' : 'Count by time'}
              </button>
            </div>
          )}
          {linkedTimer ? (
            <div className="pick-row mt-s">
              <span className="grow">{linkedTimer.name}</span>
              <Link className="btn icon small ghost" to={`/workouts/timers/${linkedTimer.id}?from=${selfUrl}`} aria-label={`Open ${linkedTimer.name}`}>
                <Icon name="edit" />
              </Link>
              <button className="btn icon small ghost" aria-label="Remove timer" onClick={() => setBlock(kind === 'reps' ? countAs(unlinkTimer(b), 'reps') : unlinkTimer(b))}>
                <Icon name="x" />
              </button>
            </div>
          ) : (
            <label className="field mt-s">
              Saved timer
              <select
                value=""
                onChange={(e) => {
                  const t = timers.find((x) => x.id === e.target.value);
                  if (t) setBlock(withTimer(b, t));
                }}
              >
                <option value="">{kind === 'reps' ? 'None: set sets and rest here' : 'None: set the timer here'}</option>
                {timers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!linkedTimer && !timers.length && <p className="tiny faint" style={{ margin: '6px 0 0' }}>Timers saved in Workouts → Timers appear here.</p>}
          {kind === 'time' && !linkedTimer && (
            <div className="scroll-x mt-s" role="group" aria-label="Timer">
              {TIME_FORMATS.filter((f) => f !== 'timed_sets' || b.format === 'timed_sets').map((f) => (
                <button key={f} className="chip" aria-pressed={b.format === f} onClick={() => setBlock(withFormat(b, f))}>
                  {TIME_LABEL[f]}
                </button>
              ))}
            </div>
          )}
          {!linkedTimer && !mismatch && (
            <div className="mt">
              {structured ? (
                <div className="sentences compact-sentences">
                  <Line>
                    <Pick small value={setsOf(b)} options={SET_OPTIONS} format={mins} onChange={(v) => setBlock(withSetsRest(b, v, restOf(b)))} label="Sets" />
                    <span>{structureOf(b) === 'sequence' || b.entries.length < 2 ? 'sets' : 'rounds'}</span>
                  </Line>
                  <Line>
                    <ClockPick small value={restOf(b)} maxMin={15} onChange={(v) => setBlock(withSetsRest(b, setsOf(b), v))} label="Rest" />
                    <span>rest</span>
                  </Line>
                </div>
              ) : (
                <TimerFields compact q={quickFromParams(b.format, b.params)} onChange={(q) => setBlock({ ...b, params: paramsFromQuick(q, b.params) })} />
              )}
            </div>
          )}
        </Step>
        )}

        {b.entries.length > 0 && (
          <Step
            n={b.entries.length > 1 ? 4 : 3}
            title={
              b.entries.every(distanceEx) ? 'Incline, speed and distance' : b.format === 'timed_sets' ? 'Time and weight' : b.format === 'tabata' || kind === 'time' ? 'Weight and reps' : 'Reps and weight'
            }
          >
            <div className="stack" style={{ gap: 10 }}>
              {b.entries.map((e, i) => (
                <div key={e.id} className="target-row">
                  <div className="target-name">{exercises.get(e.exerciseId)?.name ?? 'Exercise'}</div>
                  {distanceEx(e) ? (
                    // Time × distance (treadmill and similar): the timer sets the time; targets are incline, speed and distance.
                    <div className="form-grid">
                      <NumberField label="Incline (%)" placeholder="none" value={e.incline} onChange={(v) => setEntry(e.id, { incline: v })} stepper step={0.5} />
                      <NumberField label="Speed (km/h)" placeholder="none" value={e.speedKmh} onChange={(v) => setEntry(e.id, { speedKmh: v })} stepper step={0.5} />
                      <NumberField label="Distance (km)" placeholder="none" value={e.distanceKm} onChange={(v) => setEntry(e.id, { distanceKm: v })} stepper step={0.5} />
                    </div>
                  ) : (
                  <div className="form-grid">
                    {b.format === 'timed_sets' ? (
                      <NumberField label="Time (s)" value={e.durationSec} onChange={(v) => setEntry(e.id, { durationSec: v })} inputMode="numeric" stepper step={5} />
                    ) : b.format === 'tabata' || kind === 'time' ? null : (
                      <NumberField
                        label={b.format === 'sets_reps' ? 'Reps' : b.format === 'emom' ? 'Reps per interval' : 'Reps per round'}
                        value={perSet(e) ? undefined : e.reps}
                        placeholder="none"
                        disabled={perSet(e)}
                        onChange={(v) => setEntry(e.id, { reps: v })}
                        inputMode="numeric"
                        stepper
                      />
                    )}
                    <NumberField
                      label={`Weight (${unit})`}
                      placeholder="none"
                      disabled={perSet(e)}
                      value={perSet(e) ? undefined : toDisplayWeight(e.targetWeight, unit)}
                      onChange={(v) => setEntry(e.id, { targetWeight: fromDisplayWeight(v, unit) })}
                      stepper
                      step={unit === 'kg' ? 2.5 : 5}
                    />
                    {(b.format === 'tabata' || kind === 'time') && (
                      // The time comes from the timer; reps are only an estimate, for the volume.
                      <NumberField
                        label="Reps"
                        placeholder="none"
                        value={e.reps}
                        onChange={(v) => setEntry(e.id, { reps: v })}
                        inputMode="numeric"
                        stepper
                      />
                    )}
                  </div>
                  )}
                  {!distanceEx(e) && (b.format === 'sets_reps' || b.format === 'timed_sets' || b.format === 'emom') && (
                    <SetTargetsEditor entry={e} unit={unit} perInterval={b.format === 'emom'} count={intervalsFor(i)} onChange={(patch) => setEntry(e.id, patch)} />
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

      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        only={kind ?? undefined}
        onPick={(exerciseId) => {
          const cur = current();
          if (!cur) return;
          // The first exercise decides how the block is counted.
          const block = cur.block.entries.length ? cur.block : countAs(cur.block, exerciseCountBy(exercises.get(exerciseId)));
          const added = addExercise(block, exerciseId, profile.defaultRestSec);
          // Timed exercises: reps are an optional estimate, so they start empty.
          if (exerciseCountBy(exercises.get(exerciseId)) === 'time') added.entries[added.entries.length - 1] = { ...added.entries[added.entries.length - 1], reps: undefined };
          changeEntries(added);
        }}
      />
    </div>
  );
}
