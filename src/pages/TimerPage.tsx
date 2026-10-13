import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { clearTimerRun, hasActiveRun, TimerScreen } from '../components/TimerScreen';
import { PageHeader, Sheet } from '../components/ui';
import { useProfile } from '../db/repo';
import type { Session } from '../db/types';
import { blockToPerformed, createSession } from '../lib/session';
import { timerAudio } from '../lib/timer/audio';
import {
  defaultMix,
  defaultQuick,
  describeQuick,
  EVERY_OPTIONS,
  MINUTE_OPTIONS,
  PREP_OPTIONS,
  QUICK_LABEL,
  quickBlocks,
  quickClock,
  quickSeconds,
  REST_OPTIONS,
  ROUND_OPTIONS,
  SECOND_OPTIONS,
  SET_OPTIONS,
  SIGNAL_OPTIONS,
  TIMER_INFO,
  type MixConfig,
  type MixItemKind,
  type QuickKind,
  type QuickTimer,
} from '../lib/timer/quick';

type Mode = QuickKind | 'mix';
const MODES: Mode[] = ['amrap', 'for_time', 'emom', 'tabata', 'mix'];

interface Saved {
  timers: Partial<Record<QuickKind, QuickTimer>>;
  mix?: MixConfig;
  prepSec?: number;
}

// Last-used settings per format: a per-device convenience, so it lives in localStorage.
const STORE = 'quickTimers:v1';
function loadSaved(): Saved {
  try {
    return { timers: {}, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Saved>) };
  } catch {
    return { timers: {} };
  }
}
// The running quick timer is not a logged workout: it lives in memory (and here, so a reload can resume it).
const ACTIVE = 'quickTimer:active';
function loadActive(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(ACTIVE) ?? 'null') as Session | null;
    return s && hasActiveRun(s.id) ? s : null;
  } catch {
    return null;
  }
}
function storeActive(s: Session | null) {
  try {
    if (s) localStorage.setItem(ACTIVE, JSON.stringify(s));
    else localStorage.removeItem(ACTIVE);
  } catch {
    /* ignore */
  }
}

function storeSaved(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* private mode: settings are just not remembered */
  }
}

export default function TimerPage() {
  const profile = useProfile();
  const [mode, setMode] = useState<Mode | null>(null);
  const [info, setInfo] = useState<Mode | null>(null);
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [running, setRunning] = useState<Session | null>(loadActive);

  const update = (patch: Partial<Saved>) => {
    const next = { ...saved, ...patch };
    setSaved(next);
    storeSaved(next);
  };
  const prepSec = saved.prepSec ?? profile.defaultPrepSec;
  const timer = (k: QuickKind) => ({ ...defaultQuick(k), ...saved.timers[k] });
  const mix = saved.mix ?? defaultMix();

  const items: QuickTimer[] = mode === 'mix' ? mix.items : mode ? [timer(mode)] : [];
  const blocks = quickBlocks(items, prepSec, mode === 'mix' ? mix.repeat : 1);
  const total = quickSeconds(blocks);

  const start = () => {
    if (!mode || !blocks.length) return;
    timerAudio.unlock(); // inside the tap, so iOS allows sound
    const s = createSession({ title: `${QUICK_LABEL[mode]} timer` });
    s.blocks = blocks.map(blockToPerformed);
    storeActive(s);
    setRunning(s);
  };
  const stop = () => {
    if (running) clearTimerRun(running.id, running.blocks.map((_, i) => i));
    storeActive(null);
    setRunning(null);
  };

  if (running) return <TimerScreen standalone session={running} blockIndexes={running.blocks.map((_, i) => i)} onClose={stop} />;

  if (mode) {
    return (
      <div className="page qt-page">
        <div className="qt-head">
          <button className="btn icon ghost" onClick={() => setMode(null)} aria-label="Back to timers">
            <Icon name="back" />
          </button>
          <h1 className="qt-title">{QUICK_LABEL[mode]}</h1>
          <button className="btn icon ghost" onClick={() => setInfo(mode)} aria-label={`How ${QUICK_LABEL[mode]} works`}>
            <Icon name="info" />
          </button>
        </div>

        <div className="qt-body">
          {mode === 'mix' ? (
            <MixEditor mix={mix} onChange={(m) => update({ mix: m })} />
          ) : (
            <TimerFields q={timer(mode)} onChange={(q) => update({ timers: { ...saved.timers, [mode]: q } })} />
          )}
          <div className="qt-prep">
            Get ready
            <Pick small value={prepSec} options={PREP_OPTIONS} format={(v) => (v ? `${v} s` : 'none')} onChange={(v) => update({ prepSec: v })} label="Get ready countdown" />
          </div>
        </div>

        <button className="btn primary block qt-start" onClick={start} disabled={!blocks.length}>
          <span>Start timer</span>
          <small className="num">{total === null ? 'Open-ended' : `Total time ${quickClock(total)}`}</small>
        </button>

        <InfoSheet mode={info} onClose={() => setInfo(null)} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Timer" subtitle="Pick a format, set it, go." />
      <div className="qt-home">
        <section className="qt-list" aria-label="Timer formats">
          {MODES.map((m) => (
            <div key={m} className={`qt-card qt-${m}`}>
              <button className="qt-card-main" onClick={() => setMode(m)}>
                <span className="qt-card-title">{QUICK_LABEL[m]}</span>
                <span className="qt-card-sub">{TIMER_INFO[m].tagline}</span>
              </button>
              <button className="qt-card-info" onClick={() => setInfo(m)} aria-label={`How ${QUICK_LABEL[m]} works`}>
                <Icon name="info" />
              </button>
            </div>
          ))}
        </section>

      </div>
      <InfoSheet mode={info} onClose={() => setInfo(null)} />
    </div>
  );
}

function InfoSheet({ mode, onClose }: { mode: Mode | null; onClose: () => void }) {
  return (
    <Sheet open={mode !== null} onClose={onClose} title={mode ? `How ${QUICK_LABEL[mode]} works` : ''}>
      {mode && (
        <div className="stack">
          <p className="qt-info-tag">{TIMER_INFO[mode].tagline}</p>
          {TIMER_INFO[mode].text.map((t, i) => (
            <p key={i} style={{ margin: 0 }}>
              {t}
            </p>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** A big boxed value; tapping it opens the native picker (a wheel on iPhone). */
function Pick({ value, options, format, onChange, label, small }: { value: number; options: number[]; format: (v: number) => string; onChange: (v: number) => void; label: string; small?: boolean }) {
  const opts = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className={`vbox${small ? ' small' : ''}`}>
      <span className="vbox-value num">{format(value)}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

const secs = (v: number) => quickClock(v);
const mins = (v: number) => `${v}`;

function Line({ children }: { children: ReactNode }) {
  return <div className="sentence">{children}</div>;
}

/** The big “sentence” settings of one timer. `compact` is used inside the Mix list. */
function TimerFields({ q, onChange, compact }: { q: QuickTimer; onChange: (q: QuickTimer) => void; compact?: boolean }) {
  const set = (patch: Partial<QuickTimer>) => onChange({ ...q, ...patch });
  const hasSets = (q.sets ?? 1) > 1;
  let fields: ReactNode = null;
  switch (q.kind) {
    case 'amrap':
      fields = (
        <>
          {!compact && <p className="sentence-lead">As many rounds as possible in</p>}
          <Line>
            <Pick value={q.minutes ?? 10} options={MINUTE_OPTIONS} format={mins} onChange={(v) => set({ minutes: v })} label="Minutes" small={compact} />
            <span>minutes</span>
          </Line>
        </>
      );
      break;
    case 'for_time':
      fields = (
        <>
          {!compact && <p className="sentence-lead">As fast as possible, for time</p>}
          <Line>
            <span>Time cap</span>
            <Pick value={q.minutes ?? 0} options={[0, ...MINUTE_OPTIONS]} format={(v) => (v ? `${v} min` : 'none')} onChange={(v) => set({ minutes: v })} label="Time cap" small={compact} />
          </Line>
          <Line>
            <span>Signal every</span>
            <Pick value={q.everySec ?? 0} options={SIGNAL_OPTIONS} format={(v) => (v ? `${v / 60} min` : 'off')} onChange={(v) => set({ everySec: v })} label="Signal every" small={compact} />
          </Line>
        </>
      );
      break;
    case 'emom': {
      const count = Math.floor(((q.minutes ?? 10) * 60) / (q.everySec ?? 60));
      fields = (
        <>
          <Line>
            <span>Every</span>
            <Pick value={q.everySec ?? 60} options={EVERY_OPTIONS} format={secs} onChange={(v) => set({ everySec: v })} label="Every" small={compact} />
          </Line>
          <Line>
            <span>for</span>
            <Pick value={q.minutes ?? 10} options={MINUTE_OPTIONS} format={mins} onChange={(v) => set({ minutes: v })} label="For minutes" small={compact} />
            <span>min</span>
          </Line>
          {!compact && <p className="sentence-note">{count} interval{count === 1 ? '' : 's'}</p>}
        </>
      );
      break;
    }
    case 'tabata':
      fields = (
        <>
          {!compact && <p className="sentence-lead">Set your Tabata</p>}
          <Line>
            <Pick value={q.rounds ?? 8} options={ROUND_OPTIONS} format={mins} onChange={(v) => set({ rounds: v })} label="Rounds" small={compact} />
            <span>Rounds</span>
          </Line>
          <Line>
            <Pick value={q.workSec ?? 20} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ workSec: v })} label="Work" small={compact} />
            <span>Work</span>
          </Line>
          <Line>
            <Pick value={q.restSec ?? 10} options={REST_OPTIONS} format={secs} onChange={(v) => set({ restSec: v })} label="Rest" small={compact} />
            <span>Rest</span>
          </Line>
        </>
      );
      break;
    case 'work':
      fields = (
        <Line>
          <Pick value={q.workSec ?? 60} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ workSec: v })} label="Work time" small={compact} />
          <input className="mix-label" value={q.label ?? ''} placeholder="Label, e.g. Plank" onChange={(e) => set({ label: e.target.value })} aria-label="Label" />
        </Line>
      );
      break;
    case 'rest':
      fields = (
        <Line>
          <Pick value={q.restSec ?? 60} options={SECOND_OPTIONS} format={secs} onChange={(v) => set({ restSec: v })} label="Rest time" small={compact} />
          <span>Rest</span>
        </Line>
      );
      break;
  }
  if (q.kind === 'work' || q.kind === 'rest') return <div className="sentences">{fields}</div>;
  return (
    <div className="sentences">
      {fields}
      {hasSets ? (
        <div className="sets-box">
          <button className="btn icon ghost small sets-remove" onClick={() => set({ sets: 1 })} aria-label="Remove sets">
            <Icon name="x" />
          </button>
          <Line>
            <Pick value={q.sets ?? 2} options={SET_OPTIONS.slice(1)} format={mins} onChange={(v) => set({ sets: v })} label="Sets" small={compact} />
            <span>Sets</span>
          </Line>
          <Line>
            <Pick value={q.setRestSec ?? 60} options={REST_OPTIONS} format={secs} onChange={(v) => set({ setRestSec: v })} label="Rest between sets" small={compact} />
            <span>Rest</span>
          </Line>
        </div>
      ) : (
        <button className="btn ghost small add-sets" onClick={() => set({ sets: 2 })}>
          <Icon name="plus" /> Add sets (optional)
        </button>
      )}
    </div>
  );
}

const MIX_ADD: MixItemKind[] = ['amrap', 'emom', 'tabata', 'for_time', 'work', 'rest'];

function MixEditor({ mix, onChange }: { mix: MixConfig; onChange: (m: MixConfig) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const setItems = (items: QuickTimer[]) => onChange({ ...mix, items });
  const move = (i: number, d: -1 | 1) => {
    const items = [...mix.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setItems(items);
    setOpen(null);
  };
  return (
    <div className="stack">
      <p className="sentence-lead" style={{ marginBottom: 0 }}>
        Chain timers into one flow
      </p>
      {mix.items.length === 0 && <p className="small muted">Add a timer, work or rest below.</p>}
      {mix.items.map((q, i) => (
        <div key={i} className={`mix-item mix-${q.kind}`}>
          <div className="row">
            <button className="mix-item-main grow" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <strong>{q.kind === 'work' && q.label ? q.label : QUICK_LABEL[q.kind]}</strong>
              <span className="small faint">{describeQuick(q)}</span>
            </button>
            <button className="btn icon small ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
              <Icon name="up" />
            </button>
            <button className="btn icon small ghost" onClick={() => move(i, 1)} disabled={i === mix.items.length - 1} aria-label="Move down">
              <Icon name="down" />
            </button>
            <button
              className="btn icon small ghost"
              onClick={() => {
                setItems(mix.items.filter((_, k) => k !== i));
                setOpen(null);
              }}
              aria-label="Remove"
            >
              <Icon name="trash" />
            </button>
          </div>
          {open === i && <TimerFields compact q={q} onChange={(n) => setItems(mix.items.map((x, k) => (k === i ? n : x)))} />}
        </div>
      ))}
      <div className="mix-add">
        {MIX_ADD.map((k) => (
          <button
            key={k}
            className="btn small"
            onClick={() => {
              setItems([...mix.items, defaultQuick(k)]);
              setOpen(mix.items.length);
            }}
          >
            <Icon name="plus" /> {QUICK_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="sentences mix-repeat">
        <div className="sentence">
          <span>Repeat</span>
          <Pick value={mix.repeat} options={SET_OPTIONS} format={(v) => `${v}×`} onChange={(v) => onChange({ ...mix, repeat: v })} label="Repeat the whole flow" small />
          <span>{mix.repeat === 1 ? 'once' : 'times'}</span>
        </div>
      </div>
    </div>
  );
}
