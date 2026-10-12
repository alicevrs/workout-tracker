import { useRef, useState } from 'react';
import { db } from '../db/db';
import { saveSettings, useSettings } from '../db/repo';
import { backupFileName, BackupError, createBackup, readBackup, restoreBackup, summarize, type BackupFile } from '../lib/backup';
import { formatDate } from '../lib/dates';
import { migrateProgramsToWorkouts } from '../lib/workouts';
import { plural } from '../lib/units';
import { Icon } from './Icon';
import { isIOS } from './InstallHelp';
import { useToast } from './ui';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function BackupPanel() {
  const settings = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const exportBackup = async (mode: 'share' | 'download') => {
    setError('');
    const file = await createBackup(db);
    const name = backupFileName();
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const asFile = new File([blob], name, { type: 'application/json' });
    try {
      if (mode === 'share' && navigator.canShare?.({ files: [asFile] })) {
        await navigator.share({ files: [asFile], title: 'Workout backup' });
      } else {
        download(blob, name);
      }
      await saveSettings({ lastBackupAt: Date.now() });
      toast('Backup created');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`Could not export: ${(e as Error).message}`);
    }
  };

  const pick = async (f: File | undefined) => {
    setError('');
    setPending(null);
    if (!f) return;
    try {
      setPending(readBackup(await f.text()));
    } catch (e) {
      setError(e instanceof BackupError ? e.message : `Could not read “${f.name}”: ${(e as Error).message}`);
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const restore = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    if (mode === 'replace' && !confirm('Replace ALL data on this device with the backup? This cannot be undone. Consider exporting a backup of this device first.')) return;
    setBusy(true);
    try {
      await restoreBackup(db, pending, mode);
      await migrateProgramsToWorkouts(db);
      setPending(null);
      toast(mode === 'replace' ? 'Backup restored' : 'Backup merged');
    } catch (e) {
      setError(`Import failed, nothing was changed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  const sum = pending ? summarize(pending) : null;

  return (
    <div className="stack">
      <p className="small muted">
        A backup is one JSON file with all your workouts, programs, custom exercises, weight log and profile. Use it to move data between iPhone and Mac, or to keep a copy in
        iCloud Drive. {settings.lastBackupAt ? `Last backup: ${formatDate(settings.lastBackupAt)}.` : 'No backup made on this device yet.'}
      </p>
      <div className="row wrap">
        {canShare && (
          <button className="btn primary" onClick={() => exportBackup('share')}>
            <Icon name="share" /> Export backup…
          </button>
        )}
        <button className={`btn ${canShare ? '' : 'primary'}`} onClick={() => exportBackup('download')}>
          <Icon name="download" /> Download file
        </button>
        <button className="btn" onClick={() => input.current?.click()}>
          <Icon name="upload" /> Import backup
        </button>
        <input ref={input} type="file" accept={isIOS() ? undefined : '.json,application/json'} hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <p className="tiny faint">
        iPhone: “Export backup…” opens the share sheet → “Save to Files” (choose iCloud Drive) or AirDrop to your Mac. Mac: import the file with “Import backup”.
      </p>
      {pending && sum && (
        <div className="banner info">
          <div className="grow">
            <strong>Backup from {pending.exportedAt ? formatDate(new Date(pending.exportedAt).getTime()) : 'unknown date'}</strong>
            <div className="small">
              {plural(sum.sessions, 'workout')} · {plural(sum.programs, 'program')} · {plural(sum.exercises, 'custom exercise')} · {plural(sum.bodyWeights, 'weight entry', 'weight entries')}
            </div>
            <div className="row wrap mt-s">
              <button className="btn small primary" disabled={busy} onClick={() => restore('replace')}>
                Replace data on this device
              </button>
              <button className="btn small" disabled={busy} onClick={() => restore('merge')}>
                Merge (keep both)
              </button>
              <button className="btn small ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          <div className="grow">{error}</div>
        </div>
      )}
    </div>
  );
}
