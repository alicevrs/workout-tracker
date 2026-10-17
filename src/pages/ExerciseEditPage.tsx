import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { PageHeader, useToast } from '../components/ui';
import { exerciseIntensity } from '../lib/muscleLoad';
import { MUSCLES } from '../data/muscles';
import { db } from '../db/db';
import type { Exercise, ExerciseCategory, MuscleId, Tracking } from '../db/types';
import { trackingOf } from '../db/repo';
import { uid } from '../lib/ids';

const EMPTY: Exercise = {
  id: '',
  name: '',
  category: 'strength',
  equipment: 'barbell',
  primaryMuscles: [],
  secondaryMuscles: [],
  isCustom: true,
  tracking: 'weight_reps',
};

const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith machine', 'ez bar', 'trap bar', 'bodyweight', 'band', 'pull-up bar', 'bench', 'medicine ball', 'cardio machine', 'none', 'other'];

export default function ExerciseEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  /** Duplicate: the new exercise starts from this one. */
  const copyOf = id ? null : params.get('copy');
  const from = params.get('from');
  const keep = from ? `?from=${encodeURIComponent(from)}` : '';
  const navigate = useNavigate();
  const toast = useToast();
  const [ex, setEx] = useState<Exercise | null>(id || copyOf ? null : { ...EMPTY });
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      db.exercises.get(id).then((e) => setEx(e ?? { ...EMPTY }));
    } else if (copyOf) {
      db.exercises.get(copyOf).then((e) => {
        if (!e) return setEx({ ...EMPTY });
        const { edited: _e, hidden: _h, updatedAt: _u, ...rest } = e;
        void _e;
        void _h;
        void _u;
        setEx({ ...rest, id: '', name: `${e.name} (copy)`, isCustom: true });
      });
    }
  }, [id, copyOf]);

  if (!ex) return <div className="page" />;

  const set = <K extends keyof Exercise>(k: K, v: Exercise[K]) => setEx({ ...ex, [k]: v });

  const toggleMuscle = (m: MuscleId, kind: 'primary' | 'secondary') => {
    const primary = new Set(ex.primaryMuscles);
    const secondary = new Set(ex.secondaryMuscles);
    const target = kind === 'primary' ? primary : secondary;
    const other = kind === 'primary' ? secondary : primary;
    if (target.has(m)) target.delete(m);
    else {
      target.add(m);
      other.delete(m);
    }
    setEx({ ...ex, primaryMuscles: [...primary], secondaryMuscles: [...secondary] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ex.name.trim()) return setError('Please enter a name.');
    if (ex.primaryMuscles.length === 0) return setError('Choose at least one primary muscle.');
    // A changed built-in stays in the catalogue, marked as edited so it is kept and synced.
    const builtIn = !!ex.id && !ex.isCustom;
    const record: Exercise = { ...ex, name: ex.name.trim(), id: ex.id || `custom-${uid()}`, isCustom: !builtIn, ...(builtIn ? { edited: true } : {}), updatedAt: Date.now() };
    await db.exercises.put(record);
    toast('Exercise saved');
    navigate(`/exercises/${record.id}${keep}`, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title={id ? 'Edit exercise' : 'New exercise'} back={id ? `/exercises/${id}${keep}` : '/exercises'} />
      <form onSubmit={save} className="stack">
        <div className="card form-grid">
          <label className="field full">
            Name
            <input value={ex.name} onChange={(e) => set('name', e.target.value)} required autoFocus={!id} />
          </label>
          <label className="field">
            Category
            <select value={ex.category} onChange={(e) => set('category', e.target.value as ExerciseCategory)}>
              <option value="strength">Strength</option>
              <option value="bodyweight">Bodyweight</option>
              <option value="cardio">Cardio</option>
              <option value="mobility">Mobility</option>
            </select>
          </label>
          <label className="field">
            Equipment
            <select value={ex.equipment} onChange={(e) => set('equipment', e.target.value)}>
              {[...new Set([...EQUIPMENT, ex.equipment])].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="field full">
            Logged as
            <select value={trackingOf(ex)} onChange={(e) => set('tracking', e.target.value as Tracking)}>
              <option value="weight_reps">Weight × reps</option>
              <option value="weight_time">Weight × time</option>
              <option value="time_distance">Time and distance</option>
            </select>
          </label>
        </div>
        <fieldset className="card" style={{ margin: 0 }}>
          <legend className="sr-only">Muscles</legend>
          <h2>Muscles</h2>
          <p className="small muted mt-s">Tap once for primary, use the second button for secondary.</p>
          <ul className="list">
            {MUSCLES.map((m) => {
              const isP = ex.primaryMuscles.includes(m.id);
              const isS = ex.secondaryMuscles.includes(m.id);
              return (
                <li key={m.id} className="row between" style={{ minHeight: 48 }}>
                  <span>{m.label}</span>
                  <span className="row">
                    <button type="button" className="chip" aria-pressed={isP} onClick={() => toggleMuscle(m.id, 'primary')}>
                      Primary
                    </button>
                    <button type="button" className="chip" aria-pressed={isS} onClick={() => toggleMuscle(m.id, 'secondary')}>
                      Secondary
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Live preview: updates as muscles are tapped above. */}
          <div className="mt">
            <BodyMap values={exerciseIntensity(ex)} compact />
          </div>
        </fieldset>
        <div className="card">
          <label className="field">
            Notes
            <textarea value={ex.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary block" type="submit">
          Save exercise
        </button>
      </form>
    </div>
  );
}
