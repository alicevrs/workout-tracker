import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MUSCLE_LABEL, MUSCLES } from '../data/muscles';
import { useVisibleExercises } from '../db/repo';
import type { ExerciseCategory, MuscleId } from '../db/types';
import { EquipmentSelect } from './Library';
import { Sheet } from './ui';

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const exercises = useVisibleExercises();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExerciseCategory | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleId | ''>('');
  const [equipment, setEquipment] = useState('');
  // Every search starts empty (the previous one is not kept).
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (exercises ?? []).filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!muscle || e.primaryMuscles.includes(muscle) || e.secondaryMuscles.includes(muscle)) &&
        (!equipment || e.equipment === equipment) &&
        (!query ||
          e.name.toLowerCase().includes(query) ||
          e.primaryMuscles.some((m) => MUSCLE_LABEL[m].toLowerCase().includes(query)) ||
          e.equipment.includes(query)),
    );
  }, [exercises, q, cat, muscle, equipment]);

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <input type="search" placeholder="Search name, muscle or equipment" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" autoFocus />
      <div className="scroll-x mt-s" role="group" aria-label="Category">
        {(['strength', 'bodyweight', 'cardio', 'mobility'] as const).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      <label className="field mt-s">
        <span className="sr-only">Muscle group</span>
        <select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId | '')}>
          <option value="">All muscle groups</option>
          {MUSCLES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-s">
        <EquipmentSelect exercises={exercises ?? []} value={equipment} onChange={setEquipment} />
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
