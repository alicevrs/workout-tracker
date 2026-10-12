import { saveSettings, useSettings } from '../db/repo';
import { timerAudio } from '../lib/timer/audio';
import { wakeLockSupported } from '../lib/timer/wakeLock';

export function TimerSettings() {
  const s = useSettings();
  return (
    <div className="stack">
      <label className="field">
        Beep volume: {Math.round(s.soundVolume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.soundVolume}
          onChange={(e) => saveSettings({ soundVolume: Number(e.target.value) })}
          style={{ minHeight: 0, padding: 0 }}
        />
      </label>
      <button
        className="btn small"
        onClick={() => {
          timerAudio.unlock();
          timerAudio.volume = s.soundVolume;
          timerAudio.play('tick');
          setTimeout(() => timerAudio.play('work'), 400);
        }}
      >
        Test sound
      </button>
      <label className="check-row">
        <input type="checkbox" checked={s.backgroundAudio} onChange={(e) => saveSettings({ backgroundAudio: e.target.checked })} />
        Background audio (helps beeps play with the screen locked on iPhone)
      </label>
      <p className="small faint">
        {wakeLockSupported() ? 'The screen stays on while the timer runs.' : 'This browser cannot keep the screen on; set Auto-Lock to “Never” during workouts if beeps stop.'} If the
        app is in the background or the phone is locked, the time is recalculated as soon as you return.
      </p>
    </div>
  );
}
