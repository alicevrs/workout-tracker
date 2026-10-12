import { Link } from 'react-router-dom';
import type { Session } from '../db/types';
import { useCalories } from '../hooks/useCalories';
import { Stat } from './ui';

const SOURCE_LABEL = { imported: 'Imported', manual: 'Entered', estimated: 'Estimated' } as const;

export function CalorieSource({ source }: { source: 'imported' | 'estimated' | 'manual' }) {
  return <span className={`chip ${source === 'estimated' ? '' : 'info'}`}>{SOURCE_LABEL[source]}</span>;
}

export function SessionCalories({ session }: { session: Session }) {
  const { calories } = useCalories();
  const c = calories(session);
  if (c.kcal === null)
    return (
      <Stat
        label="Calories"
        value="–"
        sub={c.missing === 'weight' ? <Link to="/settings">Add your body weight</Link> : 'Add a duration to estimate'}
      />
    );
  return (
    <Stat
      label="Calories"
      value={`${c.kcal} kcal`}
      sub={
        <span className="row wrap" style={{ gap: 4 }}>
          <CalorieSource source={c.source} />
          {c.source === 'estimated' && c.met && <span title="Average MET used">≈ {c.met.toFixed(1)} MET</span>}
        </span>
      }
    />
  );
}
