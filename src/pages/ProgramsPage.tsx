import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { newProgram, WEEKDAYS } from '../lib/program';
import { sampleProgram } from '../lib/sampleProgram';

export default function ProgramsPage() {
  const navigate = useNavigate();
  const programs = useLiveQuery(() => db.programs.orderBy('updatedAt').reverse().toArray(), []);

  const create = async (sample = false) => {
    const p = sample ? sampleProgram() : newProgram();
    await db.programs.add(p);
    navigate(`/programs/${p.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Programs"
        actions={
          <button className="btn primary" onClick={() => create()}>
            <Icon name="plus" /> New
          </button>
        }
      />
      <div className="stack">
        <Link to="/exercises" className="card row mobile-only">
          <Icon name="dumbbell" />
          <span className="grow">Exercise library</span>
          <Icon name="forward" size={18} />
        </Link>
        {programs && programs.length === 0 && (
          <div className="card">
            <EmptyState
              icon="calendar"
              title="No programs yet"
              action={
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => create()}>
                    Create a program
                  </button>
                  <button className="btn" onClick={() => create(true)}>
                    Add a sample week
                  </button>
                </div>
              }
            >
              A program is a week of training days. Each day has blocks such as Sets × Reps, Tabata, AMRAP or EMOM.
            </EmptyState>
          </div>
        )}
        {programs && programs.length > 0 && (
          <ul className="list list-card">
            {programs.map((p) => (
              <li key={p.id}>
                <Link className="list-item" to={`/programs/${p.id}`}>
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>{p.name}</div>
                    <div className="small muted ellipsis">
                      {p.days.length} day{p.days.length === 1 ? '' : 's'}
                      {p.weeks ? ` · ${p.weeks} weeks` : ''} ·{' '}
                      {p.days.map((d) => (d.weekday !== undefined ? WEEKDAYS[d.weekday].slice(0, 3) : d.name)).join(', ')}
                    </div>
                  </div>
                  <Icon name="forward" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {programs && programs.length > 0 && (
          <button className="btn small ghost" onClick={() => create(true)}>
            Add a sample week
          </button>
        )}
      </div>
    </div>
  );
}
