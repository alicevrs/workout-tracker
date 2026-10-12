import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS worker file
import worker from '../worker/strava-worker.js';

const env = { STRAVA_CLIENT_ID: '123', STRAVA_CLIENT_SECRET: 'top-secret', ALLOWED_ORIGIN: 'https://me.github.io, http://localhost:5173' };
const post = (path: string, body: unknown, origin = 'https://me.github.io') =>
  new Request(`https://w.example.dev${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

afterEach(() => vi.unstubAllGlobals());

describe('Strava Worker', () => {
  it('rejects other websites', async () => {
    const res = await worker.fetch(post('/token', { code: 'x' }, 'https://evil.example'), env);
    expect(res.status).toBe(403);
  });

  it('exchanges a code using the secret and returns only the tokens', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 99, athlete: { id: 7, firstname: 'Sam', city: 'Somewhere' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(post('/token', { code: 'abc' }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://me.github.io');
    expect(await res.json()).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 99, athlete: { id: 7, firstname: 'Sam' } });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toEqual({ client_id: '123', client_secret: 'top-secret', code: 'abc', grant_type: 'authorization_code' });
  });

  it('answers CORS preflight and reports missing configuration clearly', async () => {
    const pre = await worker.fetch(new Request('https://w.example.dev/token', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env);
    expect(pre.status).toBe(204);
    const res = await worker.fetch(post('/token', { code: 'x' }), { ALLOWED_ORIGIN: 'https://me.github.io' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/STRAVA_CLIENT_SECRET/);
  });
});
