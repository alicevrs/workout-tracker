// Timer sounds with the Web Audio API. Beeps are scheduled ahead on the audio clock, so they
// play on time even when JavaScript timers are throttled (screen locked, app in background).
// iOS only allows audio after a user gesture: call unlock() from a tap handler.
//
// Sound set (modelled on gym interval timers): a low beep in each of the last 3 seconds, a long
// high beep when the next phase starts, a short chirp halfway and for interval signals.
// Music: with mixWithMusic the Safari audio session is "ambient", so Spotify & co. keep playing
// and the beeps play on top. "playback" is louder (ignores the silent switch, survives the lock
// screen better) but iOS pauses other apps' music.

import type { ScheduledSound, SoundKind } from './engine';

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

interface Tone {
  freq: number;
  dur: number;
  repeat?: number;
  gap?: number;
  step?: number;
  wave?: OscillatorType;
  level?: number;
}

const TONES: Record<SoundKind, Tone> = {
  tick: { freq: 440, dur: 0.5, wave: 'square', level: 0.3 },
  work: { freq: 1040, dur: 0.75, wave: 'square', level: 0.3 },
  rest: { freq: 1040, dur: 0.75, wave: 'square', level: 0.3 },
  finish: { freq: 1040, dur: 1.3, wave: 'square', level: 0.3 },
  half: { freq: 1400, dur: 0.1, repeat: 2, gap: 0.06, wave: 'sine', level: 0.55 },
  signal: { freq: 1400, dur: 0.12, repeat: 3, gap: 0.06, wave: 'sine', level: 0.55 },
};

class TimerAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private scheduled: OscillatorNode[] = [];
  private keepAliveNode: AudioBufferSourceNode | null = null;
  volume = 0.8;
  /** true: mix with other apps' music (ambient session). false: exclusive "playback" session. */
  mixWithMusic = true;

  private applySession(): void {
    try {
      const nav = navigator as AudioSessionNavigator;
      // Safari 16.4+. "ambient" mixes with Spotify; "playback" pauses it but ignores the silent switch.
      if (nav.audioSession) nav.audioSession.type = this.mixWithMusic ? 'ambient' : 'playback';
    } catch {
      /* not supported */
    }
  }

  setMixWithMusic(on: boolean): void {
    if (this.mixWithMusic === on) return;
    this.mixWithMusic = on;
    this.applySession();
  }

  /** Must be called from a user gesture (tap) at least once. */
  unlock(): void {
    this.applySession();
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
      osc.type = t.wave ?? 'square';
      osc.frequency.value = t.freq * Math.pow(t.step ?? 1, i);
      const peak = Math.max(0.0002, this.volume * (t.level ?? 0.3));
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      env.gain.setValueAtTime(peak, start + t.dur * 0.7);
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
    // Silent looping audio would make iOS treat the page as a music player; never with mixing.
    if (this.mixWithMusic) on = false;
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
