// Cloudflare Worker for Workout Tracker sync. It stores one encrypted blob per vault in KV and
// never sees readable data: the app encrypts everything with a key derived from the user's sync
// code before sending it.
//
// API (JSON, CORS limited to ALLOWED_ORIGIN):
//   GET    /v1/vault/:id   → { version, data } or 404 when the vault is empty
//   PUT    /v1/vault/:id   body { data, baseVersion } → { version } (409 when the cloud copy changed)
//   DELETE /v1/vault/:id   → { ok: true }
// Every call needs “Authorization: Bearer <token>”. The first write claims the vault: the SHA-256
// of the token is stored and later calls must present the same token.

const MAX_BYTES = 20 * 1024 * 1024;
const ID = /^[0-9a-f]{64}$/;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get('Origin'), env);
    if (!headers) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!env.SYNC) return json({ error: 'The SYNC storage is not configured.' }, 500, headers);

    const m = new URL(request.url).pathname.match(/^\/v1\/vault\/([^/]+)$/);
    if (!m || !ID.test(m[1])) return json({ error: 'Not found' }, 404, headers);
    const id = m[1];
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!ID.test(token)) return json({ error: 'Missing access token' }, 401, headers);

    const tokenHash = await sha256(token);
    const owner = await env.SYNC.get(`auth:${id}`);
    if (owner && owner !== tokenHash) return json({ error: 'Wrong sync code' }, 403, headers);

    if (request.method === 'GET') {
      const { value, metadata } = await env.SYNC.getWithMetadata(`data:${id}`);
      if (value === null) return json({ error: 'Empty' }, 404, headers);
      return json({ version: metadata?.version ?? 0, data: value }, 200, headers);
    }

    if (request.method === 'PUT') {
      const length = Number(request.headers.get('Content-Length') || 0);
      if (length > MAX_BYTES) return json({ error: 'Too large' }, 413, headers);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400, headers);
      }
      if (typeof body?.data !== 'string' || body.data.length > MAX_BYTES) return json({ error: 'Invalid data' }, 400, headers);
      const current = await env.SYNC.getWithMetadata(`data:${id}`);
      const currentVersion = current.metadata?.version ?? 0;
      if (current.value !== null && Number(body.baseVersion || 0) !== currentVersion) {
        return json({ error: 'Changed', version: currentVersion }, 409, headers);
      }
      const version = Math.max(Date.now(), currentVersion + 1);
      if (!owner) await env.SYNC.put(`auth:${id}`, tokenHash);
      await env.SYNC.put(`data:${id}`, body.data, { metadata: { version } });
      return json({ version }, 200, headers);
    }

    if (request.method === 'DELETE') {
      await env.SYNC.delete(`data:${id}`);
      await env.SYNC.delete(`auth:${id}`);
      return json({ ok: true }, 200, headers);
    }

    return json({ error: 'Method not allowed' }, 405, headers);
  },
};
