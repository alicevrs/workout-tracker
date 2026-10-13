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

export type SoundKind = 'tick' | 'work' | 'rest' | 'finish' | 'half' | 'signal';

export interface ScheduledSound {
  at: number;
  kind: SoundKind;
}

export interface SoundOptions {
  /** Short signal halfway through timed work phases of 20 s or more. */
  halfway?: boolean;
}

/**
 * Sounds due from `now` on: a low beep in each of the last 3 seconds of every timed phase and a
 * long high beep when the next phase starts (optionally a short signal halfway through work).
 * Open-ended phases have no known end, so scheduling stops there (after their interval signals).
 * Used to pre-schedule audio so beeps play on time even if the page is throttled.
 */
export function upcomingSounds(phases: Phase[], s: TimerState, now: number, horizonMs = 15 * 60_000, opts: SoundOptions = {}): ScheduledSound[] {
  if (s.status !== 'running') return [];
  const out: ScheduledSound[] = [];
  const push = (at: number, kind: SoundKind) => {
    if (at > now && at <= now + horizonMs) out.push({ at, kind });
  };
  let start = s.phaseStartedAt;
  for (let i = s.index; i < phases.length; i++) {
    const p = phases[i];
    if (start > now + horizonMs) break;
    if (p.sound && p.signalEverySec && p.signalEverySec > 0) {
      const every = p.signalEverySec * 1000;
      const limit = p.durationSec === null ? now + horizonMs : start + p.durationSec * 1000 - 3000;
      for (let at = start + every; at < limit; at += every) push(at, 'signal');
    }
    if (p.durationSec === null) break;
    const end = start + p.durationSec * 1000;
    if (p.sound) {
      if (opts.halfway && p.kind === 'work' && p.durationSec >= 20) push(start + (p.durationSec * 1000) / 2, 'half');
      for (const sec of [3, 2, 1]) {
        const at = end - sec * 1000;
        if (at >= start && p.durationSec > sec) push(at, 'tick');
      }
      const next = phases[i + 1];
      push(end, !next ? 'finish' : next.kind === 'work' ? 'work' : 'rest');
    }
    start = end;
  }
  return out.sort((a, b) => a.at - b.at);
}

export type VoiceCue = 'get_ready' | 'go' | 'rest' | 'halfway' | 'ten_seconds' | 'last_round' | 'done';

export interface ScheduledCue {
  at: number;
  cue: VoiceCue;
}

/** The spoken cue when phase `p` starts. */
export function cueForPhaseStart(p: Phase): VoiceCue | null {
  if (p.kind === 'prep') return p.durationSec !== null && p.durationSec >= 3 ? 'get_ready' : null;
  if (p.kind === 'rest') return 'rest';
  const lastRound = (p.format === 'tabata' || p.format === 'intervals') && p.round && p.totalRounds && p.totalRounds > 1 && p.round === p.totalRounds && (p.set ?? 1) === (p.totalSets ?? 1);
  return lastRound ? 'last_round' : 'go';
}

/**
 * Voice cues due from `now` on, like upcomingSounds: what starts next (Go / Rest / Last round /
 * Get ready), “Halfway” and “Ten seconds” during longer work, and “Workout complete” at the end.
 */
export function upcomingCues(phases: Phase[], s: TimerState, now: number, horizonMs = 15 * 60_000, opts: SoundOptions = {}): ScheduledCue[] {
  if (s.status !== 'running') return [];
  const out: ScheduledCue[] = [];
  const push = (at: number, cue: VoiceCue | null) => {
    if (cue && at > now && at <= now + horizonMs) out.push({ at, cue });
  };
  let start = s.phaseStartedAt;
  for (let i = s.index; i < phases.length; i++) {
    const p = phases[i];
    if (start > now + horizonMs || p.durationSec === null) break;
    const end = start + p.durationSec * 1000;
    if (p.sound) {
      if (p.kind === 'work' && opts.halfway && p.durationSec >= 20) push(start + (p.durationSec * 1000) / 2, 'halfway');
      if (p.kind === 'work' && p.durationSec >= 30) push(end - 10_000, 'ten_seconds');
      const next = phases[i + 1];
      push(end, next ? cueForPhaseStart(next) : 'done');
    }
    start = end;
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Wall-clock time the current timed phase ends, if any. */
export function currentPhaseEndsAt(phases: Phase[], s: TimerState): number | null {
  const p = phases[s.index];
  if (!p || p.durationSec === null || s.status !== 'running') return null;
  return s.phaseStartedAt + p.durationSec * 1000;
}
