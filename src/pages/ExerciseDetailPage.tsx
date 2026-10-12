import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { uid } from '../lib/ids';
import { exerciseIntensity } from '../lib/muscleLoad';

export default function ExerciseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);

  if (exercise === undefined) return <div className="page" />;
  if (!exercise)
    return (
      <div className="page">
        <PageHeader title="Exercise" back="/exercises" />
        <EmptyState title="Exercise not found" />
      </div>
    );

  const duplicate = async () => {
    const copy = { ...exercise, id: `custom-${uid()}`, name: `${exercise.name} (copy)`, isCustom: true };
    await db.exercises.add(copy);
    toast('Copied to your exercises');
    navigate(`/exercises/${copy.id}/edit`);
  };

  const remove = async () => {
    const used = await db.programs
      .filter((p) => p.days.some((d) => d.blocks.some((b) => b.entries.some((en) => en.exerciseId === id))))
      .count();
    const msg = used
      ? `This exercise is used in ${used} program(s). Logged sessions keep their data. Delete anyway?`
      : `Delete “${exercise.name}”?`;
    if (!confirm(msg)) return;
    await db.exercises.delete(id);
    toast('Exercise deleted');
    navigate('/exercises');
  };

  return (
    <div className="page">
      <PageHeader
        title={exercise.name}
        back="/exercises"
        subtitle={`${exercise.category} · ${exercise.equipment}`}
        actions={
          exercise.isCustom ? (
            <Link className="btn" to={`/exercises/${id}/edit`}>
              <Icon name="edit" /> Edit
            </Link>
          ) : (
            <button className="btn" onClick={duplicate}>
              <Icon name="copy" /> Duplicate
            </button>
          )
        }
      />
      <div className="grid two">
        <section className="card" aria-labelledby="muscles-h">
          <h2 id="muscles-h" className="mb">
            Muscles
          </h2>
          <BodyMap values={exerciseIntensity(exercise)} compact />
          <div className="row small faint mt-s mb" style={{ justifyContent: 'center', gap: 16 }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgb(255,243,168)' }} /> Primary
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgb(153,129,10)' }} /> Secondary
            </span>
          </div>
          <h3 className="small muted">Primary</h3>
          <div className="chips mt-s mb">
            {exercise.primaryMuscles.map((m) => (
              <span key={m} className="chip primary">
                {MUSCLE_LABEL[m]}
              </span>
            ))}
          </div>
          <h3 className="small muted">Secondary</h3>
          <div className="chips mt-s">
            {exercise.secondaryMuscles.length ? (
              exercise.secondaryMuscles.map((m) => (
                <span key={m} className="chip">
                  {MUSCLE_LABEL[m]}
                </span>
              ))
            ) : (
              <span className="faint small">None</span>
            )}
          </div>
        </section>
        <ExerciseHistory exerciseId={exercise.id} />
        {exercise.notes && (
          <section className="card">
            <h2 className="mb">Notes</h2>
            <p className="muted">{exercise.notes}</p>
          </section>
        )}
      </div>
      {exercise.isCustom && (
        <div className="mt">
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" /> Delete exercise
          </button>
        </div>
      )}
    </div>
  );
}
