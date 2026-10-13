import { useMemo, useState } from 'react';
import { GROUP_INFO, SPORT_BY_ID, SPORTS, type SportGroup } from '../data/sports';

export const SPORT_GROUP_ORDER: SportGroup[] = ['foot', 'cycling', 'water', 'snow', 'climbing', 'fitness', 'team', 'other'];

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * Choose a sport three ways: search by name, pick from the full sport list (the type fills in
 * by itself), or pick a type first to narrow the sport list.
 */
export function SportPicker({ value, onChange }: { value?: string; onChange: (sportId: string) => void }) {
  const current = value ? SPORT_BY_ID.get(value) : undefined;
  const [group, setGroup] = useState<SportGroup | ''>(current?.group ?? '');
  const [query, setQuery] = useState('');

  const choose = (id: string) => {
    const s = SPORT_BY_ID.get(id);
    if (!s) return;
    setGroup(s.group);
    setQuery('');
    onChange(id);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SPORTS.filter((s) => s.group !== 'gym' && (s.label.toLowerCase().includes(q) || GROUP_INFO[s.group].label.toLowerCase().includes(q)))
      .sort(byLabel)
      .slice(0, 8);
  }, [query]);

  const sports = SPORTS.filter((s) => s.group !== 'gym' && (!group || s.group === group)).sort(byLabel);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <input type="search" placeholder="Search a sport" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search a sport" />
        {results.length > 0 && (
          <ul className="search-results" role="listbox" aria-label="Matching sports">
            {results.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => choose(s.id)}>
                  <span>{s.label}</span>
                  <span className="small faint">{GROUP_INFO[s.group].label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && results.length === 0 && <p className="small faint" style={{ margin: '6px 0 0' }}>No sport found. Try “Other”.</p>}
      </div>
      <div className="form-grid">
        <label className="field">
          Type
          <select
            value={group}
            onChange={(e) => {
              const g = e.target.value as SportGroup | '';
              setGroup(g);
            }}
          >
            <option value="">All types</option>
            {SPORT_GROUP_ORDER.map((g) => (
              <option key={g} value={g}>
                {GROUP_INFO[g].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Sport
          <select value={current && (!group || current.group === group) ? current.id : ''} onChange={(e) => choose(e.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
