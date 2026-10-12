import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/db';
import { useExerciseMap, useProfile, useSettings } from '../db/repo';
import type { PerformedBlock, Session } from '../db/types';
import { formatClock } from '../lib/dates';
import { FORMAT_INFO } from '../lib/program';
import { performedToBlock } from '../lib/session';
import { timerAudio, vibrate } from '../lib/timer/audio';
import * as engine from '../lib/timer/engine';
import { applyCompleted, type SetOverrides } from '../lib/timer/link';
import { buildPhases, type Phase } from '../lib/timer/phases';
import { keepScreenOn } from '../lib/timer/wakeLock';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { Icon } from './Icon';
import { NumberField } from './ui';

interface Run {
  sig: string;
  state: engine.TimerState;
  applied: number;
  overrides: SetOverrides;
  /** AMRAP / For Time round counter per block index. */
  rounds: Record<number, number>;
}

const storageKey = (sessionId: string, blocks: number[]) => `timer:${sessionId}:${blocks.join(',')}`;

function loadRun(key: string, sig: string): Run | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const run = JSON.parse(raw) as Run;
    return run.sig === sig ? run : null;
  } catch {
    return null;
  }
}

function saveRun(key: string, run: Run) {
  try {
    localStorage.setItem(key, JSON.stringify(run));
  } catch {
    /* storage full or blocked: the timer still works in memory */
  }
}

export function clearTimerRun(sessionId: string, blocks: number[]) {
  try {
    localStorage.removeItem(storageKey(sessionId, blocks));
  } catch {
    /* ignore */
  }
}

/** True if a timer run for this session was left running or paused. */
export function hasActiveRun(sessionId: string): number[] | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`timer:${sessionId}:`)) {
        const run = JSON.parse(localStorage.getItem(k) ?? '{}') as Run;
        if (run.state?.status === 'running' || run.state?.status === 'paused') return k.split(':')[2].split(',').map(Number);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function soundForPhase(p: Phase | undefined): engine.SoundKind {
  if (!p) return 'finish';
  return p.kind === 'work' ? 'work' : 'rest';
}

export function TimerScreen({ session, blockIndexes, onClose }: { session: Session; blockIndexes: number[]; onClose: () => void }) {
  const exercises = useExerciseMap();
  const profile = useProfile();
  const settings = useSettings();
  const unit = profile.unit;

  // Phases depend only on the plan, not on logged values.
  const planSig = JSON.stringify(blockIndexes.map((i) => (session.blocks[i] ? performedToBlock(session.blocks[i]) : null)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phases = useMemo(() => buildPhases(session.blocks, blockIndexes), [planSig]);
  const key = storageKey(session.id, blockIndexes);
  const sig = useMemo(() => JSON.stringify(phases.map((p) => [p.kind, p.durationSec, p.entryId, p.set, p.drop])), [phases]);

  const [run, setRun] = useState<Run>(() => loadRun(key, sig) ?? { sig, state: engine.initialState(), applied: 0, overrides: {}, rounds: {} });
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;

  const sound = !muted;
  timerAudio.volume = settings.soundVolume;

  const reschedule = useCallback(
    (state: engine.TimerState) => {
      if (!sound) return timerAudio.cancel();
      timerAudio.schedule(engine.upcomingSounds(phases, state, Date.now(), 4 * 3600_000));
    },
    [phases, sound],
  );

  /** Persist the run, write newly completed sets to the session, and handle sound/vibration on phase changes. */
  const commit = useCallback(
    async (next: Run, opts: { userAction?: boolean } = {}) => {
      const prev = runRef.current;
      runRef.current = next;
      setRun(next);
      saveRun(key, next);

      const phaseChanged = prev.state.index !== next.state.index || prev.state.status !== next.state.status;
      if (phaseChanged) {
        reschedule(next.state);
        const p = phases[next.state.index];
        if (next.state.status === 'running' && p?.vibrate) vibrate(p.kind === 'work' ? [120, 60, 120] : 200);
        if (next.state.status === 'finished') vibrate([200, 100, 200, 100, 400]);
        // Pre-scheduled sounds cover timed phase ends; a tap needs an immediate sound.
        if (opts.userAction && sound && next.state.status !== 'paused' && prev.state.status !== 'paused') {
          if (next.state.status === 'finished') timerAudio.play('finish');
          else if (p?.sound) timerAudio.play(soundForPhase(p));
        }
      }

      if (next.state.completed.length > next.applied) {
        const from = next.applied;
        const done = { ...next, applied: next.state.completed.length };
        runRef.current = done;
        setRun(done);
        saveRun(key, done);
        await db.transaction('rw', db.sessions, async () => {
          const fresh = await db.sessions.get(session.id);
          if (!fresh) return;
          const blocks = applyCompleted(fresh.blocks, phases, next.state.completed, from, next.overrides);
          await db.sessions.update(session.id, { blocks, source: fresh.source === 'manual' ? 'timer' : fresh.source, updatedAt: Date.now() });
        });
      }
    },
    [key, phases, reschedule, session.id, sound],
  );

  // Tick: recompute from the wall clock. Also runs right after the app returns to the foreground.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    const onVis = async () => {
      if (document.visibilityState !== 'visible') return;
      await timerAudio.resume();
      const t = Date.now();
      setNow(t);
      const synced = engine.sync(phases, runRef.current.state, t);
      if (synced !== runRef.current.state) await commit({ ...runRef.current, state: synced });
      reschedule(runRef.current.state);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [phases, commit, reschedule]);

  useEffect(() => {
    const synced = engine.sync(phases, run.state, now);
    if (synced !== run.state) void commit({ ...run, state: synced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Screen on + background audio while running.
  const running = run.state.status === 'running';
  useEffect(() => {
    void keepScreenOn(running);
    timerAudio.setKeepAlive(running && settings.backgroundAudio);
  }, [running, settings.backgroundAudio]);
  useEffect(
    () => () => {
      void keepScreenOn(false);
      timerAudio.setKeepAlive(false);
      timerAudio.cancel();
    },
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reschedule(runRef.current.state), [muted]);

  const t = Date.now();
  const snap = engine.snapshot(phases, run.state, t);
  const phase = snap.phase;
  const status = run.state.status;
  const block: PerformedBlock | undefined = phase ? session.blocks[phase.blockIndex] : undefined;
  const exercise = phase?.exerciseId ? exercises.get(phase.exerciseId) : undefined;
  const nextPhase = snap.next;
  const nextExercise = nextPhase?.exerciseId ? exercises.get(nextPhase.exerciseId) : undefined;
  const manual = status !== 'idle' && status !== 'finished' && phase?.kind === 'work' && phase.durationSec === null;
  const isAmrapLike = phase && (phase.format === 'amrap' || phase.format === 'for_time') && phase.kind === 'work';

  // --- actions ---
  const act = (fn: (s: engine.TimerState, n: number) => engine.TimerState, userAction = true) => {
    timerAudio.unlock();
    const n = Date.now();
    void commit({ ...runRef.current, state: fn(runRef.current.state, n) }, { userAction });
  };
  const onStart = () => {
    timerAudio.unlock();
    act((s, n) => engine.start(phases, s, n));
    if (sound && phases[0]) timerAudio.play(phases[0].kind === 'work' ? 'work' : 'tick');
  };
  const onPause = () => act((s, n) => engine.pause(s, n), false);
  const onResume = () => act((s, n) => engine.resume(s, n), false);
  const onSkip = () => act((s, n) => engine.skip(phases, s, n));
  const onDone = () => act((s, n) => engine.complete(phases, s, n));
  const onFinish = () => {
    if (status !== 'finished' && !confirm('Finish the timer now?')) return;
    act((s, n) => engine.finish(phases, s, n));
  };
  const onReset = () => {
    if (!confirm('Reset the timer? Sets already logged stay in the log.')) return;
    timerAudio.cancel();
    void commit({ sig, state: engine.reset(), applied: 0, overrides: {}, rounds: {} });
  };
  const close = () => {
    if (status === 'running') void commit({ ...runRef.current, state: engine.pause(runRef.current.state, Date.now()) });
    if (status === 'finished' || status === 'idle') clearTimerRun(session.id, blockIndexes);
    timerAudio.cancel();
    onClose();
  };

  const setOverride = (patch: Partial<{ reps: number; weight: number }>) => {
    const idx = runRef.current.state.index;
    const next = { ...runRef.current, overrides: { ...runRef.current.overrides, [idx]: { ...runRef.current.overrides[idx], ...patch } } };
    runRef.current = next;
    setRun(next);
    saveRun(key, next);
  };
  const roundsHere = phase ? run.rounds[phase.blockIndex] ?? 0 : 0;
  const setRounds = (rounds: number) => {
    if (!phase) return;
    const next = { ...runRef.current, rounds: { ...runRef.current.rounds, [phase.blockIndex]: Math.max(0, rounds) } };
    runRef.current = next;
    setRun(next);
    saveRun(key, next);
  };

  // Keyboard shortcuts (Mac): Space start/pause, Enter done, → skip, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (status === 'idle') onStart();
        else if (status === 'running') onPause();
        else if (status === 'paused') onResume();
      } else if (e.key === 'Enter' && manual) onDone();
      else if (e.key === 'ArrowRight' && (status === 'running' || status === 'paused')) onSkip();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Current logged values for the quick-log fields.
  const currentSet =
    phase?.entryId && phase.set && block ? block.entries.find((e) => e.id === phase.entryId)?.sets[phase.set - 1] : undefined;
  const ov = run.overrides[run.state.index] ?? {};
  const qlReps = ov.reps ?? (phase?.drop ? currentSet?.dropReps?.[phase.drop - 1] : currentSet?.reps) ?? phase?.targetReps;
  const qlWeight = ov.weight ?? (phase?.drop ? currentSet?.dropWeights?.[phase.drop - 1] : currentSet?.weight) ?? phase?.targetWeight;

  const phaseClass = status === 'finished' ? 'phase-done' : phase?.kind === 'work' ? 'phase-work' : phase?.kind === 'rest' ? 'phase-rest' : 'phase-prep';
  const clockSec =
    status === 'idle'
      ? phase?.durationSec ?? 0
      : phase?.countUp || snap.remainingMs === null
        ? snap.elapsedMs / 1000
        : Math.ceil(snap.remainingMs / 1000);
  const blockCount = new Set(phases.map((p) => p.blockIndex)).size;
  const blockPos = phase ? [...new Set(phases.map((p) => p.blockIndex))].indexOf(phase.blockIndex) + 1 : 1;

  const target = phase?.kind === 'work' && (phase.targetReps || phase.targetWeight || (phase.targetDurationSec && phase.durationSec === null))
    ? [phase.targetReps ? `${phase.targetReps} reps` : null, phase.targetWeight ? formatWeight(phase.targetWeight, unit) : null, phase.targetDurationSec && phase.durationSec === null ? `${phase.targetDurationSec}s` : null].filter(Boolean).join(' · ')
    : '';

  const describeNext = () => {
    if (!nextPhase) return 'Last phase';
    if (nextPhase.kind === 'rest') return `${nextPhase.label} ${nextPhase.durationSec ? formatClock(nextPhase.durationSec) : ''}`;
    if (nextPhase.kind === 'prep') return `Next block: ${session.blocks[nextPhase.blockIndex]?.name ?? FORMAT_INFO[nextPhase.format].label}`;
    const bits = [nextExercise?.name ?? nextPhase.label];
    if (nextPhase.set && nextPhase.totalSets && (nextPhase.format === 'sets_reps' || nextPhase.format === 'timed_sets')) bits.push(`set ${nextPhase.set}/${nextPhase.totalSets}`);
    if (nextPhase.drop) bits.push(`drop ${nextPhase.drop}`);
    if (nextPhase.durationSec && nextPhase.format !== 'emom') bits.push(formatClock(nextPhase.durationSec));
    return bits.join(' · ');
  };

  return (
    <div className="timer-screen" role="dialog" aria-modal="true" aria-label="Workout timer">
      <div className="timer-top">
        <button className="btn icon ghost" style={{ color: '#fff' }} onClick={close} aria-label={status === 'running' ? 'Pause and close timer' : 'Close timer'}>
          <Icon name="x" />
        </button>
        <div className="small" style={{ color: '#9aa1ab', textAlign: 'center' }}>
          {block ? block.name ?? FORMAT_INFO[block.format].label : ''}
          {blockCount > 1 && ` · block ${blockPos}/${blockCount}`}
          <div className="num" style={{ color: '#fff', fontWeight: 650 }}>
            Total {formatClock(snap.totalElapsedMs / 1000)}
          </div>
        </div>
        <button className="btn icon ghost" style={{ color: '#fff' }} onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={muted}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
      </div>

      {status === 'finished' ? (
        <FinishedView session={session} blockIndexes={blockIndexes} rounds={run.rounds} onDone={close} totalSec={snap.totalElapsedMs / 1000} />
      ) : (
        <>
          <div className={`timer-center ${phaseClass}`}>
            <div className="timer-phase-label" aria-live="polite">
              {status === 'idle' ? 'Ready' : phase?.label}
              {status === 'paused' && ' · paused'}
            </div>
            {phase?.kind === 'work' && exercise && (
              <div style={{ textAlign: 'center', color: '#fff', fontSize: 'clamp(1.2rem, 5vw, 2rem)', fontWeight: 700 }}>{exercise.name}</div>
            )}
            {target && <div className="timer-sub">{target}</div>}
            <div className="timer-clock" role="timer" aria-label={`${Math.round(clockSec)} seconds`}>
              {formatClock(clockSec)}
            </div>
            {phase?.durationSec ? (
              <div className="timer-progress" aria-hidden>
                <div style={{ width: `${(status === 'idle' ? 0 : snap.progress) * 100}%` }} />
              </div>
            ) : null}
            {isAmrapLike && status !== 'idle' && (
              <div className="timer-sub">
                {phase.format === 'amrap' ? `Elapsed ${formatClock(snap.elapsedMs / 1000)}` : phase.durationSec ? `Time cap ${formatClock(phase.durationSec)}` : 'Tap Finish when done'}
              </div>
            )}
            <div className="timer-meta" style={{ color: '#fff' }}>
              {phase?.set && phase.totalSets && (phase.format !== 'tabata' || phase.totalSets > 1) && (
                <span className="pill">
                  Set {phase.set}/{phase.totalSets}
                </span>
              )}
              {phase?.round && phase.totalRounds && phase.format !== 'sets_reps' && phase.format !== 'timed_sets' && (
                <span className="pill">
                  Round {phase.round}/{phase.totalRounds}
                </span>
              )}
              {phase?.interval && (
                <span className="pill">
                  Interval {phase.interval}/{phase.totalIntervals}
                </span>
              )}
              {phase?.drop && <span className="pill">Drop {phase.drop}</span>}
            </div>

            {isAmrapLike && status !== 'idle' && (
              <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
                <button className="btn" style={{ background: '#15171b', color: '#fff', minWidth: 64 }} onClick={() => setRounds(roundsHere - 1)} aria-label="Remove a round">
                  −
                </button>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800 }} className="num">
                    {roundsHere}
                  </div>
                  <div className="tiny" style={{ color: '#9aa1ab' }}>
                    rounds
                  </div>
                </div>
                <button className="btn primary" style={{ minWidth: 96, minHeight: 64, fontSize: '1.1rem' }} onClick={() => setRounds(roundsHere + 1)}>
                  +1 round
                </button>
              </div>
            )}

            {manual && phase.format !== 'for_time' && (
              <div className="quick-log">
                <NumberField label="Reps" value={qlReps} onChange={(v) => setOverride({ reps: v })} stepper inputMode="numeric" />
                <NumberField label={`Weight (${unit})`} value={toDisplayWeight(qlWeight, unit)} onChange={(v) => setOverride({ weight: fromDisplayWeight(v, unit) })} stepper step={unit === 'kg' ? 2.5 : 5} />
              </div>
            )}
            {phase?.format === 'emom' && phase.kind === 'work' && status !== 'idle' && (
              <div className="quick-log" style={{ gridTemplateColumns: '1fr' }}>
                <NumberField label="Reps this interval (optional)" value={qlReps} onChange={(v) => setOverride({ reps: v })} stepper inputMode="numeric" />
              </div>
            )}
            {status !== 'idle' && (
              <div className="timer-next">
                Next: <strong style={{ color: '#fff' }}>{describeNext()}</strong>
              </div>
            )}
          </div>

          {manual && (
            <button className="btn good block" style={{ minHeight: 72, fontSize: '1.3rem', marginTop: 12 }} onClick={onDone}>
              <Icon name="check" /> {phase.format === 'for_time' ? 'Finish' : 'Done'}
            </button>
          )}

          <div className="timer-controls">
            {status === 'idle' ? (
              <button className="btn primary" style={{ gridColumn: '1 / -1', minHeight: 76, fontSize: '1.3rem', flexDirection: 'row' }} onClick={onStart}>
                <Icon name="play" /> Start
              </button>
            ) : (
              <>
                {status === 'running' ? (
                  <button className="btn" onClick={onPause}>
                    <Icon name="pause" /> Pause
                  </button>
                ) : (
                  <button className="btn primary" onClick={onResume}>
                    <Icon name="play" /> Resume
                  </button>
                )}
                <button className="btn" onClick={onSkip}>
                  <Icon name="skip" /> Skip
                </button>
                <button className="btn" onClick={onReset}>
                  <Icon name="reset" /> Reset
                </button>
                <button className="btn" onClick={onFinish}>
                  <Icon name="flag" /> Finish
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type ResultEdit = { rounds?: number; reps?: number; timeSec?: number };

function FinishedView({ session, blockIndexes, rounds, onDone, totalSec }: { session: Session; blockIndexes: number[]; rounds: Record<number, number>; onDone: () => void; totalSec: number }) {
  const resultBlocks = blockIndexes.filter((i) => ['amrap', 'for_time'].includes(session.blocks[i]?.format));
  // Only user edits live here; defaults come from the (live) session and the round counter.
  const [edits, setEdits] = useState<Record<number, ResultEdit>>({});
  const valueFor = (i: number, b = session.blocks[i]): ResultEdit => ({
    rounds: edits[i]?.rounds ?? b?.result?.rounds ?? rounds[i],
    reps: edits[i]?.reps ?? b?.result?.reps,
    timeSec: edits[i]?.timeSec ?? b?.result?.timeSec,
  });

  const save = async () => {
    if (resultBlocks.length) {
      await db.transaction('rw', db.sessions, async () => {
        const fresh = await db.sessions.get(session.id);
        if (!fresh) return;
        const blocks = fresh.blocks.map((b, i) => (resultBlocks.includes(i) ? { ...b, result: { ...b.result, ...valueFor(i, b) } } : b));
        await db.sessions.update(session.id, { blocks, updatedAt: Date.now() });
      });
    }
    onDone();
  };

  return (
    <div className="timer-center phase-done">
      <div className="timer-phase-label">Done</div>
      <div className="timer-clock" style={{ fontSize: 'clamp(3.5rem, 18vw, 9rem)' }}>
        {formatClock(totalSec)}
      </div>
      {resultBlocks.map((i) => {
        const b = session.blocks[i];
        const v = valueFor(i);
        const set = (patch: ResultEdit) => setEdits({ ...edits, [i]: { ...edits[i], ...patch } });
        return (
          <div key={i} className="quick-log" style={{ color: '#fff' }}>
            <div style={{ gridColumn: '1 / -1', fontWeight: 700 }}>{b.name ?? FORMAT_INFO[b.format].label} result</div>
            <NumberField label="Rounds" value={v.rounds} onChange={(x) => set({ rounds: x })} stepper inputMode="numeric" />
            <NumberField label="Extra reps" value={v.reps} onChange={(x) => set({ reps: x })} stepper inputMode="numeric" />
            {b.format === 'for_time' && (
              <NumberField label="Time (seconds)" value={v.timeSec} onChange={(x) => set({ timeSec: x })} inputMode="numeric" />
            )}
          </div>
        );
      })}
      <p className="timer-sub">Logged sets are saved in the workout. You can edit them there.</p>
      <button className="btn primary block" style={{ minHeight: 64, maxWidth: 520, margin: '0 auto' }} onClick={save}>
        <Icon name="check" /> Save and close
      </button>
    </div>
  );
}
