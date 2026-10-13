import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Block, BlockFormat } from '../db/types';
import { useDragReorder } from '../hooks/useDragReorder';
import { blockFromTemplate, templateFromBlock } from '../lib/blockTemplates';
import { cloneBlock, describeBlock, FORMAT_INFO, FORMATS, newBlock } from '../lib/program';
import { BlockEditor } from './BlockEditor';
import { Icon } from './Icon';
import { Sheet, useToast } from './ui';

/**
 * The parts (blocks) of a workout as big buttons: tap to edit, hold and drag to reorder, × to remove.
 * New parts come from an exercise template or start empty in a chosen format.
 */
export function BlockList({ blocks, onChange }: { blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  const profile = useProfile();
  const exercises = useExerciseMap();
  const toast = useToast();
  const templates = useLiveQuery(() => db.blockTemplates.orderBy('name').toArray(), []) ?? [];
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | 'template' | 'format'>(null);
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
    setOpenBlock(b.id);
    setAdding(null);
  };

  return (
    <div className="stack">
      {blocks.length > 0 && <p className="tiny faint" style={{ textAlign: 'center', margin: 0 }}>Tap to edit · hold and drag to reorder</p>}
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
                onClick={() => !wasDragged() && setOpenBlock(open ? null : b.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenBlock(open ? null : b.id);
                  } else if (e.altKey && e.key === 'ArrowUp' && bi > 0) swap(bi, bi - 1);
                  else if (e.altKey && e.key === 'ArrowDown' && bi < blocks.length - 1) swap(bi, bi + 1);
                }}
              >
                <span className="mix-pill-text">
                  <span className="mix-pill-name">
                    {b.name ?? FORMAT_INFO[b.format].label}
                    {b.optional && <span className="lib-badge dark">Optional</span>}
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
                        await db.blockTemplates.add(templateFromBlock(b));
                        toast('Saved as exercise template');
                      }}
                    >
                      <Icon name="plus" /> Save as exercise template
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="big-buttons" style={{ paddingTop: 4 }}>
        <button className="big-btn" onClick={() => setAdding('template')}>
          <Icon name="plus" /> From template
        </button>
        <button className="big-btn pink" onClick={() => setAdding('format')}>
          <Icon name="plus" /> New part
        </button>
      </div>

      <Sheet open={adding === 'template'} onClose={() => setAdding(null)} title="Add an exercise template">
        {templates.length === 0 ? (
          <p className="small muted">No exercise templates yet. Create them in Workouts → Exercise templates, or save a part of a workout as a template.</p>
        ) : (
          <ul className="lib-list">
            {templates.map((t) => (
              <li key={t.id} className="lib-row">
                <button className="lib-main" onClick={() => add(blockFromTemplate(t))}>
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

      <Sheet open={adding === 'format'} onClose={() => setAdding(null)} title="New part">
        <ul className="lib-list">
          {FORMATS.map((f: BlockFormat) => (
            <li key={f} className="lib-row">
              <button className="lib-main" onClick={() => add(newBlock(f, profile.defaultPrepSec))}>
                <span className="lib-name">{FORMAT_INFO[f].label}</span>
                <span className="lib-sub">{FORMAT_INFO[f].description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
