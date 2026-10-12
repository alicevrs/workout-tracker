import { useEffect, useState } from 'react';
import { useToast } from '../components/ui';
import { handleRedirect, type RedirectOutcome } from './oauth';

/** Finishes the Strava login after the redirect back to the app, or shows the code to paste. */
export default function RedirectNotice() {
  const toast = useToast();
  const [outcome, setOutcome] = useState<RedirectOutcome>({ kind: 'none' });
  useEffect(() => {
    handleRedirect().then((o) => {
      if (o.kind === 'connected') toast(`Strava connected${o.name ? ` as ${o.name}` : ''}`);
      setOutcome(o);
    });
  }, [toast]);

  if (outcome.kind === 'none' || outcome.kind === 'connected') return null;
  return (
    <div className={`banner ${outcome.kind === 'paste' ? 'info' : 'error'} mb`} role="alert">
      <div className="grow">
        {outcome.kind === 'denied' && 'Strava access was not granted.'}
        {outcome.kind === 'error' && `Strava connection failed: ${outcome.message}`}
        {outcome.kind === 'paste' && (
          <>
            Almost done. Copy this code, open the installed app → Settings → Strava → “Got a connection code instead?”, and paste it there (it is valid for a few minutes):
            <div className="row mt-s">
              <input readOnly value={outcome.code} aria-label="Strava connection code" onFocus={(e) => e.target.select()} />
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(outcome.code).then(() => toast('Code copied'))}>
                Copy
              </button>
            </div>
          </>
        )}
      </div>
      <button className="btn small ghost" onClick={() => setOutcome({ kind: 'none' })}>
        Close
      </button>
    </div>
  );
}
