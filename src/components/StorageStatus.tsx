import { useEffect, useState } from 'react';
import { requestPersistentStorage } from '../db/repo';

export function StorageStatus() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  const refresh = async () => {
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) setUsage(`${(est.usage / 1024 / 1024).toFixed(1)} MB used on this device`);
  };
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="stack">
      <p className="muted small">All data is stored only on this device. Nothing is sent to a server.</p>
      <div className={`banner ${persisted ? 'ok' : 'warn'}`}>
        <div className="grow">
          {persisted === null
            ? 'This browser does not report storage persistence.'
            : persisted
              ? 'Persistent storage is on. The browser will not clear your data automatically.'
              : 'Persistent storage is not granted yet. The browser may clear data if the device runs low on space. Installing the app to the Home Screen and backing up weekly reduces the risk.'}
        </div>
        {persisted === false && (
          <button
            className="btn small"
            onClick={async () => {
              await requestPersistentStorage();
              await refresh();
            }}
          >
            Ask again
          </button>
        )}
      </div>
      {usage && <p className="small faint">{usage}</p>}
    </div>
  );
}
