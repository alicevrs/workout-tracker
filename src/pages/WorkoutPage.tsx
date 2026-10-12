import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BlockEditor } from '../components/BlockEditor';
import { Icon } from '../components/Icon';
import { SetLogger, type PrevLookup } from '../components/SetLogger';
import { hasActiveRun, TimerScreen } from '../components/TimerScreen';
import { EmptyState, NumberField, PageHeader, Segmented, useToast } from '../components/ui';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { BlockFormat, Intensity, PerformedBlock, Session } from '../db/types';
import { formatClock, formatDate, formatDuration, pad, toDateKey } from '../lib/dates';
import { describeBlock, estimateBlockSeconds, FORMAT_INFO, FORMATS, newBlock } from '../lib/program';
import { applyBlockEdit, blockToPerformed, performedToBlock } from '../lib/session';
import { previousSets } from '../lib/stats';
import { formatWeight } from '../lib/units';

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WorkoutPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const history = useLiveQuery(() => db.sessions.where('status').equals('completed').toArray(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<BlockFormat>('sets_reps');
  const [timerBlocks, setTimerBlocks] = useState<number[] | null>(null);
  const [params, setParams] = useSearchParams();
  const [pendingRun, setPendingRun] = useState<number[] | null>(null);
  const [now, setNow] = useState(Date.now());

  // Auto-open the timer for quick timers (?run=all) and offer to resume an interrupted run.
  const autoRun = useRef(params.get('run') === 'all');
  const sessionLoaded = !!session;
  useEffect(() => {
    if (!session) return;
    if (autoRun.current) {
      autoRun.current = false;
      setTimerBlocks(session.blocks.map((_, i) => i));
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoaded]);
  useEffect(() => {
    if (session && !timerBlocks) setPendingRun(hasActiveRun(session.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, timerBlocks]);

  const inProgress = session?.status === 'in_progress';
  useEffect(() => {
    if (!inProgress) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [inProgress]);

  const prevLookup: PrevLookup = useMemo(() => {
    const cache = new Map<string, ReturnType<PrevLookup>>();
    return (exerciseId: string) => {
      if (!session || !history) return null;
      if (!cache.has(exerciseId)) {
        const found = previousSets(exerciseId, history, session.startedAt, session.id);
        cache.set(exerciseId, found ? { date: found.session.startedAt, sets: found.sets } : null);
      }
      return cache.get(exerciseId) ?? null;
    };
  }, [history, session?.id, session?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <div className="page" />;
  if (!session)
    return (
      <div className="page">
        <PageHeader title="Workout" back="/" />
        <EmptyState title="Workout not found" />
      </div>
    );

  const save = (patch: Partial<Session>) => db.sessions.update(session.id, { ...patch, updatedAt: Date.now() });
  // Read-modify-write inside a transaction, so fast consecutive taps never overwrite each other.
  const updateBlock = (blockId: string, fn: (b: PerformedBlock) => PerformedBlock) =>
    db.transaction('rw', db.sessions, async () => {
      const fresh = await db.sessions.get(session.id);
      if (!fresh) return;
      await db.sessions.update(session.id, { blocks: fresh.blocks.map((b) => (b.id === blockId ? fn(b) : b)), updatedAt: Date.now() });
    });

  const finish = async () => {
    await save({ status: 'completed', endedAt: session.endedAt ?? Date.now() });
    toast('Workout saved');
    navigate(`/history/${session.id}`, { replace: true });
  };

  const discard = async () => {
    if (!confirm(inProgress ? 'Discard this workout? Logged sets will be lost.' : 'Delete this workout from your history?')) return;
    await db.sessions.delete(session.id);
    navigate(inProgress ? '/' : '/history', { replace: true });
  };

  const durationMin = session.endedAt ? Math.round((session.endedAt - session.startedAt) / 60000) : undefined;

  return (
    <div className="page">
      <PageHeader
        title={session.title}
        back={inProgress ? '/' : `/history/${session.id}`}
        subtitle={
          <>
            {formatDate(session.startedAt)}
            {inProgress && <span className="num"> · {formatClock((now - session.startedAt) / 1000)}</span>}
          </>
        }
        actions={
          inProgress ? (
            <button className="btn good" onClick={finish}>
              <Icon name="check" /> Finish
            </button>
          ) : (
            <button className="btn primary" onClick={() => navigate(`/history/${session.id}`)}>
              <Icon name="check" /> Done
            </button>
          )
        }
      />
      <div className="stack">
        {pendingRun && !timerBlocks && (
          <div className="banner warn">
            <div className="grow">A timer is paused for this workout.</div>
            <button className="btn small primary" onClick={() => setTimerBlocks(pendingRun)}>
              <Icon name="timer" /> Open timer
            </button>
          </div>
        )}
        {session.blocks.length > 1 && (
          <button className="btn primary block" onClick={() => setTimerBlocks(session.blocks.map((_, i) => i))}>
            <Icon name="timer" /> Run all blocks with the timer
            <span className="small" style={{ opacity: 0.8 }}>
              ≈ {formatDuration(session.blocks.reduce((s, b) => s + estimateBlockSeconds(performedToBlock(b)), 0))}
            </span>
          </button>
        )}
        {session.programDayId && inProgress && <p className="small faint">Plan changes here apply to this workout only. The program stays unchanged.</p>}

        {session.blocks.map((b, bi) => {
          const open = editing === b.id;
          const label = b.name ?? FORMAT_INFO[b.format].label;
          return (
            <section key={b.id} className="card block-card" aria-label={label}>
              <div className="card-title">
                <div style={{ minWidth: 0 }}>
                  <span className="chip primary">{FORMAT_INFO[b.format].short}</span> <strong>{label}</strong>
                  <div className="small muted">
                    {describeBlock(performedToBlock(b))}
                    {b.durationSec ? ` · ${formatClock(b.durationSec)} timed` : ''}
                  </div>
                </div>
                <div className="row">
                  <button className="btn small" aria-expanded={open} onClick={() => setEditing(open ? null : b.id)} aria-label={open ? 'Close plan editor' : `Edit plan of ${label}`}>
                    <Icon name="edit" /> {open ? 'Close' : 'Plan'}
                  </button>
                  <button className="btn small primary" onClick={() => setTimerBlocks([bi])} aria-label={`Start timer for ${label}`}>
                    <Icon name="timer" /> Timer
                  </button>
                </div>
              </div>

              {open && (
                <div className="mb">
                  <BlockEditor block={performedToBlock(b)} onChange={(edited) => updateBlock(b.id, (fresh) => applyBlockEdit(fresh, edited))} />
                  <button className="btn small danger mt" onClick={() => confirm('Remove this block from the workout?') && save({ blocks: session.blocks.filter((x) => x.id !== b.id) })}>
                    <Icon name="trash" /> Remove block
                  </button>
                  <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
                </div>
              )}

              {(b.format === 'amrap' || b.format === 'for_time') && <ResultFields block={b} onChange={(nb) => updateBlock(b.id, (fresh) => ({ ...fresh, result: nb.result }))} />}

              {(b.format === 'amrap' || b.format === 'for_time') && (
                <ul className="list small">
                  {b.entries.map((e) => (
                    <li key={e.id} className="row between" style={{ minHeight: 32 }}>
                      <span>{exercises.get(e.exerciseId)?.name ?? 'Unknown exercise'}</span>
                      <span className="muted num">
                        {e.planned?.reps ? `${e.planned.reps} reps` : e.planned?.durationSec ? `${e.planned.durationSec}s` : ''}
                        {e.planned?.targetWeight ? ` · ${formatWeight(e.planned.targetWeight, profile.unit)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {b.format !== 'amrap' && b.format !== 'for_time' && b.entries.map((e) => (
                <SetLogger
                  key={e.id}
                  entry={e}
                  exercise={exercises.get(e.exerciseId)}
                  format={b.format}
                  unit={profile.unit}
                  prev={prevLookup(e.exerciseId)}
                  update={(fn) => updateBlock(b.id, (fresh) => ({ ...fresh, entries: fresh.entries.map((x) => (x.id === e.id ? fn(x) : x)) }))}
                />
              ))}
              {b.entries.length === 0 && !open && <p className="small muted">No exercises. Use Plan to add some, or just run the timer.</p>}
            </section>
          );
        })}

        {session.blocks.length === 0 && (
          <div className="card">
            <EmptyState icon="dumbbell" title="Empty workout">
              Add a block to plan and log this workout.
            </EmptyState>
          </div>
        )}

        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">New block format</span>
            <select value={newFormat} onChange={(e) => setNewFormat(e.target.value as BlockFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            onClick={async () => {
              const pb = blockToPerformed(newBlock(newFormat, profile.defaultPrepSec));
              await save({ blocks: [...session.blocks, pb] });
              setEditing(pb.id);
            }}
          >
            <Icon name="plus" /> Add block
          </button>
        </div>

        <section className="card form-grid">
          <label className="field full">
            Title
            <input defaultValue={session.title} onBlur={(e) => e.target.value.trim() && save({ title: e.target.value.trim() })} />
          </label>
          <div className="full">
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>
              Effort (used for the calorie estimate)
            </div>
            <Segmented<Intensity>
              label="Effort"
              value={session.intensity}
              onChange={(intensity) => save({ intensity })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'vigorous', label: 'Vigorous' },
              ]}
            />
          </div>
          <label className="field">
            Start
            <input
              type="datetime-local"
              value={toLocalInput(session.startedAt)}
              onChange={(e) => {
                const t = new Date(e.target.value).getTime();
                if (!Number.isNaN(t)) {
                  const shift = t - session.startedAt;
                  save({ startedAt: t, date: toDateKey(t), endedAt: session.endedAt ? session.endedAt + shift : undefined });
                }
              }}
            />
          </label>
          {!inProgress && (
            <NumberField label="Duration" suffix="min" value={durationMin} onChange={(v) => v && save({ endedAt: session.startedAt + v * 60000 })} inputMode="numeric" />
          )}
          <label className="field full">
            Notes
            <textarea defaultValue={session.notes ?? ''} onBlur={(e) => save({ notes: e.target.value || undefined })} />
          </label>
        </section>

        <button className="btn danger" onClick={discard}>
          <Icon name="trash" /> {inProgress ? 'Discard workout' : 'Delete workout'}
        </button>
      </div>

      {timerBlocks && <TimerScreen session={session} blockIndexes={timerBlocks} onClose={() => setTimerBlocks(null)} />}
    </div>
  );
}

function ResultFields({ block, onChange }: { block: PerformedBlock; onChange: (b: PerformedBlock) => void }) {
  const r = block.result ?? {};
  const set = (patch: Partial<typeof r>) => onChange({ ...block, result: { ...r, ...patch } });
  return (
    <div className="form-grid mb">
      <NumberField label="Rounds" value={r.rounds} onChange={(v) => set({ rounds: v })} stepper inputMode="numeric" />
      <NumberField label="Extra reps" value={r.reps} onChange={(v) => set({ reps: v })} stepper inputMode="numeric" />
      {block.format === 'for_time' && (
        <label className="field full">
          Time
          <input
            inputMode="text"
            placeholder="m:ss"
            defaultValue={r.timeSec !== undefined ? formatClock(r.timeSec) : ''}
            key={r.timeSec}
            onBlur={(e) => {
              const parts = e.target.value.split(':').map(Number);
              if (parts.some(Number.isNaN)) return;
              set({ timeSec: parts.reduce((a, p) => a * 60 + p, 0) });
            }}
          />
        </label>
      )}
    </div>
  );
}
