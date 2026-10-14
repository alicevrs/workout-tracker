import { useEffect, useState } from 'react';
import { formatSyncCode, isValidSyncCode, newSyncCode } from '../lib/sync/crypto';
import { SYNC_URL } from '../lib/sync/config';
import { deleteCloudCopy, disableSync, enableSync, getSyncCode, getSyncStatus, onSyncStatus, syncNow, vaultExists, type SyncStatus } from '../lib/sync/sync';
import { Icon } from './Icon';

function ago(t?: number): string {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Settings → Sync: keep this device and the others in step through the encrypted cloud copy. */
export function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [code, setCode] = useState<string | null>(getSyncCode());
  const [mode, setMode] = useState<'idle' | 'new' | 'join'>('idle');
  const [draft, setDraft] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => onSyncStatus(setStatus), []);
  useEffect(() => {
    const t = window.setInterval(() => setStatus({ ...getSyncStatus() }), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (!SYNC_URL) return <p className="small muted">Sync is not set up yet.</p>;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Code copied.');
    } catch {
      setMessage('Select the code and copy it.');
    }
  };

  const turnOn = async (c: string, join: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      if (join && !(await vaultExists(c))) {
        setMessage('No synced data found for this code. Check it and try again.');
        return;
      }
      await enableSync(c);
      setCode(getSyncCode());
      setMode('idle');
      setDraft('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not turn sync on.');
    } finally {
      setBusy(false);
    }
  };

  if (!code) {
    return (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Keep your workouts, activities and settings the same on all your devices. Your data is encrypted on this device with a sync code that only you have.
        </p>
        {mode === 'idle' && (
          <div className="big-buttons" style={{ paddingTop: 4 }}>
            <button
              className="big-btn"
              onClick={() => {
                setDraft(newSyncCode());
                setMode('new');
              }}
            >
              Turn on sync
            </button>
            <button className="big-btn pink" onClick={() => setMode('join')}>
              I have a code
            </button>
          </div>
        )}
        {mode === 'new' && (
          <div className="stack">
            <p className="small" style={{ margin: 0 }}>
              Your sync code. Save it somewhere safe (a password manager or Notes): you need it on your other devices, and nobody can recover it for you.
            </p>
            <div className="sync-code num">{draft}</div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn small" onClick={() => copy(draft)}>
                <Icon name="copy" /> Copy code
              </button>
            </div>
            <div className="big-buttons" style={{ paddingTop: 4 }}>
              <button className="big-btn" disabled={busy} onClick={() => turnOn(draft, false)}>
                {busy ? 'Syncing…' : 'Start syncing'}
              </button>
              <button className="btn small ghost" onClick={() => setMode('idle')}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {mode === 'join' && (
          <div className="stack">
            <label className="field">
              Sync code from your other device
              <input value={draft} onChange={(e) => setDraft(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" />
            </label>
            <div className="big-buttons" style={{ paddingTop: 4 }}>
              <button className="big-btn" disabled={busy || !isValidSyncCode(draft)} onClick={() => turnOn(draft, true)}>
                {busy ? 'Syncing…' : 'Join'}
              </button>
              <button className="btn small ghost" onClick={() => setMode('idle')}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {message && <p className="small" style={{ margin: 0, color: 'var(--accent)' }}>{message}</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <span className={`sync-dot ${status.state}`} aria-hidden />
        <span className="grow">
          {status.state === 'syncing' ? 'Syncing…' : status.state === 'error' ? status.error : `Synced ${ago(status.lastSyncAt)}`}
        </span>
        <button className="btn small" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>
          <Icon name="reset" /> Sync now
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Syncs when the app opens, when you come back to it and a few seconds after each change. To add another device, open Settings → Sync there, tap “I have a code” and enter this code.
      </p>
      {showCode ? (
        <>
          <div className="sync-code num">{formatSyncCode(code)}</div>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn small" onClick={() => copy(formatSyncCode(code))}>
              <Icon name="copy" /> Copy code
            </button>
            <button className="btn small ghost" onClick={() => setShowCode(false)}>
              Hide
            </button>
          </div>
        </>
      ) : (
        <button className="btn small" onClick={() => setShowCode(true)}>
          Show sync code
        </button>
      )}
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button
          className="btn small ghost"
          onClick={() => {
            if (!confirm('Turn off sync on this device? Your data stays here and in the cloud copy.')) return;
            disableSync();
            setCode(null);
          }}
        >
          Turn off on this device
        </button>
        <button
          className="btn small ghost"
          onClick={async () => {
            if (!confirm('Delete the cloud copy? Every device keeps its own data, but they stop syncing.')) return;
            try {
              await deleteCloudCopy();
              setCode(null);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Could not delete the cloud copy.');
            }
          }}
        >
          <Icon name="trash" /> Delete cloud copy
        </button>
      </div>
      {message && <p className="small" style={{ margin: 0, color: 'var(--accent)' }}>{message}</p>}
    </div>
  );
}
