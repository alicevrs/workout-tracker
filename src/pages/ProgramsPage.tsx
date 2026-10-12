import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Sheet } from '../components/ui';
import { TEMPLATES } from '../lib/templates';
import { db } from '../db/db';
import { newProgram, WEEKDAYS } from '../lib/program';

export default function ProgramsPage() {
  const navigate = useNavigate();
  const programs = useLiveQuery(() => db.programs.orderBy('updatedAt').reverse().toArray(), []);

  const [picking, setPicking] = useState(false);
  const create = async (template?: (typeof TEMPLATES)[number]) => {
    setPicking(false);
    const p = template ? template.create() : newProgram();
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
                  <button className="btn" onClick={() => setPicking(true)}>
                    Add from a template
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
          <button className="btn small ghost" onClick={() => setPicking(true)}>
            Add from a template
          </button>
        )}
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Add a program">
        <ul className="list">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button className="list-item" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer' }} onClick={() => create(t)}>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{t.name}</div>
                  <div className="small muted">{t.description}</div>
                </div>
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
