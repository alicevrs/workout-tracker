import { InstallHelp } from '../components/InstallHelp';
import { ProfileForm } from '../components/ProfileForm';
import { StorageStatus } from '../components/StorageStatus';
import { TimerSettings } from '../components/TimerSettings';
import { WeightLog } from '../components/WeightLog';
import { EnergyInfo } from '../components/EnergyInfo';
import { PageHeader } from '../components/ui';

export default function SettingsPage() {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <div className="stack">
        <section className="card" aria-labelledby="profile-h">
          <h2 id="profile-h" className="mb">
            Profile
          </h2>
          <ProfileForm />
        </section>
        <section className="card" aria-labelledby="weight-h">
          <h2 id="weight-h" className="mb">
            Body weight log
          </h2>
          <WeightLog />
        </section>
        <section className="card" aria-labelledby="energy-h">
          <h2 id="energy-h" className="mb">
            Calories and BMR
          </h2>
          <EnergyInfo />
        </section>
        <section className="card" aria-labelledby="timer-h">
          <h2 id="timer-h" className="mb">
            Timer
          </h2>
          <TimerSettings />
        </section>
        <section className="card" aria-labelledby="storage-h">
          <h2 id="storage-h" className="mb">
            Storage
          </h2>
          <StorageStatus />
        </section>
        <section className="card" aria-labelledby="install-h">
          <h2 id="install-h" className="mb">
            Install the app
          </h2>
          <InstallHelp />
        </section>
        <p className="tiny faint">Version {__APP_VERSION__}</p>
      </div>
    </div>
  );
}
