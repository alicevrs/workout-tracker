// Timer sounds with the Web Audio API. Beeps and voice cues are scheduled ahead on the audio
// clock, so they play on time even when JavaScript timers are throttled (screen locked, app in
// background). iOS only allows audio after a user gesture: call unlock() from a tap handler.
//
// Sound set (modelled on gym interval timers): a low beep in each of the last 3 seconds, a long
// high beep when the next phase starts, a short chirp halfway and for interval signals, plus
// optional recorded voice cues (public/voice/*.m4a). All tones are sine/triangle at matched
// loudness; each group has its own volume on top of the master volume.
// Music: with mixWithMusic the Safari audio session is "ambient", so Spotify & co. keep playing
// and the sounds play on top, but iOS mutes them on silent. "playback" ignores the silent switch
// but iOS pauses other apps' music. A web app cannot have both (see DECISIONS.md).

import { MAX_ROUND_CUE, type ScheduledCue, type ScheduledSound, type SoundKind, type VoiceCue } from './engine';

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export type SoundGroup = 'countdown' | 'start' | 'signal' | 'voice';
export type VoiceName = 'off' | 'female' | 'male';

interface Tone {
  freq: number;
  dur: number;
  repeat?: number;
  gap?: number;
  wave: OscillatorType;
  /** Matched by ear so all sounds are about equally loud at the same group volume. */
  level: number;
  group: SoundGroup;
}

const TONES: Record<SoundKind, Tone> = {
  tick: { freq: 440, dur: 0.5, wave: 'triangle', level: 0.6, group: 'countdown' },
  work: { freq: 1040, dur: 0.8, wave: 'sine', level: 0.5, group: 'start' },
  rest: { freq: 1040, dur: 0.8, wave: 'sine', level: 0.5, group: 'start' },
  finish: { freq: 1040, dur: 1.4, wave: 'sine', level: 0.5, group: 'start' },
  half: { freq: 1400, dur: 0.1, repeat: 2, gap: 0.06, wave: 'sine', level: 0.5, group: 'signal' },
  signal: { freq: 1400, dur: 0.12, repeat: 3, gap: 0.06, wave: 'sine', level: 0.5, group: 'signal' },
};

export const VOICE_CUES: VoiceCue[] = [
  'get_ready',
  'go',
  'lets_go',
  'rest',
  'set_rest',
  'halfway',
  'ten_seconds',
  'last_round',
  'done',
  ...Array.from({ length: MAX_ROUND_CUE - 1 }, (_, i) => `round_${i + 2}` as VoiceCue),
];
/** Voice starts a little after the beep of the same moment, so both are heard. */
const cueDelay = (c: VoiceCue) => (c === 'done' ? 1.3 : c === 'ten_seconds' || c === 'get_ready' ? 0 : 0.3);

interface Playing {
  node: AudioScheduledSourceNode;
  start: number;
}

class TimerAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private scheduled: Playing[] = [];
  private keepAliveNode: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  volume = 0.8;
  levels: Record<SoundGroup, number> = { countdown: 1, start: 1, signal: 1, voice: 1 };
  voice: VoiceName = 'off';
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

  setVoice(v: VoiceName): void {
    this.voice = v;
    this.loadVoice();
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
    this.loadVoice();
  }

  /** Fetch and decode the cue recordings of the chosen voice (precached, so this works offline). */
  private loadVoice(): void {
    const ctx = this.ctx;
    if (!ctx || this.voice === 'off') return;
    for (const cue of VOICE_CUES) {
      const key = `${this.voice}-${cue}`;
      if (this.buffers.has(key) || this.loading.has(key)) continue;
      this.loading.add(key);
      fetch(`${import.meta.env.BASE_URL}voice/${key}.m4a`)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((b) => this.buffers.set(key, b))
        .catch(() => undefined)
        .finally(() => this.loading.delete(key));
    }
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

  private track(node: AudioScheduledSourceNode, start: number) {
    const entry = { node, start };
    node.onended = () => {
      this.scheduled = this.scheduled.filter((p) => p !== entry);
    };
    this.scheduled.push(entry);
  }

  private tone(kind: SoundKind, when: number) {
    if (!this.ctx || !this.gain) return;
    const t = TONES[kind];
    const peak = Math.max(0.0002, this.volume * this.levels[t.group] * t.level);
    if (peak <= 0.0002) return;
    for (let i = 0; i < (t.repeat ?? 1); i++) {
      const start = when + i * (t.dur + (t.gap ?? 0));
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = t.wave;
      osc.frequency.value = t.freq;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      env.gain.setValueAtTime(peak, start + t.dur * 0.75);
      env.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(env).connect(this.gain);
      osc.start(start);
      osc.stop(start + t.dur + 0.03);
      this.track(osc, start);
    }
  }

  private speak(cue: VoiceCue, when: number) {
    if (!this.ctx || !this.gain || this.voice === 'off') return;
    const buf = this.buffers.get(`${this.voice}-${cue}`);
    if (!buf) return;
    const level = this.volume * this.levels.voice;
    if (level <= 0) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = Math.min(2, level * 1.4);
    src.connect(g).connect(this.gain);
    src.start(when);
    this.track(src, when);
  }

  /** Play a sound right now. */
  play(kind: SoundKind): void {
    if (!this.ctx) return;
    this.tone(kind, this.ctx.currentTime + 0.01);
  }

  /** Say a cue right now. */
  say(cue: VoiceCue): void {
    if (!this.ctx) return;
    this.speak(cue, this.ctx.currentTime + 0.01);
  }

  /** Replace all pending sounds with this schedule (wall-clock times in ms). Sounds already playing finish. */
  schedule(sounds: ScheduledSound[], cues: ScheduledCue[] = [], now = Date.now()): void {
    this.cancel(false);
    if (!this.ctx || this.ctx.state !== 'running') return;
    const base = this.ctx.currentTime;
    for (const s of sounds) {
      const offset = (s.at - now) / 1000;
      if (offset < -0.05) continue;
      this.tone(s.kind, base + Math.max(0.01, offset));
    }
    for (const c of cues) {
      const offset = (c.at - now) / 1000 + cueDelay(c.cue);
      if (offset < -0.05) continue;
      this.speak(c.cue, base + Math.max(0.01, offset));
    }
  }

  /**
   * Stop scheduled sounds. By default a sound that has already started keeps playing to the end
   * (a phase change reschedules right when its beep starts; cutting it made the beep sound clipped).
   */
  cancel(all = true): void {
    const t = this.ctx?.currentTime ?? 0;
    const keep: Playing[] = [];
    for (const p of this.scheduled) {
      if (!all && p.start <= t + 0.02) {
        keep.push(p);
        continue;
      }
      try {
        p.node.onended = null;
        p.node.stop();
        p.node.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = keep;
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

/** Apply the user's sound settings (volume, per-group levels, voice, music mixing). */
export function configureAudio(s: { soundVolume: number; soundLevels: Record<SoundGroup, number>; voice: VoiceName; mixWithMusic: boolean }): void {
  timerAudio.volume = s.soundVolume;
  timerAudio.levels = { ...s.soundLevels };
  timerAudio.setMixWithMusic(s.mixWithMusic);
  if (timerAudio.voice !== s.voice) timerAudio.setVoice(s.voice);
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (e.g. iOS Safari) */
  }
}
