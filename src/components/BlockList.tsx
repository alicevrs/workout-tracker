import { useState } from 'react';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat } from '../db/types';
import { cloneBlock, describeBlock, FORMAT_INFO, FORMATS, newBlock } from '../lib/program';
import { BlockEditor } from './BlockEditor';
import { Icon } from './Icon';

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Editable list of blocks of a workout: expand a block to edit it; reorder, duplicate, delete, add. */
export function BlockList({ blocks, onChange }: { blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  const profile = useProfile();
  const exercises = useExerciseMap();
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<BlockFormat>('sets_reps');
  const setBlock = (b: Block) => onChange(blocks.map((x) => (x.id === b.id ? b : x)));

  return (
    <div>
      {blocks.map((b, bi) => {
        const open = openBlock === b.id;
        return (
          <div key={b.id} className="card block-card" style={{ background: 'var(--bg-elev-2)', marginTop: 10 }}>
            <div className="row">
              <button
                className="btn ghost"
                style={{ flex: 1, justifyContent: 'flex-start', padding: 0, minWidth: 0, textAlign: 'left', whiteSpace: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: '1rem' }}
                aria-expanded={open}
                onClick={() => setOpenBlock(open ? null : b.id)}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="chip primary">{FORMAT_INFO[b.format].short}</span> {b.optional && <span className="chip">Optional</span>} <strong>{b.name ?? FORMAT_INFO[b.format].label}</strong>
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
                  <button className="btn small" onClick={() => onChange(move(blocks, bi, -1))} disabled={bi === 0}>
                    <Icon name="up" /> Up
                  </button>
                  <button className="btn small" onClick={() => onChange(move(blocks, bi, 1))} disabled={bi === blocks.length - 1}>
                    <Icon name="down" /> Down
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      const next = [...blocks];
                      next.splice(bi + 1, 0, cloneBlock(b));
                      onChange(next);
                    }}
                  >
                    <Icon name="copy" /> Duplicate
                  </button>
                  <span className="spacer" />
                  <button className="btn small danger" onClick={() => confirm('Delete this block?') && onChange(blocks.filter((x) => x.id !== b.id))}>
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
            onChange([...blocks, b]);
            setOpenBlock(b.id);
          }}
        >
          <Icon name="plus" /> Add block
        </button>
      </div>
    </div>
  );
}
