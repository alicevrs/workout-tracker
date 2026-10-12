import { getConfig, redirectUri, saveTokens, type StravaTokens } from './config';

const STATE_KEY = 'strava-oauth-state';
export const SCOPE = 'read,activity:read_all';

export class StravaError extends Error {}

export async function startConnect(): Promise<void> {
  const { clientId, workerUrl } = await getConfig();
  if (!clientId || !workerUrl) throw new StravaError('Enter your Strava Client ID and Worker URL first.');
  const state = crypto.randomUUID();
  try {
    localStorage.setItem(STATE_KEY, state);
  } catch {
    /* private mode: the code can still be pasted manually */
  }
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  window.location.assign(url.toString());
}

interface WorkerTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string };
  scope?: string;
  error?: string;
}

async function callWorker(path: string, body: unknown): Promise<WorkerTokenResponse> {
  const { workerUrl } = await getConfig();
  if (!workerUrl) throw new StravaError('The Worker URL is not set.');
  let res: Response;
  try {
    res = await fetch(`${workerUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new StravaError('Could not reach the Strava Worker. Check the Worker URL and your connection.');
  }
  const json = (await res.json().catch(() => ({}))) as WorkerTokenResponse;
  if (!res.ok) throw new StravaError(json.error ?? `The Worker answered with error ${res.status}.`);
  return json;
}

const toTokens = (r: WorkerTokenResponse): StravaTokens => ({
  accessToken: r.access_token,
  refreshToken: r.refresh_token,
  expiresAt: r.expires_at,
  athlete: r.athlete,
  scope: r.scope,
});

/** Exchange an authorization code (from the redirect or pasted by hand) for tokens. */
export async function exchangeCode(code: string, scope?: string): Promise<StravaTokens> {
  if (scope && !scope.includes('activity:read')) throw new StravaError('Strava did not grant access to your activities. Connect again and keep “View data about your activities” ticked.');
  const tokens = toTokens(await callWorker('/token', { code: code.trim() }));
  await saveTokens(tokens);
  return tokens;
}

export async function refreshTokens(t: StravaTokens): Promise<StravaTokens> {
  const r = await callWorker('/refresh', { refresh_token: t.refreshToken });
  const next = { ...t, ...toTokens(r), athlete: t.athlete };
  await saveTokens(next);
  return next;
}

export async function deauthorize(t: StravaTokens): Promise<void> {
  try {
    await callWorker('/deauthorize', { access_token: t.accessToken });
  } finally {
    await saveTokens(null);
  }
}

export type RedirectOutcome =
  | { kind: 'none' }
  | { kind: 'connected'; name?: string }
  | { kind: 'denied' }
  | { kind: 'paste'; code: string }
  | { kind: 'error'; message: string };

/**
 * Call once at startup. If Strava redirected back here (?code=…&state=…), finish the connection.
 * On iPhone the redirect may open in Safari instead of the installed app (separate storage); then
 * the state does not match and the user is shown the code to paste into the app.
 */
export async function handleRedirect(): Promise<RedirectOutcome> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  const scope = params.get('scope') ?? undefined;
  if (!code && !error) return { kind: 'none' };

  // Remove the code from the address bar right away.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#/'}`);
  if (error) return { kind: 'denied' };

  let expected: string | null = null;
  try {
    expected = localStorage.getItem(STATE_KEY);
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
  if (!expected || expected !== state) return { kind: 'paste', code: code! };
  try {
    const t = await exchangeCode(code!, scope);
    return { kind: 'connected', name: t.athlete?.firstname };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
