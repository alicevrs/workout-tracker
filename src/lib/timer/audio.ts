// Timer sounds with the Web Audio API. Beeps are scheduled ahead on the audio clock, so they
// play on time even when JavaScript timers are throttled (screen locked, app in background).
// iOS only allows audio after a user gesture: call unlock() from a tap handler.

import type { ScheduledSound, SoundKind } from './engine';

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

const TONES: Record<SoundKind, { freq: number; dur: number; repeat?: number; gap?: number; step?: number }> = {
  tick: { freq: 880, dur: 0.12 },
  work: { freq: 1320, dur: 0.45 },
  rest: { freq: 660, dur: 0.16, repeat: 2, gap: 0.08 },
  finish: { freq: 990, dur: 0.18, repeat: 3, gap: 0.06, step: 1.26 },
};

class TimerAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private scheduled: OscillatorNode[] = [];
  private keepAliveNode: AudioBufferSourceNode | null = null;
  volume = 0.8;

  /** Must be called from a user gesture (tap) at least once. */
  unlock(): void {
    try {
      const nav = navigator as AudioSessionNavigator;
      // Safari 16.4+: play through the silent switch and keep playing with the screen locked.
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    // A silent buffer finishes the iOS unlock.
    const buf = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(0);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* needs a gesture */
      }
    }
  }

  private tone(kind: SoundKind, when: number) {
    if (!this.ctx || !this.gain) return;
    const t = TONES[kind];
    const repeat = t.repeat ?? 1;
    for (let i = 0; i < repeat; i++) {
      const start = when + i * (t.dur + (t.gap ?? 0));
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = kind === 'tick' ? 'sine' : 'square';
      osc.frequency.value = t.freq * Math.pow(t.step ?? 1, i);
      const peak = this.volume * (kind === 'tick' ? 0.5 : 0.35);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.01);
      env.gain.setValueAtTime(Math.max(0.0002, peak), start + t.dur - 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(env).connect(this.gain);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
      osc.onended = () => {
        this.scheduled = this.scheduled.filter((o) => o !== osc);
      };
      this.scheduled.push(osc);
    }
  }

  /** Play a sound right now. */
  play(kind: SoundKind): void {
    if (!this.ctx) return;
    this.tone(kind, this.ctx.currentTime + 0.01);
  }

  /** Replace all pending sounds with this schedule (wall-clock times in ms). */
  schedule(sounds: ScheduledSound[], now = Date.now()): void {
    this.cancel();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const base = this.ctx.currentTime;
    for (const s of sounds) {
      const offset = (s.at - now) / 1000;
      if (offset < -0.05) continue;
      this.tone(s.kind, base + Math.max(0.01, offset));
    }
  }

  cancel(): void {
    for (const osc of this.scheduled) {
      try {
        osc.onended = null;
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = [];
  }

  /** Loop near-silence so iOS keeps the audio session (and the scheduled beeps) alive in the background. */
  setKeepAlive(on: boolean): void {
    if (!this.ctx) return;
    if (on && !this.keepAliveNode) {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 1e-5;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.ctx.destination);
      src.start();
      this.keepAliveNode = src;
    } else if (!on && this.keepAliveNode) {
      try {
        this.keepAliveNode.stop();
        this.keepAliveNode.disconnect();
      } catch {
        /* ignore */
      }
      this.keepAliveNode = null;
    }
  }
}

export const timerAudio = new TimerAudio();

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (e.g. iOS Safari) */
  }
}
