import { useParams } from 'react-router-dom';
import { BlockList } from '../components/BlockList';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Program } from '../db/types';
import { linkedBlock } from '../lib/blockTemplates';
import { formatDuration } from '../lib/dates';
import { useDraft, withDraftParam } from '../lib/drafts';
import { estimateBlockSeconds } from '../lib/program';
import { workoutDay } from '../lib/workouts';

/** A resumed draft takes the current version of its linked training blocks (they may have been saved meanwhile). */
async function refreshLinked(w: Program): Promise<Program> {
  const day = workoutDay(w);
  const blocks = await Promise.all(
    day.blocks.map(async (b) => {
      if (!b.templateId) return b;
      const t = await db.blockTemplates.get(b.templateId);
      return t ? linkedBlock(t, b.id) : { ...b, templateId: undefined };
    }),
  );
  return { ...w, days: [{ ...day, blocks }] };
}

/** Edit one saved workout (its name and blocks). Nothing is stored until Save. */
export default function WorkoutEditPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { item: workout, setItem, current, dirty, markSaved } = useDraft<Program>(`workout:${id}`, () => db.programs.get(id), refreshLinked);

  if (workout === undefined) return <div className="page" />;
  if (workout === null)
    return (
      <div className="page">
        <PageHeader title="Workout" back="/workouts/templates" />
        <EmptyState title="Workout not found" />
      </div>
    );

  const day = workoutDay(workout);
  const update = (patch: Partial<Program>, dayPatch: Partial<typeof day> = {}) => {
    const cur = current() ?? workout;
    const curDay = workoutDay(cur);
    const name = patch.name ?? cur.name;
    setItem({ ...cur, ...patch, days: [{ ...curDay, ...dayPatch, name }] });
  };
  const total = day.blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0);

  const save = async () => {
    const cur = current() ?? workout;
    const name = cur.name.trim() || 'Workout';
    const next: Program = { ...cur, name, days: [{ ...workoutDay(cur), name }], updatedAt: Date.now() };
    await db.programs.put(next);
    markSaved(next);
    toast('Workout saved');
  };

  return (
    <div className="page">
      <PageHeader title={workout.name || 'Workout'} back="/workouts/templates" confirmLeave={dirty} subtitle={total ? `≈ ${formatDuration(total)}` : undefined} />
      <div className="stack">
        <label className="field">
          Name
          <input value={workout.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="field">
          Notes
          <input value={workout.notes ?? ''} placeholder="Optional" onChange={(e) => update({ notes: e.target.value || undefined })} />
        </label>
        <BlockList blocks={day.blocks} onChange={(blocks) => update({}, { blocks })} backTo={withDraftParam(`/workouts/${workout.id}`)} workoutId={workout.id} />
      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
