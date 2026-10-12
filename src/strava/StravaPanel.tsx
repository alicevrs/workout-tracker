import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { useToast } from '../components/ui';
import { db } from '../db/db';
import { saveSettings, useSettings } from '../db/repo';
import { formatDate, toDateKey } from '../lib/dates';
import { syncActivities, type SyncReport } from './api';
import { getConfig, redirectUri, saveConfig, type StravaConfig, type StravaTokens } from './config';
import { deauthorize, exchangeCode, startConnect } from './oauth';

export default function StravaPanel() {
  const settings = useSettings();
  const toast = useToast();
  const tokens = useLiveQuery(() => db.kv.get('stravaTokens'), [])?.value as StravaTokens | undefined;
  const lastSync = useLiveQuery(() => db.kv.get('stravaLastSync'), [])?.value as number | undefined;
  const [config, setConfig] = useState<StravaConfig>({ clientId: '', workerUrl: '' });
  const [since, setSince] = useState(toDateKey(Date.now() - 30 * 86_400_000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<SyncReport | null>(null);
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    getConfig().then(setConfig);
  }, []);
  useEffect(() => {
    if (lastSync) setSince(toDateKey(lastSync - 86_400_000));
  }, [lastSync]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <label className="check-row">
        <input type="checkbox" checked={settings.stravaEnabled} onChange={(e) => saveSettings({ stravaEnabled: e.target.checked })} />
        Enable Strava import
      </label>
      {!settings.stravaEnabled ? (
        <p className="small muted">
          Off. The automatic connection needs a Strava subscription, because Strava only gives API access to subscribers. Without it, import your Strava archive in “Import activities” above.
        </p>
      ) : (
        <>
          <p className="small muted">
            Reads your Strava activities and adds them to your history (duration, distance, calories, heart rate). Your login goes through a small Cloudflare Worker you set up
            yourself, because the Strava app secret must not be stored in this app. Only the access tokens are stored on this device. See README → “Strava setup”.
          </p>
          {!tokens && (
            <div className="form-grid">
              <label className="field">
                Strava Client ID
                <input inputMode="numeric" value={config.clientId} onChange={(e) => setConfig({ ...config, clientId: e.target.value.trim() })} onBlur={() => saveConfig(config)} />
              </label>
              <label className="field">
                Worker URL
                <input type="url" placeholder="https://….workers.dev" value={config.workerUrl} onChange={(e) => setConfig({ ...config, workerUrl: e.target.value.trim() })} onBlur={() => saveConfig(config)} />
              </label>
              <p className="full tiny faint" style={{ margin: 0 }}>
                Authorization Callback Domain in your Strava app settings: <kbd>{new URL(redirectUri()).host}</kbd>
              </p>
            </div>
          )}
          {tokens ? (
            <>
              <div className="banner ok">
                <div className="grow">
                  Connected{tokens.athlete?.firstname ? ` as ${tokens.athlete.firstname}` : ''}.{lastSync ? ` Last import ${formatDate(lastSync)}.` : ''}
                </div>
              </div>
              <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                <label className="field">
                  Import activities since
                  <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
                </label>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await syncActivities(new Date(`${since}T00:00:00`).getTime());
                      setReport(r);
                      if (r.stoppedBecause) setError(r.stoppedBecause);
                      else toast(`Strava: ${r.created} new, ${r.updated} updated`);
                    })
                  }
                >
                  <Icon name="download" /> {busy ? 'Importing…' : 'Import now'}
                </button>
              </div>
              {report && (
                <p className="small muted">
                  {report.created} new, {report.updated} merged with existing workouts, {report.duplicates} already imported.
                </p>
              )}
              <button className="btn small danger" disabled={busy} onClick={() => confirm('Disconnect Strava? Imported workouts stay in your history.') && run(() => deauthorize(tokens))}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="btn primary" disabled={busy || !config.clientId || !config.workerUrl} onClick={() => run(async () => {
                await saveConfig(config);
                await startConnect();
              })}>
                <Icon name="link" /> Connect with Strava
              </button>
              <details>
                <summary className="small muted" style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                  Got a connection code instead?
                </summary>
                <p className="small muted">
                  On iPhone, Strava may send you back to Safari instead of the installed app. Safari then shows a code: copy it and paste it here.
                </p>
                <div className="row">
                  <input aria-label="Connection code" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste code" />
                  <button className="btn" disabled={!pasted || busy} onClick={() => run(async () => {
                    await exchangeCode(pasted);
                    setPasted('');
                    toast('Strava connected');
                  })}>
                    Connect
                  </button>
                </div>
              </details>
            </>
          )}
          {error && (
            <div className="banner error" role="alert">
              <div className="grow">{error}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
