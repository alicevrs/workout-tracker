import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { isStandalone } from '../components/InstallHelp';
import { PageHeader } from '../components/ui';

export default function TodayPage() {
  return (
    <div className="page">
      <PageHeader title="Today" subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="stack">
        {!isStandalone() && (
          <div className="banner info">
            <div className="grow">
              Install the app on your Home Screen for full-screen use and offline access. <Link to="/settings">How to install</Link>
            </div>
          </div>
        )}
        <Link to="/exercises" className="card row">
          <Icon name="dumbbell" />
          <div className="grow">
            <h3>Exercise library</h3>
            <div className="small muted">Browse exercises and create your own</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
