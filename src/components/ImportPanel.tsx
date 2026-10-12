import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { applyActivity, type ApplyResult } from '../lib/importers/apply';
import { FILE_IMPORTERS, importerFor } from '../lib/importers/index';
import { ImportError } from '../lib/importers/types';
import { Icon } from './Icon';
import { isIOS } from './InstallHelp';

type Row = { file: string; ok: true; result: ApplyResult } | { file: string; ok: false; message: string };

const STATUS: Record<ApplyResult['status'], string> = {
  created: 'New workout added',
  updated: 'Added to an existing workout',
  duplicate: 'Already imported',
};

export function ImportPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out: Row[] = [];
    for (const f of Array.from(files)) {
      try {
        const imp = importerFor(f.name);
        const activities = await imp.parse({ name: f.name, data: await f.arrayBuffer() });
        for (const a of activities) out.push({ file: f.name, ok: true, result: await applyActivity(db, a) });
      } catch (e) {
        const reason = e instanceof ImportError ? e.message : `unexpected error (${(e as Error).message})`;
        out.push({ file: f.name, ok: false, message: `Couldn’t import “${f.name}”: ${reason}.` });
      }
    }
    setRows(out);
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const exts = FILE_IMPORTERS.flatMap((i) => i.extensions);
  return (
    <div className="stack">
      <p className="small muted">
        Import activities from Garmin (.fit, .tcx) or your whole Strava history (the archive .zip, or its activities.csv). Duration, distance, elevation, calories, heart rate and
        sport are read. If you logged the same workout in the app (start within 10 minutes, similar duration), the data is added to it instead of creating a duplicate, and
        importing the same file again is safe.
      </p>
      <p className="tiny faint">
        Strava (free): strava.com → Settings → My Account → “Download or Delete Your Account” → Get Started → Request download. You get an email with the .zip a few hours later.
        Activities other people tagged you in are included only after you accept the tag on Strava.
      </p>
      <p className="tiny faint">
        Garmin Connect (web): open an activity → gear icon → “Export Original” (FIT, inside a .zip — unzip it first) or “Export to TCX”.
      </p>
      <div>
        <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" /> {busy ? 'Importing…' : 'Choose files'}
        </button>
        <input ref={input} type="file" multiple hidden accept={isIOS() ? undefined : exts.join(',')} onChange={(e) => handle(e.target.files)} />
      </div>
      {rows.length > 0 && (
        <ul className="list">
          {rows.map((r, i) =>
            r.ok ? (
              <li key={i} className="row between" style={{ minHeight: 44 }}>
                <span className="small">
                  <Link to={`/history/${r.result.sessionId}`}>{r.result.title}</Link> <span className="faint">· {r.file}</span>
                </span>
                <span className={`chip ${r.result.status === 'duplicate' ? '' : 'good'}`}>{STATUS[r.result.status]}</span>
              </li>
            ) : (
              <li key={i} className="banner error small" role="alert" style={{ marginTop: 6 }}>
                {r.message}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
