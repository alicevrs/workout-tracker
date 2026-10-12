import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlockEditor } from '../components/BlockEditor';
import { Icon } from '../components/Icon';
import { EmptyState, NumberField, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat, Program, ProgramDay } from '../db/types';
import { formatDuration } from '../lib/dates';
import { cloneBlock, cloneDay, cloneProgram, describeBlock, estimateBlockSeconds, FORMAT_INFO, FORMATS, newBlock, newDay, WEEKDAYS } from '../lib/program';
import { createSession } from '../lib/session';

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export default function ProgramEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Program | null>(null);

  useEffect(() => {
    db.programs.get(id).then((p) => setProgram(p ?? null));
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      const p = pending.current;
      pending.current = null;
      await db.programs.put(p);
    }
  }, []);

  useEffect(() => () => void flush(), [flush]);

  const update = (p: Program) => {
    const next = { ...p, updatedAt: Date.now() };
    setProgram(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };

  if (program === undefined) return <div className="page" />;
  if (program === null)
    return (
      <div className="page">
        <PageHeader title="Program" back="/programs" />
        <EmptyState title="Program not found" />
      </div>
    );

  const setDay = (dayId: string, patch: Partial<ProgramDay>) =>
    update({ ...program, days: program.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) });

  const duplicateProgram = async () => {
    await flush();
    const copy = cloneProgram(program);
    await db.programs.add(copy);
    toast('Program duplicated');
    navigate(`/programs/${copy.id}`);
  };

  const deleteProgram = async () => {
    if (!confirm(`Delete “${program.name}”? Logged sessions are kept.`)) return;
    pending.current = null;
    await db.programs.delete(program.id);
    navigate('/programs');
  };

  return (
    <div className="page">
      <PageHeader
        title={program.name || 'Program'}
        back="/programs"
        actions={
          <button className="btn" onClick={duplicateProgram}>
            <Icon name="copy" /> Duplicate
          </button>
        }
      />
      <div className="stack">
        <section className="card form-grid">
          <label className="field full">
            Program name
            <input value={program.name} onChange={(e) => update({ ...program, name: e.target.value })} />
          </label>
          <NumberField label="Weeks" suffix="optional" value={program.weeks} onChange={(v) => update({ ...program, weeks: v })} inputMode="numeric" />
          <label className="field">
            Notes
            <input value={program.notes ?? ''} onChange={(e) => update({ ...program, notes: e.target.value || undefined })} />
          </label>
        </section>

        {program.days.map((day, i) => (
          <DayEditor
            key={day.id}
            day={day}
            index={i}
            count={program.days.length}
            onChange={(patch) => setDay(day.id, patch)}
            onMove={(dir) => update({ ...program, days: move(program.days, i, dir) })}
            onDuplicate={() => {
              const days = [...program.days];
              days.splice(i + 1, 0, cloneDay(day));
              update({ ...program, days });
            }}
            onDelete={() => {
              if (confirm(`Delete day “${day.name}”?`)) update({ ...program, days: program.days.filter((d) => d.id !== day.id) });
            }}
            onStart={async () => {
              await flush();
              const session = createSession({ program, day });
              await db.sessions.add(session);
              navigate(`/workout/${session.id}`);
            }}
          />
        ))}

        <button className="btn block" onClick={() => update({ ...program, days: [...program.days, newDay(`Day ${program.days.length + 1}`)] })}>
          <Icon name="plus" /> Add day
        </button>
        <button className="btn danger mt" onClick={deleteProgram}>
          <Icon name="trash" /> Delete program
        </button>
      </div>
    </div>
  );
}

function DayEditor({
  day,
  index,
  count,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onStart,
}: {
  day: ProgramDay;
  index: number;
  count: number;
  onChange: (patch: Partial<ProgramDay>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStart: () => void;
}) {
  const profile = useProfile();
  const exercises = useExerciseMap();
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<BlockFormat>('sets_reps');
  const setBlock = (b: Block) => onChange({ blocks: day.blocks.map((x) => (x.id === b.id ? b : x)) });
  const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);

  return (
    <section className="card" aria-label={day.name}>
      <div className="form-grid">
        <label className="field">
          Day name
          <input value={day.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="field">
          Weekday
          <select value={day.weekday ?? ''} onChange={(e) => onChange({ weekday: e.target.value === '' ? undefined : Number(e.target.value) })}>
            <option value="">Any day</option>
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row wrap mt-s">
        <button className="btn primary small" onClick={onStart} disabled={day.blocks.length === 0}>
          <Icon name="play" /> Start workout
        </button>
        {total > 0 && <span className="small muted">≈ {formatDuration(total)}</span>}
        <span className="spacer" />
        <button className="btn icon small ghost" aria-label="Move day up" onClick={() => onMove(-1)} disabled={index === 0}>
          <Icon name="up" />
        </button>
        <button className="btn icon small ghost" aria-label="Move day down" onClick={() => onMove(1)} disabled={index === count - 1}>
          <Icon name="down" />
        </button>
        <button className="btn icon small ghost" aria-label="Duplicate day" onClick={onDuplicate}>
          <Icon name="copy" />
        </button>
        <button className="btn icon small ghost" aria-label="Delete day" onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>

      <div className="mt">
        {day.blocks.map((b, bi) => {
          const open = openBlock === b.id;
          return (
            <div key={b.id} className="card block-card" style={{ background: 'var(--bg-elev-2)', marginTop: 10 }}>
              <div className="row">
                <button
                  className="btn ghost"
                  style={{ flex: 1, justifyContent: 'flex-start', padding: 0, minWidth: 0, textAlign: 'left', whiteSpace: 'normal' }}
                  aria-expanded={open}
                  onClick={() => setOpenBlock(open ? null : b.id)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="chip primary">{FORMAT_INFO[b.format].short}</span>{' '}
                    <strong>{b.name ?? FORMAT_INFO[b.format].label}</strong>
                    <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>
                      {describeBlock(b)}
                      {b.entries.length > 0 && ` · ${b.entries.map((e) => exercises.get(e.exerciseId)?.name ?? '?').join(', ')}`}
                    </span>
                  </span>
                </button>
                <Icon name={open ? 'up' : 'down'} size={18} />
              </div>
              {open && (
                <div className="mt">
                  <BlockEditor block={b} onChange={setBlock} />
                  <div className="row wrap mt">
                    <button className="btn small" onClick={() => onChange({ blocks: move(day.blocks, bi, -1) })} disabled={bi === 0}>
                      <Icon name="up" /> Up
                    </button>
                    <button className="btn small" onClick={() => onChange({ blocks: move(day.blocks, bi, 1) })} disabled={bi === day.blocks.length - 1}>
                      <Icon name="down" /> Down
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        const blocks = [...day.blocks];
                        blocks.splice(bi + 1, 0, cloneBlock(b));
                        onChange({ blocks });
                      }}
                    >
                      <Icon name="copy" /> Duplicate
                    </button>
                    <span className="spacer" />
                    <button className="btn small danger" onClick={() => confirm('Delete this block?') && onChange({ blocks: day.blocks.filter((x) => x.id !== b.id) })}>
                      <Icon name="trash" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="row mt">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">New block format</span>
            <select value={newFormat} onChange={(e) => setNewFormat(e.target.value as BlockFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            onClick={() => {
              const b = newBlock(newFormat, profile.defaultPrepSec);
              onChange({ blocks: [...day.blocks, b] });
              setOpenBlock(b.id);
            }}
          >
            <Icon name="plus" /> Add block
          </button>
        </div>
      </div>
    </section>
  );
}
