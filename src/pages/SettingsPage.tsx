import { InstallHelp } from '../components/InstallHelp';
import { ProfileForm } from '../components/ProfileForm';
import { StorageStatus } from '../components/StorageStatus';
import { TimerSettings } from '../components/TimerSettings';
import { WeightLog } from '../components/WeightLog';
import { EnergyInfo } from '../components/EnergyInfo';
import { BackupPanel } from '../components/BackupPanel';
import { SyncPanel } from '../components/SyncPanel';
import { ImportPanel } from '../components/ImportPanel';
import { Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { StravaPanel } from '../strava';
import { PageHeader } from '../components/ui';

export default function SettingsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
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
        <section className="card" aria-labelledby="sync-h" id="sync">
          <h2 id="sync-h" className="mb">
            Sync
          </h2>
          <SyncPanel />
        </section>
        <section className="card" aria-labelledby="backup-h" id="backup">
          <h2 id="backup-h" className="mb">
            Backup
          </h2>
          <BackupPanel />
        </section>
        <section className="card" aria-labelledby="import-h">
          <h2 id="import-h" className="mb">
            Import activities (Garmin, Strava)
          </h2>
          <ImportPanel />
        </section>
        {StravaPanel && (
          <section className="card" aria-labelledby="strava-h">
            <h2 id="strava-h" className="mb">
              Strava
            </h2>
            <Suspense fallback={null}>
              <StravaPanel />
            </Suspense>
          </section>
        )}
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
