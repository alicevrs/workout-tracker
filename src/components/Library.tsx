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
}

/** Plain list of a library (workout templates, exercise templates, exercises): tap to open, copy icon to duplicate. */
export function LibraryList({ items, onDuplicate, empty }: { items: LibraryItem[]; onDuplicate?: (id: string) => void; empty?: ReactNode }) {
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
          {onDuplicate && (
            <button className="btn icon ghost" onClick={() => onDuplicate(it.id)} aria-label={`Duplicate ${it.name}`}>
              <Icon name="copy" size={20} />
            </button>
          )}
        </li>
      ))}
    </ul>
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
