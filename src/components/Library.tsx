import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Sheet } from './ui';

export interface LibraryItem {
  id: string;
  name: string;
  sub?: string;
  to: string;
  badge?: string;
  /** Built-in items (catalogue exercises) cannot be deleted. */
  noDelete?: boolean;
  /** Not used anywhere: the link icon is shown faded. */
  unused?: boolean;
}

/** Plain list of a library (workouts, training blocks, timers, exercises): tap to open, copy icon to duplicate, × to delete. */
export function LibraryList({
  items,
  onLinks,
  onDuplicate,
  onDelete,
  empty,
}: {
  items: LibraryItem[];
  /** Show where the item is used (link icon). */
  onLinks?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  empty?: ReactNode;
}) {
  if (!items.length) return <p className="small muted lib-empty">{empty}</p>;
  return (
    <ul className="lib-list">
      {items.map((it) => (
        <li key={it.id} className="lib-row">
          <Link to={it.to} className="lib-main">
            <span className="lib-name">
              {it.name}
              {it.badge && <span className="lib-badge">{it.badge}</span>}
            </span>
            {it.sub && <span className="lib-sub">{it.sub}</span>}
          </Link>
          <span className="lib-actions">
            {onLinks && (
              <button
                className={`btn icon ghost${it.unused ? ' lib-unused' : ''}`}
                onClick={() => onLinks(it.id)}
                aria-label={it.unused ? `${it.name} is not used anywhere` : `Where ${it.name} is used`}
              >
                <Icon name="link" size={20} />
              </button>
            )}
            {onDuplicate && (
              <button className="btn icon ghost" onClick={() => onDuplicate(it.id)} aria-label={`Duplicate ${it.name}`}>
                <Icon name="copy" size={20} />
              </button>
            )}
            {onDelete &&
              (it.noDelete ? (
                <span className="lib-action-gap" aria-hidden />
              ) : (
                <button className="btn icon ghost" onClick={() => onDelete(it.id)} aria-label={`Delete ${it.name}`}>
                  <Icon name="x" size={20} />
                </button>
              ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sheet listing where an item is used (training blocks of an exercise or timer, workouts of a block). */
export function UsedInSheet({ used, onClose }: { used: { title: string; intro: string; empty: string; items: { id: string; name: string; to: string }[] } | null; onClose: () => void }) {
  return (
    <Sheet open={!!used} onClose={onClose} title={used?.title ?? ''}>
      {used &&
        (used.items.length ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              {used.intro}
            </p>
            <ul className="lib-list mt-s">
              {used.items.map((it) => (
                <li key={it.id} className="lib-row">
                  <Link to={it.to} className="lib-main" onClick={onClose}>
                    <span className="lib-name">{it.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {used.empty}
          </p>
        ))}
    </Sheet>
  );
}

/** Equipment filter: the kinds of equipment used by the listed exercises. */
export function EquipmentSelect({ exercises, value, onChange }: { exercises: { equipment: string }[]; value: string; onChange: (v: string) => void }) {
  const kinds = [...new Set(exercises.map((e) => e.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return (
    <label className="field">
      <span className="sr-only">Equipment</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All equipment</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {k[0].toUpperCase() + k.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Search box with only a magnifying glass. */
export function SearchField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="search-field">
      <Icon name="search" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </div>
  );
}

/** Title row of a Workouts sub-page with an ⓘ that explains the page. */
export function InfoButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn icon ghost" onClick={() => setOpen(true)} aria-label={`About ${title}`}>
        <Icon name="info" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="stack">{children}</div>
      </Sheet>
    </>
  );
}
