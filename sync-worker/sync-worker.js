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
//
//   POST   /v1/label       body { image: base64, mediaType } → { values } read from a nutrition label
// photo by Claude (needs the ANTHROPIC_API_KEY secret). The photo is passed on and not stored.
// Limited per day (per address and in total) so the key cannot run up costs.

import Anthropic from '@anthropic-ai/sdk';

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
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ---------- nutrition label photos ----------

const LABEL_MODEL = 'claude-opus-5-5';
const MAX_IMAGE_CHARS = 5 * 1024 * 1024; // base64 text of the (already reduced) photo
const LIMIT_PER_ADDRESS = 40;
const LIMIT_TOTAL = 300;
const NUMBER = { type: 'number' };
const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    name: { type: 'string' },
    brand: { type: 'string' },
    kcal: NUMBER,
    fat: NUMBER,
    saturatedFat: NUMBER,
    carbs: NUMBER,
    sugars: NUMBER,
    fiber: NUMBER,
    protein: NUMBER,
    salt: NUMBER,
    portionG: NUMBER,
  },
  required: ['found'],
  additionalProperties: false,
};
const LABEL_PROMPT = `This photo should show the nutrition facts table of a food product.
Read the values per 100 g (or per 100 ml) and return them in grams, energy in kcal:
kcal, fat, saturatedFat, carbs (available carbohydrates), sugars, fiber, protein, salt.
If the table only gives values per portion and states the portion weight, convert them to per 100 g.
Include portionG when a portion weight is printed, and name/brand only if clearly visible.
Leave out any value that is not printed or not readable; never guess. Set found to false if there is no nutrition table.`;

/** Count one use for today; false when a daily limit is reached. */
async function allowLabelRead(env, address) {
  const day = new Date().toISOString().slice(0, 10);
  const keys = [`label:${day}:all`, `label:${day}:${await sha256(address || 'unknown')}`];
  const [total, mine] = await Promise.all(keys.map(async (k) => Number((await env.SYNC.get(k)) || 0)));
  if (total >= LIMIT_TOTAL || mine >= LIMIT_PER_ADDRESS) return false;
  await Promise.all([env.SYNC.put(keys[0], String(total + 1), { expirationTtl: 172800 }), env.SYNC.put(keys[1], String(mine + 1), { expirationTtl: 172800 })]);
  return true;
}

/** Only numbers that make sense per 100 g. */
function cleanValues(raw) {
  const out = {};
  for (const k of ['kcal', 'fat', 'saturatedFat', 'carbs', 'sugars', 'fiber', 'protein', 'salt', 'portionG']) {
    const v = raw?.[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= (k === 'kcal' ? 950 : k === 'portionG' ? 2000 : 100)) out[k] = v;
  }
  for (const k of ['name', 'brand']) if (typeof raw?.[k] === 'string' && raw[k].trim()) out[k] = raw[k].trim().slice(0, 120);
  return out;
}

async function readLabel(request, env, headers) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503, headers);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_IMAGE_CHARS + 1000) return json({ error: 'Too large' }, 413, headers);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, headers);
  }
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body?.mediaType) ? body.mediaType : null;
  if (!mediaType || typeof body.image !== 'string' || !body.image || body.image.length > MAX_IMAGE_CHARS) return json({ error: 'Invalid image' }, 400, headers);
  if (!(await allowLabelRead(env, request.headers.get('CF-Connecting-IP')))) return json({ error: 'limit' }, 429, headers);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: LABEL_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: body.image } },
            { type: 'text', text: LABEL_PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503, headers);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'not_configured' }, 503, headers);
    if (e instanceof Anthropic.APIError) return json({ error: 'ai_error', status: e.status }, 502, headers);
    return json({ error: 'ai_unreachable' }, 502, headers);
  }
  if (response.stop_reason === 'refusal') return json({ error: 'refused' }, 422, headers);
  const text = response.content.find((b) => b.type === 'text')?.text;
  let raw;
  try {
    raw = JSON.parse(text || '');
  } catch {
    return json({ error: 'unreadable' }, 502, headers);
  }
  return json({ found: raw.found !== false, values: cleanValues(raw) }, 200, headers);
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get('Origin'), env);
    if (!headers) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!env.SYNC) return json({ error: 'The SYNC storage is not configured.' }, 500, headers);

    if (new URL(request.url).pathname === '/v1/label') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
      return readLabel(request, env, headers);
    }

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
