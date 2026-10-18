import { Link } from 'react-router-dom';
import { InfoButton } from '../components/Library';
import { PageHeader } from '../components/ui';

const LEVELS: { label: string; to: string; pink?: boolean }[] = [
  { label: 'Food diary', to: '/nutrition/diary' },
  { label: 'Diet plans', to: '/nutrition/plans' },
  { label: 'Visits', to: '/nutrition/visits' },
  { label: 'Foods', to: '/nutrition/foods', pink: true },
];

/** Nutrition hub: diary, diet plans, visits and the food archive. */
export default function NutritionPage() {
  return (
    <div className="page">
      <PageHeader
        title="Nutrition"
        subtitle="Your diet, day by day."
        actions={
          <InfoButton title="Nutrition">
            <p style={{ margin: 0 }}>
              <strong>Food diary</strong>: what you eat each day, against your targets.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Diet plans</strong>: targets, meals and choices, weekly limits, menu and guidelines.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Visits</strong>: weight and measurements of each visit, with their progress.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Foods</strong>: the food archive with nutrition values.
            </p>
          </InfoButton>
        }
      />
      <section className="qt-list" aria-label="Nutrition">
        {LEVELS.map((l) => (
          <Link key={l.to} className={`big-btn${l.pink ? ' pink' : ''}`} to={l.to}>
            {l.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
