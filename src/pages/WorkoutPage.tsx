import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlockEditor } from '../components/BlockEditor';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { BlockFormat, PerformedBlock, Session } from '../db/types';
import { formatDate } from '../lib/dates';
import { describeBlock, FORMAT_INFO, FORMATS, newBlock } from '../lib/program';
import { applyBlockEdit, blockToPerformed, performedToBlock } from '../lib/session';

export default function WorkoutPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<BlockFormat>('sets_reps');

  if (session === undefined) return <div className="page" />;
  if (!session)
    return (
      <div className="page">
        <PageHeader title="Workout" back="/" />
        <EmptyState title="Workout not found" />
      </div>
    );

  const save = (patch: Partial<Session>) => db.sessions.update(session.id, { ...patch, updatedAt: Date.now() });
  const setBlock = (pb: PerformedBlock) => save({ blocks: session.blocks.map((b) => (b.id === pb.id ? pb : b)) });

  const finish = async () => {
    await save({ status: 'completed', endedAt: session.endedAt ?? Date.now() });
    toast('Workout saved');
    navigate(`/history/${session.id}`, { replace: true });
  };

  const discard = async () => {
    if (!confirm('Discard this workout? Logged sets will be lost.')) return;
    await db.sessions.delete(session.id);
    navigate('/', { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title={session.title}
        back="/"
        subtitle={formatDate(session.startedAt)}
        actions={
          session.status === 'in_progress' ? (
            <button className="btn good" onClick={finish}>
              <Icon name="check" /> Finish
            </button>
          ) : undefined
        }
      />
      <div className="stack">
        {session.programDayId && (
          <p className="small faint">Changes here apply to this workout only. The program stays unchanged.</p>
        )}
        {session.blocks.map((b) => {
          const open = editing === b.id;
          return (
            <section key={b.id} className="card block-card" aria-label={b.name ?? FORMAT_INFO[b.format].label}>
              <div className="card-title">
                <div style={{ minWidth: 0 }}>
                  <span className="chip primary">{FORMAT_INFO[b.format].short}</span> <strong>{b.name ?? FORMAT_INFO[b.format].label}</strong>
                  <div className="small muted">{describeBlock(performedToBlock(b))}</div>
                </div>
                <button className="btn small" aria-expanded={open} onClick={() => setEditing(open ? null : b.id)}>
                  <Icon name="edit" /> {open ? 'Done' : 'Edit'}
                </button>
              </div>
              {open ? (
                <>
                  <BlockEditor block={performedToBlock(b)} onChange={(edited) => setBlock(applyBlockEdit(b, edited))} />
                  <button
                    className="btn small danger mt"
                    onClick={() => confirm('Remove this block from the workout?') && save({ blocks: session.blocks.filter((x) => x.id !== b.id) })}
                  >
                    <Icon name="trash" /> Remove block
                  </button>
                </>
              ) : (
                <ul className="list small">
                  {b.entries.map((e) => (
                    <li key={e.id} className="row between" style={{ minHeight: 32 }}>
                      <span>{exercises.get(e.exerciseId)?.name ?? 'Unknown exercise'}</span>
                      <span className="muted num">
                        {e.planned?.sets && (b.format === 'sets_reps' || b.format === 'timed_sets') ? `${e.planned.sets} × ` : ''}
                        {e.planned?.durationSec ? `${e.planned.durationSec}s` : e.planned?.reps ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {session.blocks.length === 0 && (
          <div className="card">
            <EmptyState icon="dumbbell" title="Empty workout">
              Add a block to start planning this workout.
            </EmptyState>
          </div>
        )}

        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">New block format</span>
            <select value={newFormat} onChange={(e) => setNewFormat(e.target.value as BlockFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            onClick={async () => {
              const pb = blockToPerformed(newBlock(newFormat, profile.defaultPrepSec));
              await save({ blocks: [...session.blocks, pb] });
              setEditing(pb.id);
            }}
          >
            <Icon name="plus" /> Add block
          </button>
        </div>

        <label className="field">
          Notes
          <textarea defaultValue={session.notes ?? ''} onBlur={(e) => save({ notes: e.target.value || undefined })} />
        </label>

        {session.status === 'in_progress' && (
          <button className="btn danger" onClick={discard}>
            <Icon name="trash" /> Discard workout
          </button>
        )}
      </div>
    </div>
  );
}
