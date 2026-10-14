import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { exerciseIntensity } from '../lib/muscleLoad';

export default function ExerciseDetailPage() {
  const { id = '' } = useParams();
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);

  if (exercise === undefined) return <div className="page" />;
  if (!exercise)
    return (
      <div className="page">
        <PageHeader title="Exercise" back="/exercises" />
        <EmptyState title="Exercise not found" />
      </div>
    );

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
          ) : undefined
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
    </div>
  );
}
