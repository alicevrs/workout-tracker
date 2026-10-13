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
          timerAudio.setMixWithMusic(s.mixWithMusic);
          timerAudio.unlock();
          timerAudio.volume = s.soundVolume;
          timerAudio.play('tick');
          setTimeout(() => timerAudio.play('tick'), 1000);
          setTimeout(() => timerAudio.play('tick'), 2000);
          setTimeout(() => timerAudio.play('work'), 3000);
        }}
      >
        Test sound
      </button>
      <label className="check-row">
        <input type="checkbox" checked={s.mixWithMusic} onChange={(e) => saveSettings({ mixWithMusic: e.target.checked })} />
        Play with music (Spotify, Apple Music…): the beeps play on top and your music keeps going
      </label>
      {s.mixWithMusic ? (
        <p className="small faint" style={{ margin: 0 }}>
          On iPhone the beeps then follow the Ring/Silent switch: keep it on Ring and turn the volume up. Lower the music a little in Spotify if the beeps are hard to
          hear.
        </p>
      ) : (
        <label className="check-row">
          <input type="checkbox" checked={s.backgroundAudio} onChange={(e) => saveSettings({ backgroundAudio: e.target.checked })} />
          Background audio (helps beeps play with the screen locked on iPhone; pauses other music)
        </label>
      )}
      <label className="check-row">
        <input type="checkbox" checked={s.halfwayCue} onChange={(e) => saveSettings({ halfwayCue: e.target.checked })} />
        Halfway signal (a short double beep in the middle of work periods of 20 s or more)
      </label>
      <p className="small faint">
        Sounds: three low beeps count down the last 3 seconds, a long high beep starts the next work or rest period.{' '}
        {wakeLockSupported() ? 'The screen stays on while the timer runs.' : 'This browser cannot keep the screen on; set Auto-Lock to “Never” during workouts if beeps stop.'} If the
        app is in the background or the phone is locked, the time is recalculated as soon as you return.
      </p>
    </div>
  );
}
