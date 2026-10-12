// Timestamp-based timer state machine. It never counts ticks: every value is derived from
// wall-clock times, so the timer stays correct after the app was paused in the background
// (iOS suspends web apps when the screen locks). All functions are pure.

import type { Phase } from './phases';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface CompletedPhase {
  index: number;
  /** Active (unpaused) time spent in the phase. */
  elapsedMs: number;
  endedAt: number;
  skipped: boolean;
}

export interface TimerState {
  status: TimerStatus;
  index: number;
  /** Wall time the current phase started, shifted forward by pauses. */
  phaseStartedAt: number;
  pausedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  pausedTotalMs: number;
  completed: CompletedPhase[];
}

export function initialState(): TimerState {
  return { status: 'idle', index: 0, phaseStartedAt: 0, pausedAt: null, startedAt: null, finishedAt: null, pausedTotalMs: 0, completed: [] };
}

export function start(phases: Phase[], s: TimerState, now: number): TimerState {
  if (s.status !== 'idle' || phases.length === 0) return s;
  return { ...s, status: 'running', index: 0, phaseStartedAt: now, startedAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', pausedAt: now };
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused' || s.pausedAt === null) return s;
  const pausedMs = now - s.pausedAt;
  return { ...s, status: 'running', pausedAt: null, phaseStartedAt: s.phaseStartedAt + pausedMs, pausedTotalMs: s.pausedTotalMs + pausedMs };
}

function endPhase(phases: Phase[], s: TimerState, endedAt: number, skipped: boolean): TimerState {
  const completed = [...s.completed, { index: s.index, elapsedMs: Math.max(0, endedAt - s.phaseStartedAt), endedAt, skipped }];
  const next = s.index + 1;
  if (next >= phases.length) return { ...s, completed, status: 'finished', finishedAt: endedAt, index: phases.length - 1, pausedAt: null };
  return { ...s, completed, index: next, phaseStartedAt: endedAt };
}

/** Advance through every timed phase that has expired by `now`. Call on every tick and when the app returns to the foreground. */
export function sync(phases: Phase[], s: TimerState, now: number): TimerState {
  let state = s;
  while (state.status === 'running') {
    const phase = phases[state.index];
    if (!phase || phase.durationSec === null) break;
    const endsAt = state.phaseStartedAt + phase.durationSec * 1000;
    if (now < endsAt) break;
    state = endPhase(phases, state, endsAt, false);
  }
  return state;
}

/** User finished the current phase (Done set / Finish). */
export function complete(phases: Phase[], s: TimerState, now: number): TimerState {
  const synced = sync(phases, s, now);
  if (synced.status !== 'running' && synced.status !== 'paused') return synced;
  const at = synced.status === 'paused' && synced.pausedAt !== null ? synced.pausedAt : now;
  return endPhase(phases, synced, at, false);
}

/** Skip the current phase. A skipped work phase means a skipped set. */
export function skip(phases: Phase[], s: TimerState, now: number): TimerState {
  const synced = sync(phases, s, now);
  if (synced.status !== 'running' && synced.status !== 'paused') return synced;
  const at = synced.status === 'paused' && synced.pausedAt !== null ? synced.pausedAt : now;
  return endPhase(phases, synced, at, true);
}

/** Stop the whole run now. The current phase is recorded as completed if it is open-ended work (For Time). */
export function finish(phases: Phase[], s: TimerState, now: number): TimerState {
  const synced = sync(phases, s, now);
  if (synced.status === 'finished' || synced.status === 'idle') return { ...synced, status: 'finished', finishedAt: synced.finishedAt ?? now };
  const at = synced.status === 'paused' && synced.pausedAt !== null ? synced.pausedAt : now;
  const phase = phases[synced.index];
  const completed = [...synced.completed];
  if (phase && phase.kind === 'work' && phase.durationSec === null) {
    completed.push({ index: synced.index, elapsedMs: Math.max(0, at - synced.phaseStartedAt), endedAt: at, skipped: false });
  }
  return { ...synced, completed, status: 'finished', finishedAt: at, pausedAt: null };
}

export function reset(): TimerState {
  return initialState();
}

export interface Snapshot {
  phase: Phase | undefined;
  next: Phase | undefined;
  index: number;
  elapsedMs: number;
  /** null for open-ended phases. */
  remainingMs: number | null;
  /** 0…1 for timed phases. */
  progress: number;
  totalElapsedMs: number;
}

export function snapshot(phases: Phase[], s: TimerState, now: number): Snapshot {
  const t = s.status === 'paused' && s.pausedAt !== null ? s.pausedAt : s.status === 'finished' && s.finishedAt !== null ? s.finishedAt : now;
  const phase = phases[s.index];
  const elapsedMs = s.status === 'idle' ? 0 : s.status === 'finished' ? 0 : Math.max(0, t - s.phaseStartedAt);
  const dur = phase?.durationSec;
  const remainingMs = dur === null || dur === undefined ? null : s.status === 'finished' ? 0 : Math.max(0, dur * 1000 - elapsedMs);
  const progress = dur ? Math.min(1, elapsedMs / (dur * 1000)) : 0;
  const totalElapsedMs = s.startedAt === null ? 0 : Math.max(0, t - s.startedAt - s.pausedTotalMs);
  return { phase, next: phases[s.index + 1], index: s.index, elapsedMs, remainingMs, progress, totalElapsedMs };
}

export type SoundKind = 'tick' | 'work' | 'rest' | 'finish';

export interface ScheduledSound {
  at: number;
  kind: SoundKind;
}

/**
 * Sounds due from `now` on: a tick in each of the last 3 seconds of every timed phase and a
 * distinct sound when the next phase starts. Stops at the first open-ended phase, whose end
 * time is unknown. Used to pre-schedule audio so beeps play on time even if the page is throttled.
 */
export function upcomingSounds(phases: Phase[], s: TimerState, now: number, horizonMs = 15 * 60_000): ScheduledSound[] {
  if (s.status !== 'running') return [];
  const out: ScheduledSound[] = [];
  let start = s.phaseStartedAt;
  for (let i = s.index; i < phases.length; i++) {
    const p = phases[i];
    if (p.durationSec === null) break;
    const end = start + p.durationSec * 1000;
    if (start > now + horizonMs) break;
    if (p.sound) {
      for (const sec of [3, 2, 1]) {
        const at = end - sec * 1000;
        if (at > now && at >= start && p.durationSec > sec) out.push({ at, kind: 'tick' });
      }
      const next = phases[i + 1];
      if (end > now) out.push({ at: end, kind: !next ? 'finish' : next.kind === 'work' ? 'work' : 'rest' });
    }
    start = end;
  }
  return out;
}

/** Wall-clock time the current timed phase ends, if any. */
export function currentPhaseEndsAt(phases: Phase[], s: TimerState): number | null {
  const p = phases[s.index];
  if (!p || p.durationSec === null || s.status !== 'running') return null;
  return s.phaseStartedAt + p.durationSec * 1000;
}
