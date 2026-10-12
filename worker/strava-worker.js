// Cloudflare Worker for the Workout Tracker's Strava login (free plan is enough).
//
// Why: Strava needs a "client secret" to turn a login code into access tokens. A web app cannot
// keep a secret, so this tiny Worker holds it and does only the token calls. It stores nothing.
//
// Settings in Cloudflare (Worker → Settings → Variables and Secrets):
//   STRAVA_CLIENT_ID       (text)   your Strava app's Client ID
//   STRAVA_CLIENT_SECRET   (secret) your Strava app's Client Secret
//   ALLOWED_ORIGIN         (text)   where the app runs, e.g. https://yourname.github.io
//                                   (several allowed, comma separated, e.g. add http://localhost:5173)
//
// Endpoints (all called by the app):
//   POST /token        { code }            → exchanges the login code for tokens
//   POST /refresh      { refresh_token }   → gets a fresh access token
//   POST /deauthorize  { access_token }    → disconnects the app from Strava
//   GET  /api/...                          → read-only pass-through to Strava's API (fallback only)

const STRAVA = 'https://www.strava.com';

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin : allowed[0] || 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Usage',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function tokenCall(params, env, headers) {
  const res = await fetch(`${STRAVA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data.message || `Strava error ${res.status}` }, res.status, headers);
  // Return only what the app needs.
  return json(
    {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname } : undefined,
    },
    200,
    headers,
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const { ok, headers } = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!ok) return json({ error: 'This app address is not allowed. Check ALLOWED_ORIGIN in the Worker settings.' }, 403, headers);
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json({ error: 'The Worker is missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET.' }, 500, headers);

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/token') {
        const { code } = await request.json();
        if (!code) return json({ error: 'Missing code.' }, 400, headers);
        return tokenCall({ code, grant_type: 'authorization_code' }, env, headers);
      }
      if (request.method === 'POST' && url.pathname === '/refresh') {
        const { refresh_token } = await request.json();
        if (!refresh_token) return json({ error: 'Missing refresh_token.' }, 400, headers);
        return tokenCall({ refresh_token, grant_type: 'refresh_token' }, env, headers);
      }
      if (request.method === 'POST' && url.pathname === '/deauthorize') {
        const { access_token } = await request.json();
        const res = await fetch(`${STRAVA}/oauth/deauthorize`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}` } });
        return json({ ok: res.ok }, res.ok ? 200 : res.status, headers);
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/')) {
        const auth = request.headers.get('Authorization');
        if (!auth) return json({ error: 'Missing Authorization header.' }, 401, headers);
        const target = `${STRAVA}/api/v3/${url.pathname.slice(5)}${url.search}`;
        const res = await fetch(target, { headers: { Authorization: auth } });
        const out = new Headers(headers);
        out.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
        for (const h of ['X-RateLimit-Limit', 'X-RateLimit-Usage']) if (res.headers.get(h)) out.set(h, res.headers.get(h));
        return new Response(res.body, { status: res.status, headers: out });
      }
      return json({ error: 'Not found.' }, 404, headers);
    } catch (e) {
      return json({ error: `Worker error: ${e.message}` }, 500, headers);
    }
  },
};
