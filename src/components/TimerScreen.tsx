import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db/db';
import { useExerciseMap, useProfile, useSettings } from '../db/repo';
import type { PerformedBlock, Session } from '../db/types';
import { formatClock } from '../lib/dates';
import { FORMAT_INFO } from '../lib/program';
import { performedToBlock } from '../lib/session';
import { configureAudio, timerAudio, vibrate } from '../lib/timer/audio';
import * as engine from '../lib/timer/engine';
import { applyCompleted, type SetOverrides } from '../lib/timer/link';
import { buildPhases, type Phase } from '../lib/timer/phases';
import { keepScreenOn } from '../lib/timer/wakeLock';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { BrandRing } from './BrandRing';
import { Icon } from './Icon';
import { NumberField, Sheet } from './ui';

interface Run {
  sig: string;
  state: engine.TimerState;
  applied: number;
  overrides: SetOverrides;
  /** AMRAP / For Time round counter per block index. */
  rounds: Record<number, number>;
  /** Phase time (ms) at each round-counter tap, per block index. */
  laps?: Record<number, number[]>;
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

/** Line above the ring, e.g. “3/8 · Work”, “Minute 4/10”, “12 min AMRAP”. */
function headingFor(p: Phase | undefined): string {
  if (!p) return '';
  if (p.kind === 'prep') return 'Get ready';
  if (p.format === 'amrap' && p.kind === 'work') return p.durationSec ? `${Math.round(p.durationSec / 60)} min AMRAP` : 'AMRAP';
  if (p.format === 'for_time' && p.kind === 'work') return p.durationSec ? `For time · cap ${formatClock(p.durationSec)}` : 'For time';
  if (p.format === 'emom' && p.kind === 'work' && p.interval) return `${p.label.replace(/ \d+$/, '')} ${p.interval}/${p.totalIntervals}`;
  if ((p.format === 'tabata' || p.format === 'intervals') && p.round && p.totalRounds) {
    return p.totalRounds > 1 ? `${p.round}/${p.totalRounds} · ${p.label}` : p.label;
  }
  if (p.kind === 'work' && p.set && p.totalSets && (p.format === 'sets_reps' || p.format === 'timed_sets')) return `${p.label === 'Work' ? 'Set' : p.label} ${p.set}/${p.totalSets}`;
  return p.label;
}

export function TimerScreen({
  session,
  blockIndexes,
  onClose,
  onComplete,
  standalone = false,
}: {
  session: Session;
  blockIndexes: number[];
  onClose: () => void;
  /** Called after “Save” when the run covered the whole workout, to save it as completed. */
  onComplete?: () => void;
  /** Plain timer from the Timer tab: nothing is logged, the end screen just says well done. */
  standalone?: boolean;
}) {
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
  const [showList, setShowList] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;

  const sound = !muted;
  const halfway = settings.halfwayCue;
  configureAudio(settings);

  const reschedule = useCallback(
    (state: engine.TimerState) => {
      if (!sound) return timerAudio.cancel();
      const n = Date.now();
      timerAudio.schedule(engine.upcomingSounds(phases, state, n, 4 * 3600_000, { halfway }), engine.upcomingCues(phases, state, n, 4 * 3600_000, { halfway }), n);
    },
    [phases, sound, halfway],
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
        // Pre-scheduled sounds cover timed phase ends; a tap (Done, Skip) needs an immediate sound.
        // Start is handled in onStart; the get-ready countdown starts silently.
        if (opts.userAction && sound && next.state.status !== 'paused' && prev.state.status !== 'paused' && prev.state.status !== 'idle') {
          if (next.state.status === 'finished') {
            timerAudio.play('finish');
            timerAudio.say('done');
          } else if (p?.sound && p.kind !== 'prep') {
            timerAudio.play(soundForPhase(p));
            const cue = engine.cueForPhaseStart(p);
            if (cue) timerAudio.say(cue);
          }
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
  }, [running, settings.backgroundAudio, settings.mixWithMusic]);
  useEffect(
    () => () => {
      void keepScreenOn(false);
      timerAudio.setKeepAlive(false);
      timerAudio.cancel();
    },
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reschedule(runRef.current.state), [muted, halfway]);

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
  const started = status === 'running' || status === 'paused';

  // --- actions ---
  const act = (fn: (s: engine.TimerState, n: number) => engine.TimerState, userAction = true) => {
    timerAudio.unlock();
    const n = Date.now();
    void commit({ ...runRef.current, state: fn(runRef.current.state, n) }, { userAction });
  };
  const onStart = () => {
    timerAudio.unlock();
    act((s, n) => engine.start(phases, s, n));
    // Like SmartWOD: the get-ready countdown starts silently; the long beep marks the start of work.
    const first = phases[0];
    if (sound && first?.sound) {
      if (first.kind === 'work') timerAudio.play('work');
      const cue = engine.cueForPhaseStart(first);
      if (cue) timerAudio.say(cue);
    }
  };
  const onPause = () => act((s, n) => engine.pause(s, n), false);
  const onResume = () => act((s, n) => engine.resume(s, n), false);
  const onSkip = () => act((s, n) => engine.skip(phases, s, n));
  const onDone = () => act((s, n) => engine.complete(phases, s, n));
  const onFinish = () => {
    if (status !== 'finished' && !confirm(standalone ? 'Stop the timer now?' : 'Stop the workout now? What you did so far is saved.')) return;
    act((s, n) => engine.finish(phases, s, n));
  };
  const restart = () => {
    timerAudio.cancel();
    void commit({ sig, state: engine.reset(), applied: 0, overrides: {}, rounds: {} });
  };
  const onReset = () => {
    if (!confirm(standalone ? 'Restart the timer from the beginning?' : 'Restart the timer from the beginning? Sets already logged stay in the log.')) return;
    restart();
  };
  const close = () => {
    if (standalone) {
      // A plain timer is not kept: closing it stops it.
      if ((status === 'running' || status === 'paused') && !confirm('Stop the timer?')) return;
      clearTimerRun(session.id, blockIndexes);
      timerAudio.cancel();
      onClose();
      return;
    }
    if (status === 'running') void commit({ ...runRef.current, state: engine.pause(runRef.current.state, Date.now()) });
    if (status === 'finished' || status === 'idle') clearTimerRun(session.id, blockIndexes);
    timerAudio.cancel();
    onClose();
  };
  /** Tap on the ring: start, pause or resume. */
  const onRing = () => {
    if (status === 'idle') onStart();
    else if (status === 'running') onPause();
    else if (status === 'paused') onResume();
  };

  const setOverride = (patch: Partial<{ reps: number; weight: number }>) => {
    const idx = runRef.current.state.index;
    const next = { ...runRef.current, overrides: { ...runRef.current.overrides, [idx]: { ...runRef.current.overrides[idx], ...patch } } };
    runRef.current = next;
    setRun(next);
    saveRun(key, next);
  };
  const bi = phase?.blockIndex ?? -1;
  const roundsHere = phase ? run.rounds[bi] ?? 0 : 0;
  const lapsHere = run.laps?.[bi] ?? [];
  const lastRoundMs = lapsHere.length ? lapsHere[lapsHere.length - 1] - (lapsHere[lapsHere.length - 2] ?? 0) : null;
  const changeRounds = (delta: 1 | -1) => {
    if (!phase) return;
    const laps = [...lapsHere];
    if (delta === 1) laps.push(snap.elapsedMs);
    else laps.pop();
    const next = {
      ...runRef.current,
      rounds: { ...runRef.current.rounds, [bi]: Math.max(0, roundsHere + delta) },
      laps: { ...runRef.current.laps, [bi]: laps },
    };
    runRef.current = next;
    setRun(next);
    saveRun(key, next);
    if (delta === 1) vibrate(60);
  };

  // Keyboard shortcuts (Mac): Space start/pause, Enter done, → skip, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (showList) return;
      if (e.key === ' ') {
        e.preventDefault();
        onRing();
      } else if (e.key === 'Enter' && manual) onDone();
      else if (e.key === 'ArrowRight' && started) onSkip();
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

  const firstMain = phases.find((p) => p.kind !== 'prep') ?? phases[0];
  const shownPhase = status === 'idle' ? firstMain : phase;
  const phaseClass =
    status === 'finished' ? 'phase-done' : status === 'idle' ? 'phase-prep' : phase?.kind === 'work' ? 'phase-work' : phase?.kind === 'rest' ? 'phase-rest' : 'phase-prep';
  const clockSec = phase?.countUp || snap.remainingMs === null ? snap.elapsedMs / 1000 : Math.ceil(snap.remainingMs / 1000);
  const blockList = [...new Set(phases.map((p) => p.blockIndex))];
  const blockPos = phase ? blockList.indexOf(phase.blockIndex) + 1 : 1;
  const shownBlock = shownPhase ? session.blocks[shownPhase.blockIndex] : undefined;
  const title = shownBlock
    ? `${shownBlock.name ?? FORMAT_INFO[shownBlock.format].label}${shownPhase?.format === 'tabata' && (shownPhase.totalSets ?? 1) > 1 ? ` ${shownPhase.set} of ${shownPhase.totalSets}` : ''}`
    : 'Timer';

  const prevPhase = phases[run.state.index - 1];
  const justStarted = status === 'running' && snap.elapsedMs < 1000;
  // Ring: timed phases fill up; an open For Time redraws the symbol every minute.
  const ringProgress =
    status === 'idle' ? 0 : phase?.durationSec ? snap.progress : phase?.format === 'for_time' ? (snap.elapsedMs % 60_000) / 60_000 : 0;
  const ringKey = phase?.durationSec || phase?.format !== 'for_time' ? run.state.index : `${run.state.index}:${Math.floor(snap.elapsedMs / 60_000)}`;

  let ringContent;
  if (status === 'idle') {
    ringContent = (
      <>
        <Icon name="play" size={88} />
        <span className="ring-hint">tap to start</span>
      </>
    );
  } else if (status === 'paused') {
    ringContent = (
      <>
        <span className="ring-small num">{phase?.kind === 'prep' ? clockSec : formatClock(clockSec)}</span>
        <Icon name="pause" size={84} />
        <span className="ring-hint">tap to resume</span>
      </>
    );
  } else if (phase?.kind === 'prep') {
    ringContent = <span className="ring-count num">{clockSec}</span>;
  } else if (justStarted && phase?.kind === 'work' && prevPhase?.kind === 'prep') {
    ringContent = <span className="ring-word">GO</span>;
  } else if (justStarted && phase?.kind === 'rest' && (phase.durationSec ?? 0) > 3) {
    ringContent = <span className="ring-word">REST</span>;
  } else if (manual && phase?.format !== 'for_time') {
    ringContent = (
      <>
        <span className="ring-clock num">{formatClock(clockSec)}</span>
        <span className="ring-hint">tap Done when finished</span>
      </>
    );
  } else {
    ringContent = <span className="ring-clock num">{formatClock(clockSec)}</span>;
  }

  const target =
    phase?.kind === 'work' && (phase.targetReps || phase.toFailure || phase.targetWeight || (phase.targetDurationSec && phase.durationSec === null))
      ? [
          phase.toFailure ? `Max reps${phase.targetReps ? ` (≥ ${phase.targetReps})` : ''}` : phase.targetReps ? `${phase.targetReps} reps` : null,
          phase.targetWeight ? formatWeight(phase.targetWeight, unit) : null,
          phase.targetDurationSec && phase.durationSec === null ? `${phase.targetDurationSec}s` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  const describeNext = () => {
    if (!nextPhase) return 'Finish';
    if (nextPhase.kind === 'rest') return `${nextPhase.label} ${nextPhase.durationSec ? formatClock(nextPhase.durationSec) : ''}`;
    if (nextPhase.kind === 'prep' || nextPhase.blockIndex !== phase?.blockIndex) {
      const nb = session.blocks[nextPhase.blockIndex];
      if (nextPhase.kind === 'prep' || !nextExercise) return nb?.name ?? FORMAT_INFO[nextPhase.format].label;
    }
    const bits = [nextExercise?.name ?? nextPhase.label];
    if (nextPhase.set && nextPhase.totalSets && (nextPhase.format === 'sets_reps' || nextPhase.format === 'timed_sets')) bits.push(`set ${nextPhase.set}/${nextPhase.totalSets}`);
    if (nextPhase.drop) bits.push(`drop ${nextPhase.drop}`);
    if (nextPhase.format === 'emom' && (nextPhase.targetReps || nextPhase.toFailure || nextPhase.targetWeight)) {
      bits.push([nextPhase.toFailure ? 'max reps' : nextPhase.targetReps ? `${nextPhase.targetReps} reps` : '', nextPhase.targetWeight ? formatWeight(nextPhase.targetWeight, unit) : ''].filter(Boolean).join(' · '));
    }
    if (nextPhase.durationSec && nextPhase.format !== 'emom') bits.push(formatClock(nextPhase.durationSec));
    return bits.join(' · ');
  };

  return (
    <div className={`timer-screen ${phaseClass}`} role="dialog" aria-modal="true" aria-label="Workout timer">
      <div className="timer-top">
        <button className="btn icon ghost" onClick={close} aria-label={status === 'running' ? 'Pause and close timer' : 'Close timer'}>
          <Icon name="back" />
        </button>
        <div className="timer-title">
          <div className="ellipsis">{title}</div>
          <div className="timer-title-sub num">
            {blockList.length > 1 && `Part ${blockPos}/${blockList.length} · `}Total {formatClock(snap.totalElapsedMs / 1000)}
          </div>
        </div>
        <button className="btn icon ghost" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={muted}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
      </div>

      {status === 'finished' && standalone ? (
        <div className="timer-center">
          <div className="timer-phase-label">Well done</div>
          <div className="ring-area ring-done">
            <BrandRing progress={1} phaseKey="done" complete />
          </div>
          <div className="timer-sub">
            Total time <strong className="num" style={{ color: '#fff', fontSize: '1.6rem', marginLeft: 6 }}>{formatClock(snap.totalElapsedMs / 1000)}</strong>
          </div>
          {Object.entries(run.laps ?? {}).map(([b, laps]) =>
            laps.length ? (
              <div key={b} className="timer-sub num">
                {session.blocks[Number(b)]?.name}: {laps.length} round{laps.length === 1 ? '' : 's'}
              </div>
            ) : null,
          )}
          <div className="timer-end-actions">
            <button className="btn" onClick={restart}>
              <Icon name="reset" /> Again
            </button>
            <button className="btn primary" onClick={close}>
              <Icon name="check" /> Close
            </button>
          </div>
        </div>
      ) : status === 'finished' ? (
        <FinishedView
          session={session}
          blockIndexes={blockIndexes}
          rounds={run.rounds}
          totalSec={snap.totalElapsedMs / 1000}
          completesWorkout={!!onComplete && blockIndexes.length === session.blocks.length}
          onDone={(complete) => {
            close();
            if (complete) onComplete?.();
          }}
        />
      ) : (
        <>
          <div className="timer-center">
            <div className="timer-phase-label" aria-live="polite">
              {headingFor(shownPhase)}
            </div>
            {lastRoundMs !== null && isAmrapLike && <div className="timer-sub num">Last round {formatClock(lastRoundMs / 1000)}</div>}
            {shownPhase?.kind === 'work' && (status === 'idle' ? shownPhase.exerciseId : exercise) && (
              <div className="timer-exercise">{(status === 'idle' ? exercises.get(shownPhase.exerciseId ?? '') : exercise)?.name}</div>
            )}
            {target && <div className="timer-sub">{target}</div>}
            {phase?.kind === 'work' && phase.note && status !== 'idle' && (
              <div className="timer-sub" style={{ color: 'var(--accent)' }}>
                {phase.note}
              </div>
            )}

            <div className="ring-area">
              <BrandRing
                progress={ringProgress}
                phaseKey={ringKey}
                onClick={onRing}
                label={status === 'idle' ? 'Start timer' : status === 'running' ? 'Pause timer' : 'Resume timer'}
              >
                {ringContent}
              </BrandRing>
              {isAmrapLike && started && (
                <button className="round-counter" onClick={() => changeRounds(1)} aria-label={`Round counter: ${roundsHere}. Add a round`}>
                  <span className="round-counter-btn num">{roundsHere ? roundsHere : <Icon name="plus" size={30} />}</span>
                  <span className="round-counter-label">round counter</span>
                </button>
              )}
            </div>

            {manual && phase.format !== 'for_time' && (
              <div className="quick-log">
                <NumberField label="Reps" value={qlReps} onChange={(v) => setOverride({ reps: v })} stepper inputMode="numeric" />
                <NumberField label={`Weight (${unit})`} value={toDisplayWeight(qlWeight, unit)} onChange={(v) => setOverride({ weight: fromDisplayWeight(v, unit) })} stepper step={unit === 'kg' ? 2.5 : 5} />
              </div>
            )}
            {phase?.format === 'emom' && phase.kind === 'work' && started && (phase.entryId || phase.targetReps) && (
              <div className="quick-log" style={{ gridTemplateColumns: '1fr' }}>
                <NumberField label="Reps this interval (optional)" value={qlReps} onChange={(v) => setOverride({ reps: v })} stepper inputMode="numeric" />
              </div>
            )}
            {manual && (
              <button className="btn good block timer-done" onClick={onDone}>
                <Icon name="check" /> {phase.format === 'for_time' ? 'Finish' : 'Done'}
              </button>
            )}
            {started && (
              <div className="timer-next">
                Next: <strong>{describeNext()}</strong>
              </div>
            )}
          </div>

          <div className="timer-bottom">
            <button className="timer-show" onClick={() => setShowList(true)}>
              <Icon name="up" />
              Show workout
            </button>
            {started && (
              <div className="timer-actions">
                <button className="btn ghost small" onClick={onSkip}>
                  <Icon name="skip" /> Skip
                </button>
                <button className="btn ghost small" onClick={onReset}>
                  <Icon name="reset" /> Restart
                </button>
                <button className="btn ghost small" onClick={onFinish}>
                  <Icon name="stop" /> Stop
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Sheet open={showList} onClose={() => setShowList(false)} title="Workout">
        <WorkoutList
          phases={phases}
          current={status === 'finished' ? phases.length : status === 'idle' ? -1 : run.state.index}
          names={(p) => (p.exerciseId ? exercises.get(p.exerciseId)?.name : undefined)}
          blockName={(i) => session.blocks[i]?.name ?? FORMAT_INFO[session.blocks[i]?.format ?? 'tabata'].label}
          laps={run.laps ?? {}}
          onUndoRound={isAmrapLike && roundsHere > 0 ? () => changeRounds(-1) : undefined}
        />
      </Sheet>
    </div>
  );
}

/** The plan as a vertical list: done ✓, current ●, upcoming ○. Long phases lists are trimmed around the current one. */
function WorkoutList({
  phases,
  current,
  names,
  blockName,
  laps,
  onUndoRound,
}: {
  phases: Phase[];
  current: number;
  names: (p: Phase) => string | undefined;
  blockName: (blockIndex: number) => string;
  laps: Record<number, number[]>;
  onUndoRound?: () => void;
}) {
  const from = Math.max(0, current - 20);
  const to = Math.min(phases.length, Math.max(current, 0) + 60);
  const rows = phases.slice(from, to).map((p, k) => ({ p, i: from + k }));
  return (
    <div className="wl">
      {from > 0 && <div className="small faint">… {from} earlier steps</div>}
      {rows.map(({ p, i }) => {
        const newBlock = i === 0 || phases[i - 1].blockIndex !== p.blockIndex;
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        const lap = laps[p.blockIndex];
        return (
          <div key={i}>
            {newBlock && <div className="wl-block">{blockName(p.blockIndex)}</div>}
            <div className={`wl-row wl-${state} wl-${p.kind}`}>
              <span className="wl-dot" aria-hidden>
                {state === 'done' ? <Icon name="check" size={14} /> : null}
              </span>
              <span className="grow">
                {headingFor(p)}
                {names(p) && <span className="faint"> · {names(p)}</span>}
              </span>
              <span className="num faint">{p.durationSec ? formatClock(p.durationSec) : p.kind === 'work' ? 'open' : ''}</span>
            </div>
            {state === 'now' && lap && lap.length > 0 && (
              <div className="wl-laps">
                {lap.map((ms, r) => (
                  <div key={r} className="row between small num">
                    <span>Round {r + 1}</span>
                    <span>{formatClock((ms - (lap[r - 1] ?? 0)) / 1000)}</span>
                  </div>
                ))}
                {onUndoRound && (
                  <button className="btn small mt" onClick={onUndoRound}>
                    <Icon name="minus" /> Remove last round
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {to < phases.length && <div className="small faint">… {phases.length - to} more steps</div>}
    </div>
  );
}

type ResultEdit = { rounds?: number; reps?: number; timeSec?: number };

function FinishedView({
  session,
  blockIndexes,
  rounds,
  onDone,
  totalSec,
  completesWorkout,
}: {
  session: Session;
  blockIndexes: number[];
  rounds: Record<number, number>;
  onDone: (complete: boolean) => void;
  totalSec: number;
  completesWorkout: boolean;
}) {
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
    onDone(completesWorkout);
  };

  return (
    <div className="timer-center">
      <div className="timer-phase-label">Well done</div>
      <div className="ring-area ring-done">
        <BrandRing progress={1} phaseKey="done" complete />
      </div>
      <div className="timer-sub">
        Total time <strong className="num" style={{ color: '#fff', fontSize: '1.6rem', marginLeft: 6 }}>{formatClock(totalSec)}</strong>
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
            {b.format === 'for_time' && <NumberField label="Time (seconds)" value={v.timeSec} onChange={(x) => set({ timeSec: x })} inputMode="numeric" />}
          </div>
        );
      })}
      <p className="timer-sub">{completesWorkout ? 'The workout goes to your history; you can edit it there.' : 'Logged sets are saved in the workout. You can edit them there.'}</p>
      <button className="btn primary block" style={{ minHeight: 64, maxWidth: 520, margin: '0 auto' }} onClick={save}>
        <Icon name="check" /> {completesWorkout ? 'Save workout' : 'Save and close'}
      </button>
    </div>
  );
}
