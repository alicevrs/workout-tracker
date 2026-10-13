import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block } from '../db/types';
import { useDragReorder } from '../hooks/useDragReorder';
import { linkedBlock, newBlockTemplate, templateFromBlock } from '../lib/blockTemplates';
import { cloneBlock, describeBlock, FORMAT_INFO } from '../lib/program';
import { BlockEditor } from './BlockEditor';
import { Icon } from './Icon';
import { Sheet, useToast } from './ui';

/**
 * The parts of a workout as big buttons: hold and drag to reorder, × to remove. Parts linked to an
 * training block open that block (changes there apply to every workout using it); older unlinked
 * parts expand an editor here and can be saved as a block.
 */
export function BlockList({ blocks, onChange, backTo }: { blocks: Block[]; onChange: (blocks: Block[]) => void; backTo: string }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const toast = useToast();
  const templates = useLiveQuery(() => db.blockTemplates.orderBy('name').toArray(), []) ?? [];
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const setBlock = (b: Block) => onChange(blocks.map((x) => (x.id === b.id ? b : x)));
  const swap = (i: number, j: number) => {
    const next = [...blocksRef.current];
    [next[i], next[j]] = [next[j], next[i]];
    blocksRef.current = next;
    onChange(next);
  };
  const { drag, handle, rowStyle, wasDragged } = useDragReorder(listRef, blocks.length, swap, () => setOpenBlock(null));
  const add = (b: Block) => {
    onChange([...blocks, b]);
    setAdding(false);
  };
  const openLinked = (templateId: string) => navigate(`/workouts/blocks/${templateId}?from=${encodeURIComponent(backTo)}`);
  const newLinked = async () => {
    const t = newBlockTemplate('sets_reps', profile.defaultPrepSec);
    await db.blockTemplates.add(t);
    onChange([...blocks, linkedBlock(t)]);
    openLinked(t.id);
  };

  return (
    <div className="stack">
      {blocks.length > 0 && <p className="tiny faint" style={{ textAlign: 'center', margin: 0 }}>Tap to open · hold and drag to reorder</p>}
      <div className="mix-list" ref={listRef}>
        {blocks.map((b, bi) => {
          const open = openBlock === b.id;
          const names = b.entries.map((e) => exercises.get(e.exerciseId)?.name ?? '?').join(', ');
          return (
            <div key={b.id} data-drag-index={bi} className={`mix-row wide${drag?.index === bi ? ' dragging' : ''}`} style={rowStyle(bi)}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                className={`mix-pill block-pill${b.optional ? ' optional' : ''}`}
                {...handle(bi)}
                onClick={() => !wasDragged() && (b.templateId ? openLinked(b.templateId) : setOpenBlock(open ? null : b.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (b.templateId) openLinked(b.templateId);
                    else setOpenBlock(open ? null : b.id);
                  } else if (e.altKey && e.key === 'ArrowUp' && bi > 0) swap(bi, bi - 1);
                  else if (e.altKey && e.key === 'ArrowDown' && bi < blocks.length - 1) swap(bi, bi + 1);
                }}
              >
                <span className="mix-pill-text">
                  <span className="mix-pill-name">
                    {b.name ?? FORMAT_INFO[b.format].label}
                    {b.optional && <span className="lib-badge dark">Optional</span>}
                    {b.templateId && <Icon name="link" size={14} title="Training block: changes apply to every workout that uses it" />}
                  </span>
                  <span className="mix-pill-desc">
                    {FORMAT_INFO[b.format].short} · {describeBlock(b)}
                  </span>
                  {names && <span className="mix-pill-desc ellipsis">{names}</span>}
                </span>
                <button
                  className="mix-pill-x"
                  aria-label="Remove"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Remove “${b.name ?? FORMAT_INFO[b.format].label}” from this workout?`)) onChange(blocks.filter((x) => x.id !== b.id));
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
              {open && (
                <div className="mix-fields block-fields">
                  <BlockEditor block={b} onChange={setBlock} />
                  <div className="row wrap mt" style={{ justifyContent: 'center' }}>
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
                    <button
                      className="btn small"
                      onClick={async () => {
                        const t = templateFromBlock(b);
                        await db.blockTemplates.add(t);
                        setBlock({ ...linkedBlock(t, b.id) });
                        setOpenBlock(null);
                        toast('Saved as training block and linked');
                      }}
                    >
                      <Icon name="plus" /> Save as training block
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="big-buttons" style={{ paddingTop: 4 }}>
        <button className="big-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add a block
        </button>
        <button className="big-btn pink" onClick={newLinked}>
          <Icon name="plus" /> New block
        </button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add an training block">
        {templates.length === 0 ? (
          <p className="small muted">No training blocks yet. Use New block, or create them in Workouts → Training blocks.</p>
        ) : (
          <ul className="lib-list">
            {templates.map((t) => (
              <li key={t.id} className="lib-row">
                <button className="lib-main" onClick={() => add(linkedBlock(t))}>
                  <span className="lib-name">
                    {t.name}
                    <span className="lib-badge">{FORMAT_INFO[t.block.format].short}</span>
                  </span>
                  <span className="lib-sub">{describeBlock(t.block)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
