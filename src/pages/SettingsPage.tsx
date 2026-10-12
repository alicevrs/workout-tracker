import { InstallHelp } from '../components/InstallHelp';
import { ProfileForm } from '../components/ProfileForm';
import { StorageStatus } from '../components/StorageStatus';
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
