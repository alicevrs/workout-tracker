import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SetTargetsEditor } from '../components/BlockEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { ClockPick, Line, Pick, mins } from '../components/TimerFields';
import { EmptyState, NumberField, PageHeader, useToast } from '../components/ui';
import { getDraft, setDraft, useDraft, withDraftParam } from '../lib/drafts';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockTemplate, ExerciseEntry, LogField, Program } from '../db/types';
import { useDragReorder } from '../hooks/useDragReorder';
import {
  addExercise,
  blockLog,
  durationOf,
  totalTimeOf,
  withTotalTime,
  hasStructure,
  linkedBlock,
  LOG_FIELDS,
  logMode,
  NEW_BLOCK_NAME,
  OLD_BLOCK_NAME,
  restOf,
  setsOf,
  structureOf,
  syncTemplate,
  withDuration,
  withGrouping,
  withLog,
  withSetsRest,
  withStructure,
  type LogMode,
  type Structure,
} from '../lib/blockTemplates';
import { formatDuration } from '../lib/dates';
import { estimateBlockSeconds } from '../lib/program';
import { SET_OPTIONS } from '../lib/timer/quick';
import { withTimer } from '../lib/timerTemplates';
import { workoutDay } from '../lib/workouts';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';

const STRUCTURE_HINT: Record<Structure, string> = {
  none: '',
  sequence: 'Exercises one after the other, rest after each round.',
  circuit: 'One continuous routine, logged in one go.',
};

/** The block without its link to a saved timer (its times become its own). */
function unlinkTimer(b: Block): Block {
  const next = { ...b };
  delete next.timerId;
  return next;
}

const LOG_LABEL: Record<LogField, string> = { reps: 'Reps', time: 'Time', distance: 'Distance' };
const COUNT_TITLE: Record<LogMode, string> = { R: 'Rounds and rest', RT: 'Timer', RTD: 'Timer', T: 'Total time', DT: 'Time', DR: 'Reps and rest', D: '' };
const TARGETS_TITLE: Record<LogMode, string> = {
  R: 'Reps and weight',
  RT: 'Weight',
  T: 'Reps and weight',
  D: 'Distance',
  DR: 'Distance',
  DT: 'Incline and speed',
  RTD: 'Incline and speed',
};

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
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [picking, setPicking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useLiveQuery(() => db.timerTemplates.orderBy('name').toArray(), []) ?? [];
  // Swipe right = Back (asks first when there are unsaved changes, like the Back link).
  useSwipeBack(() => {
    if (dirtyRef.current && !confirm('Leave without saving? Your changes will be lost.')) return;
    navigate(back);
  });

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
  // What the block logs (step 3) decides how it is counted and which targets it asks for.
  const log = blockLog(b, exercises);
  const mode = logMode(log);
  const toggleLog = (f: LogField) => {
    const next = log.includes(f) ? log.filter((x) => x !== f) : LOG_FIELDS.filter((x) => x === f || log.includes(x));
    if (next.length) setBlock(withLog(b, next));
  };
  // Step numbers: 1 exercises, 2 how they are combined, 3 log as, 4 counting, 5 targets.
  const logN = 3;
  const countN = logN + 1;
  const targetsN = countN + 1;
  const structured = hasStructure(b.format);
  const total = estimateBlockSeconds(b);
  const autoName = (block: Block) => block.entries.map((e) => exercises.get(e.exerciseId)?.name ?? '').filter(Boolean).join(' / ');
  const nameIsAuto = tpl.name === NEW_BLOCK_NAME || tpl.name === OLD_BLOCK_NAME || tpl.name === autoName(b);
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
              <strong>1.</strong> pick the exercises; <strong>2.</strong> how they are combined, if they are; <strong>3.</strong> what you log: reps, time, distance or a combination;
              <strong>4.</strong> how it is counted, which follows from step 3 (rounds and rest, a saved timer, a total time); <strong>5.</strong> the targets.</p>
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

        {b.entries.length > 0 && (
          <Step n={2} title="How they are combined">
            <div className="row wrap" role="group" aria-label="How they are combined" style={{ gap: 8 }}>
              {(['sequence', 'circuit'] as const).map((st) => (
                <button
                  key={st}
                  className="chip"
                  aria-pressed={structureOf(b) === st}
                  // Tapping the chosen one again clears it.
                  onClick={() => {
                    const next = structureOf(b) === st ? 'none' : st;
                    setBlock(structured ? withStructure(b, next) : withGrouping(b, next));
                  }}
                >
                  {st === 'sequence' ? 'Sequence' : 'Circuit'}
                </button>
              ))}
            </div>
            {STRUCTURE_HINT[structureOf(b)] && (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                {STRUCTURE_HINT[structureOf(b)]}
              </p>
            )}
          </Step>
        )}

        {b.entries.length > 0 && (
          <Step n={logN} title="Log as">
            <div className="row wrap" role="group" aria-label="Log as" style={{ gap: 8 }}>
              {LOG_FIELDS.map((f) => (
                <button key={f} className="chip" aria-pressed={log.includes(f)} onClick={() => toggleLog(f)}>
                  {LOG_LABEL[f]}
                </button>
              ))}
            </div>
          </Step>
        )}

        {b.entries.length > 0 && mode !== 'D' && (
          <Step n={countN} title={COUNT_TITLE[mode]}>
            {(mode === 'RT' || mode === 'RTD') &&
              (linkedTimer ? (
                <div className="pick-row">
                  <span className="grow">{linkedTimer.name}</span>
                  <Link className="btn icon small ghost" to={`/workouts/timers/${linkedTimer.id}?from=${selfUrl}`} aria-label={`Open ${linkedTimer.name}`}>
                    <Icon name="edit" />
                  </Link>
                  <button className="btn icon small ghost" aria-label="Remove timer" onClick={() => setBlock(unlinkTimer(b))}>
                    <Icon name="x" />
                  </button>
                </div>
              ) : (
                <>
                  <label className="field">
                    <span className="sr-only">Saved timer</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const t = timers.find((x) => x.id === e.target.value);
                        if (t) setBlock(withTimer(b, t));
                      }}
                    >
                      <option value="" disabled>
                        Choose a saved timer
                      </option>
                      {timers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!timers.length && <p className="tiny faint" style={{ margin: '6px 0 0' }}>Timers saved in Workouts → Timers appear here.</p>}
                </>
              ))}
            {(mode === 'R' || mode === 'DR') && (
              <div className="sentences compact-sentences">
                <Line>
                  <Pick small value={setsOf(b)} options={SET_OPTIONS} format={mins} onChange={(v) => setBlock(withSetsRest(b, v, restOf(b)))} label={mode === 'DR' ? 'Reps' : 'Sets'} />
                  <span>{mode === 'DR' ? 'reps' : b.entries.length > 1 && structureOf(b) !== 'none' ? 'rounds' : 'sets'}</span>
                </Line>
                <Line>
                  <ClockPick small value={restOf(b)} maxMin={15} onChange={(v) => setBlock(withSetsRest(b, setsOf(b), v))} label="Rest" />
                  <span>rest</span>
                </Line>
              </div>
            )}
            {mode === 'T' && (
              <div className="sentences compact-sentences">
                <Line>
                  <ClockPick small value={totalTimeOf(b)} min={5} maxMin={120} onChange={(v) => setBlock(withTotalTime(b, v))} label="Total time" />
                  <span>total</span>
                </Line>
              </div>
            )}
            {mode === 'DT' && (
              <div className="sentences compact-sentences">
                <Line>
                  <ClockPick small value={durationOf(b)} min={5} maxMin={120} onChange={(v) => setBlock(withDuration(b, v))} label="Time" />
                  <span>time</span>
                </Line>
              </div>
            )}
          </Step>
        )}

        {b.entries.length > 0 && (
          <Step n={mode === 'D' ? countN : targetsN} title={TARGETS_TITLE[mode]}>
            <div className="stack" style={{ gap: 10 }}>
              {b.entries.map((e, i) => (
                <div key={e.id} className="target-row">
                  <div className="target-name">{exercises.get(e.exerciseId)?.name ?? 'Exercise'}</div>
                  {log.includes('distance') ? (
                    <div className="form-grid">
                      {(mode === 'D' || mode === 'DR') && (
                        <NumberField label="Distance (km)" placeholder="none" value={e.distanceKm} onChange={(v) => setEntry(e.id, { distanceKm: v })} stepper step={0.5} />
                      )}
                      <NumberField label="Incline (%)" placeholder="none" value={e.incline} onChange={(v) => setEntry(e.id, { incline: v })} stepper step={0.5} />
                      <NumberField label="Speed (km/h)" placeholder="none" value={e.speedKmh} onChange={(v) => setEntry(e.id, { speedKmh: v })} stepper step={0.5} />
                    </div>
                  ) : (
                    <div className="form-grid">
                      {(mode === 'R' || mode === 'T') && (
                        <NumberField
                          label="Reps"
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
                    </div>
                  )}
                  {mode === 'DR' && e.distanceKm ? <p className="tiny faint" style={{ margin: '6px 0 0' }}>{`${Math.round((e.distanceKm * 1000) / Math.max(1, setsOf(b)))} m per rep`}</p> : null}
                  {mode === 'R' && (
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
        onPick={(exerciseId) => {
          const cur = current();
          if (!cur) return;
          // The block keeps what it logs (reps for a new block); the new exercise is set up to match.
          const log = cur.block.entries.length ? blockLog(cur.block, exercises) : (['reps'] as LogField[]);
          changeEntries(withLog(addExercise({ ...cur.block, log }, exerciseId, profile.defaultRestSec), log));
        }}
      />
    </div>
  );
}
