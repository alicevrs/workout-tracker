import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlockList } from '../components/BlockList';
import { DayActions } from '../components/DayActions';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Program } from '../db/types';
import { formatDuration } from '../lib/dates';
import { cloneProgram, estimateBlockSeconds } from '../lib/program';
import { workoutDay } from '../lib/workouts';

/** Edit one saved workout (its name and blocks). Changes are saved automatically. */
export default function WorkoutEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [workout, setWorkout] = useState<Program | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Program | null>(null);

  useEffect(() => {
    db.programs.get(id).then((p) => setWorkout(p ?? null));
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

  if (workout === undefined) return <div className="page" />;
  if (workout === null)
    return (
      <div className="page">
        <PageHeader title="Workout" back="/workouts" />
        <EmptyState title="Workout not found" />
      </div>
    );

  const day = workoutDay(workout);
  const update = (patch: Partial<Program>, dayPatch: Partial<typeof day> = {}) => {
    const name = patch.name ?? workout.name;
    const next: Program = { ...workout, ...patch, days: [{ ...day, ...dayPatch, name }], updatedAt: Date.now() };
    setWorkout(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };
  const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);

  return (
    <div className="page">
      <PageHeader
        title={workout.name || 'Workout'}
        back="/workouts"
        subtitle={total ? `≈ ${formatDuration(total)}` : undefined}
        actions={
          <button
            className="btn"
            onClick={async () => {
              await flush();
              const copy = cloneProgram(workout);
              await db.programs.add(copy);
              toast('Workout duplicated');
              navigate(`/workouts/${copy.id}`);
            }}
          >
            <Icon name="copy" /> Duplicate
          </button>
        }
      />
      <div className="stack">
        <section className="card form-grid">
          <label className="field full">
            Name
            <input value={workout.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="field full">
            Notes
            <input value={workout.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
          </label>
          <div className="full row wrap">
            <DayActions program={workout} day={day} />
          </div>
        </section>
        <section className="card">
          <h2>Blocks</h2>
          {day.blocks.length === 0 && <p className="small muted mt-s">No blocks yet. Add the first one below.</p>}
          <BlockList blocks={day.blocks} onChange={(blocks) => update({}, { blocks })} />
        </section>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`Delete “${workout.name}”? Logged sessions are kept.`)) return;
            pending.current = null;
            await db.programs.delete(workout.id);
            navigate('/workouts');
          }}
        >
          <Icon name="trash" /> Delete workout
        </button>
      </div>
    </div>
  );
}
