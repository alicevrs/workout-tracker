import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExerciseAnimation } from '../components/ExerciseAnimation';
import { motionFor } from '../lib/motion';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { exerciseIntensity } from '../lib/muscleLoad';

export default function ExerciseDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  /** Opened from a training block: Back returns there. */
  const from = params.get('from');
  const back = from || '/exercises';
  const keep = from ? `?from=${encodeURIComponent(from)}` : '';
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);

  if (exercise === undefined) return <div className="page" />;
  if (!exercise)
    return (
      <div className="page">
        <PageHeader title="Exercise" back={back} />
        <EmptyState title="Exercise not found" />
      </div>
    );

  const motion = motionFor(exercise.id, exercise.name);
  return (
    <div className="page">
      <PageHeader
        title={exercise.name}
        back={back}
        subtitle={`${exercise.category} · ${exercise.equipment}`}
        actions={
          <Link className="btn" to={`/exercises/${id}/edit${keep}`}>
            <Icon name="edit" /> Edit
          </Link>
        }
      />
      {motion && (
        <section className="card mb" aria-label={`How to do ${exercise.name}`}>
          <ExerciseAnimation motion={motion} label={`${exercise.name}: movement`} />
        </section>
      )}
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
