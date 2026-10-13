import { saveSettings, useSettings } from '../db/repo';
import type { Settings } from '../db/types';
import { configureAudio, timerAudio, type SoundGroup } from '../lib/timer/audio';
import { wakeLockSupported } from '../lib/timer/wakeLock';
import { Segmented } from './ui';

const GROUPS: { key: SoundGroup; label: string; test: () => void }[] = [
  {
    key: 'countdown',
    label: 'Countdown beeps (last 3 seconds)',
    test: () => [0, 1000, 2000].forEach((ms) => setTimeout(() => timerAudio.play('tick'), ms)),
  },
  { key: 'start', label: 'Start of work / rest and end', test: () => timerAudio.play('work') },
  { key: 'signal', label: 'Halfway and interval signals', test: () => timerAudio.play('half') },
  { key: 'voice', label: 'Voice', test: () => timerAudio.say('go') },
];

function Slider({ label, value, onChange, onTest }: { label: string; value: number; onChange: (v: number) => void; onTest: () => void }) {
  return (
    <div>
      <div className="row between" style={{ gap: 10 }}>
        <span className="small">
          {label}: <strong className="num">{Math.round(value * 100)}%</strong>
        </span>
        <button className="btn small" onClick={onTest}>
          Test
        </button>
      </div>
      <input type="range" aria-label={label} min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', minHeight: 0, padding: 0 }} />
    </div>
  );
}

export function TimerSettings() {
  const s = useSettings();
  const prepare = (next: Settings = s) => {
    configureAudio(next);
    timerAudio.unlock();
  };
  const save = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    configureAudio(next);
    void saveSettings(patch);
  };
  return (
    <div className="stack">
      <Slider
        label="Overall volume"
        value={s.soundVolume}
        onChange={(v) => save({ soundVolume: v })}
        onTest={() => {
          prepare();
          GROUPS[0].test();
          setTimeout(() => timerAudio.play('work'), 3000);
        }}
      />
      {GROUPS.map((g) => (
        <Slider
          key={g.key}
          label={g.label}
          value={s.soundLevels[g.key]}
          onChange={(v) => save({ soundLevels: { ...s.soundLevels, [g.key]: v } })}
          onTest={() => {
            prepare();
            // The voice recordings load on the first tap; give them a moment.
            setTimeout(g.test, g.key === 'voice' ? 400 : 0);
          }}
        />
      ))}

      <div className="field">
        Voice guide (Get ready, Go, Rest, Halfway, Ten seconds, Last round)
        <Segmented
          label="Voice guide"
          value={s.voice}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
          onChange={(v) => save({ voice: v })}
        />
      </div>

      <label className="check-row">
        <input type="checkbox" checked={s.halfwayCue} onChange={(e) => save({ halfwayCue: e.target.checked })} />
        Halfway signal (in work periods of 20 s or more)
      </label>

      <label className="check-row">
        <input type="checkbox" checked={s.mixWithMusic} onChange={(e) => save({ mixWithMusic: e.target.checked })} />
        Play with music (Spotify, Apple Music…)
      </label>
      {s.mixWithMusic ? (
        <p className="small faint" style={{ margin: 0 }}>
          Your music keeps playing and the timer sounds play on top. On iPhone they are silent when the phone is on silent mode: switch the Ring/Silent switch to Ring while you
          train.
        </p>
      ) : (
        <>
          <p className="small faint" style={{ margin: 0 }}>
            The timer sounds also play in silent mode, but iPhone pauses other music while the timer runs.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={s.backgroundAudio} onChange={(e) => save({ backgroundAudio: e.target.checked })} />
            Background audio (helps sounds play with the screen locked)
          </label>
        </>
      )}
      <p className="small faint">
        {wakeLockSupported() ? 'The screen stays on while the timer runs.' : 'This browser cannot keep the screen on; set Auto-Lock to “Never” during workouts if beeps stop.'} If the
        app is in the background or the phone is locked, the time is recalculated as soon as you return.
      </p>
    </div>
  );
}
