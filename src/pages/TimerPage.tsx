import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Pick, TimerFields } from '../components/TimerFields';
import { clearTimerRun, hasActiveRun, TimerScreen } from '../components/TimerScreen';
import { PageHeader, Sheet } from '../components/ui';
import { useProfile } from '../db/repo';
import type { Session } from '../db/types';
import { blockToPerformed, createSession } from '../lib/session';
import { timerAudio } from '../lib/timer/audio';
import { useDragReorder } from '../hooks/useDragReorder';
import {
  defaultMix,
  defaultQuick,
  describeQuick,
  PREP_OPTIONS,
  QUICK_LABEL,
  quickBlocks,
  quickClock,
  quickSeconds,
  SET_OPTIONS,
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
              <button className="qt-card-main" onClick={() => setMode(m)} aria-label={`${QUICK_LABEL[m]}: ${TIMER_INFO[m].tagline}`}>
                {QUICK_LABEL[m]}
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

const MIX_ADD: MixItemKind[] = ['amrap', 'emom', 'tabata', 'for_time', 'work', 'rest'];

function MixEditor({ mix, onChange }: { mix: MixConfig; onChange: (m: MixConfig) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mixRef = useRef(mix);
  mixRef.current = mix;

  const setItems = (items: QuickTimer[]) => onChange({ ...mixRef.current, items });
  const swap = (i: number, j: number) => {
    const items = [...mixRef.current.items];
    [items[i], items[j]] = [items[j], items[i]];
    mixRef.current = { ...mixRef.current, items };
    onChange(mixRef.current);
  };
  const { drag, handle, rowStyle, wasDragged } = useDragReorder(listRef, mix.items.length, swap, () => setOpen(null));

  return (
    <div className="stack">
      <p className="sentence-lead" style={{ marginBottom: 0 }}>
        Chain timers into one flow
      </p>
      <p className="tiny faint" style={{ textAlign: 'center', margin: 0 }}>
        {mix.items.length ? 'Tap to edit · hold and drag to reorder' : 'Add a timer, work or rest below.'}
      </p>
      <div className="mix-list" ref={listRef}>
        {mix.items.map((q, i) => {
          const dragging = drag?.index === i;
          return (
            <div key={i} data-drag-index={i} className={`mix-row${dragging ? ' dragging' : ''}`} style={rowStyle(i)}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open === i}
                className={`mix-pill mix-${q.kind}`}
                {...handle(i)}
                onClick={() => !wasDragged() && setOpen(open === i ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(open === i ? null : i);
                  } else if (e.altKey && e.key === 'ArrowUp' && i > 0) swap(i, i - 1);
                  else if (e.altKey && e.key === 'ArrowDown' && i < mix.items.length - 1) swap(i, i + 1);
                }}
              >
                <span className="mix-pill-text">
                  <span className="mix-pill-name">{q.kind === 'work' && q.label ? q.label : QUICK_LABEL[q.kind]}</span>
                  <span className="mix-pill-desc">{describeQuick(q)}</span>
                </span>
                <button
                  className="mix-pill-x"
                  aria-label="Remove"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setItems(mix.items.filter((_, k) => k !== i));
                    setOpen(null);
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
              {open === i && (
                <div className="mix-fields">
                  <TimerFields compact q={q} onChange={(n) => setItems(mix.items.map((x, k) => (k === i ? n : x)))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
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
