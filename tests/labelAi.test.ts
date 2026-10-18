import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS worker file
import worker from '../sync-worker/sync-worker.js';
import { LabelError, readingFromResponse, sendLabel } from '../src/lib/readLabelPhoto';

function memoryKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v), delete: async (k: string) => void m.delete(k), getWithMetadata: async () => ({ value: null, metadata: null }) };
}
const ORIGIN = 'https://alicevrs.github.io';
const post = (body: unknown, origin = ORIGIN) =>
  new Request('https://sync.example.dev/v1/label', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(body) });
const claudeReply = (text: string, stop_reason = 'end_turn') =>
  new Response(
    JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
const env = () => ({ ALLOWED_ORIGIN: ORIGIN, SYNC: memoryKV(), ANTHROPIC_API_KEY: 'test-key' });
const image = { image: 'aGVsbG8=', mediaType: 'image/jpeg' };

afterEach(() => vi.unstubAllGlobals());

describe('label reading on the Worker', () => {
  it('sends the photo to Claude with a JSON schema and returns cleaned values', async () => {
    const fetchMock = vi.fn(async () => claudeReply(JSON.stringify({ found: true, name: 'Pomodoro', kcal: 54, fat: 2.2, saturatedFat: 0.3, carbs: 6.2, sugars: 5, fiber: 1.8, protein: 1.5, salt: 0.75, portionG: 9999 })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(post(image), env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: true, values: { name: 'Pomodoro', kcal: 54, fat: 2.2, saturatedFat: 0.3, carbs: 6.2, sugars: 5, fiber: 1.8, protein: 1.5, salt: 0.75 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/v1/messages');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.output_config.format.type).toBe('json_schema');
    expect(sent.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } });
    expect(new Headers(init.headers).get('x-api-key')).toBe('test-key');
    expect(sent.fallbacks).toBe('default');
    expect(new Headers(init.headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('refuses other websites, bad images, and works only with the key set', async () => {
    expect((await worker.fetch(post(image, 'https://evil.example'), env())).status).toBe(403);
    expect((await worker.fetch(post({ image: '', mediaType: 'image/jpeg' }), env())).status).toBe(400);
    expect((await worker.fetch(post({ image: 'x', mediaType: 'text/html' }), env())).status).toBe(400);
    const noKey = { ...env(), ANTHROPIC_API_KEY: undefined };
    const res = await worker.fetch(post(image), noKey);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  it('stops after the daily limit per address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => claudeReply('{"found":true,"kcal":100}')));
    const e = env();
    for (let i = 0; i < 40; i++) expect((await worker.fetch(post(image), e)).status).toBe(200);
    const res = await worker.fetch(post(image), e);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('limit');
  });

  it('reports refusals and unreadable answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => claudeReply('', 'refusal')));
    expect((await worker.fetch(post(image), env())).status).toBe(422);
    vi.stubGlobal('fetch', vi.fn(async () => claudeReply('not json')));
    expect((await worker.fetch(post(image), env())).status).toBe(502);
  });
});

describe('label reading in the app', () => {
  it('turns the answer into food fields, salt into sodium', () => {
    expect(readingFromResponse({ found: true, values: { name: 'Sugo', brand: 'Barilla', kcal: 54.4, fat: 2.24, salt: 0.75, portionG: 85 } })).toEqual({
      values: { kcal: 54, fat: 2.2, sodium: 300, portionG: 85 },
      name: 'Sugo',
      brand: 'Barilla',
    });
  });
  it('explains errors in plain words', async () => {
    const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(sendLabel('x', reply(503, { error: 'not_configured' }))).rejects.toThrow(/not set up/);
    await expect(sendLabel('x', reply(429, { error: 'limit' }))).rejects.toThrow(/Too many/);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(sendLabel('x', offline)).rejects.toBeInstanceOf(LabelError);
    expect((await sendLabel('x', reply(200, { found: true, values: { protein: 13 } }))).values).toEqual({ protein: 13 });
  });
});
