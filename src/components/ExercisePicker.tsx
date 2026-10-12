import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MUSCLE_LABEL } from '../data/muscles';
import { useExercises } from '../db/repo';
import type { ExerciseCategory } from '../db/types';
import { Sheet } from './ui';

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const exercises = useExercises();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExerciseCategory | 'all'>('all');
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (exercises ?? []).filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!query ||
          e.name.toLowerCase().includes(query) ||
          e.primaryMuscles.some((m) => MUSCLE_LABEL[m].toLowerCase().includes(query)) ||
          e.equipment.includes(query)),
    );
  }, [exercises, q, cat]);

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <input type="search" placeholder="Search name, muscle or equipment" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" autoFocus />
      <div className="scroll-x mt-s" role="group" aria-label="Category">
        {(['all', 'strength', 'bodyweight', 'cardio', 'mobility'] as const).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      <ul className="list mt-s">
        {list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="list-item"
              style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => {
                onPick(e.id);
                onClose();
              }}
            >
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div className="small muted">
                  {e.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {e.equipment}
                </div>
              </div>
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="empty small">
            No match. <Link to="/exercises/new">Create a custom exercise</Link>
          </li>
        )}
      </ul>
    </Sheet>
  );
}
