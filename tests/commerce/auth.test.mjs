import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCache, authKey } from '../../workers/commerce-api/oauth-cache.js';
import { retryAfter } from '../../workers/commerce-api/http.js';
import { harness, tokenResponse, json, START } from './fixtures.mjs';

test('LWA JP body; run single-flight and cold-isolate shared cache; expires from request start', async () => {
  const h = harness(); let calls = 0;
  const fetcher = async (url, init) => {
    calls++; assert.equal(url, 'https://api.amazon.co.jp/auth/o2/token');
    const body = JSON.parse(init.body);
    assert.equal(body.scope, 'creatorsapi::default'); assert.equal(body.grant_type, 'client_credentials');
    h.advance(2000); return tokenResponse();
  };
  const first = createTokenCache({ fetcher, clock: h.clock });
  const [a, b] = await Promise.all([first(h.env), first(h.env)]);
  assert.equal(calls, 1); assert.equal(a.generation, b.generation);
  assert.equal(a.expiresAt, START + 3540000);
  const cold = await createTokenCache({ fetcher, clock: h.clock })(h.env);
  assert.equal(cold.generation, a.generation); assert.equal(calls, 1);
  assert.ok(!h.env.COMMERCE_AUTH.puts[0].key.includes(h.env.AMAZON_CLIENT_ID));
  h.advance(3540000); await first(h.env); assert.equal(calls, 2);
});
test('two isolated cache misses are bounded; KV is not claimed to be a mutex', async () => {
  const h = harness(); let calls = 0;
  const originalGet = h.env.COMMERCE_AUTH.get;
  const readers = [];
  h.env.COMMERCE_AUTH.get = async key => {
    if (key.endsWith(':cooldown') || readers.length >= 2) return originalGet(key);
    return new Promise(resolve => { readers.push(resolve); if (readers.length === 2) readers.forEach(reader => reader(null)); });
  };
  const fetcher = async () => { calls++; return tokenResponse(); };
  await Promise.all([createTokenCache({ fetcher, clock: h.clock })(h.env), createTokenCache({ fetcher, clock: h.clock })(h.env)]);
  assert.equal(calls, 2);
  await createTokenCache({ fetcher, clock: h.clock })(h.env); assert.equal(calls, 2);
});
for (const header of ['300', new Date(START + 300000).toUTCString(), undefined, 'nonsense']) {
  test(`token 429 cooldown persists; no retry before deadline (${header || 'missing'})`, async () => {
    const h = harness(); let calls = 0;
    const fetcher = async () => { calls++; return json({ error: 'slow_down', error_description: 'mock' }, 429, header ? { 'Retry-After': header } : {}); };
    const token = createTokenCache({ fetcher, clock: h.clock });
    await assert.rejects(token(h.env), { code: 'token-throttled' });
    await assert.rejects(createTokenCache({ fetcher, clock: h.clock })(h.env), { code: 'token-cooldown' });
    assert.equal(calls, 1); h.advance(300000);
    await createTokenCache({ fetcher: async () => { calls++; return tokenResponse(); }, clock: h.clock })(h.env);
    assert.equal(calls, 2);
  });
}
test('Retry-After integer/HTTP date parsing and bounded maximum', () => {
  assert.equal(retryAfter('300', START), START + 300000);
  assert.equal(retryAfter('junk', START), null);
  assert.equal(retryAfter('999999999', START), START + 86400000);
});
test('non-JSON token 429 still persists shared cooldown across fresh cache instances', async () => {
  const h = harness(); let calls = 0;
  const fetcher = async () => { calls++; return new Response('rate limited', { status: 429, headers: { 'Retry-After': '300' } }); };
  await assert.rejects(createTokenCache({ fetcher, clock: h.clock })(h.env), { code: 'token-throttled' });
  await assert.rejects(createTokenCache({ fetcher, clock: h.clock })(h.env), { code: 'token-cooldown' });
  assert.equal(calls, 1);
});
test('rotation changes key; TokenExpired ignores observed generation without deleting shared slot', async () => {
  const h = harness(); let calls = 0;
  const token = createTokenCache({ fetcher: async () => { calls++; return tokenResponse(); }, clock: h.clock });
  const a = await token(h.env); const b = await token(h.env, a.generation);
  assert.notEqual(b.generation, a.generation); assert.equal(calls, 2);
  assert.deepEqual(h.env.COMMERCE_AUTH.deletes, []);
  const original = await authKey(h.env); h.env.TOKEN_ROTATION_EPOCH = 'second';
  assert.notEqual(await authKey(h.env), original); await token(h.env); assert.equal(calls, 3);
});
test('Auth KV read/write failure does not mint unbounded tokens', async () => {
  for (const operation of ['get', 'put']) {
    const h = harness(); let calls = 0;
    h.env.COMMERCE_AUTH[operation] = async () => { throw new Error('mock-secret-should-not-leak'); };
    const token = createTokenCache({ fetcher: async () => { calls++; return tokenResponse(); }, clock: h.clock });
    await assert.rejects(token(h.env), { code: operation === 'get' ? 'auth-cache-read' : 'auth-cache-write' });
    assert.equal(calls, operation === 'get' ? 0 : 1);
  }
});
for (const body of [{ access_token: '', token_type: 'bearer', expires_in: 3600 }, { access_token: 'mock', token_type: 'bearer', expires_in: null }, { access_token: 'mock', token_type: 'bearer', expires_in: 60 }]) {
  test('malformed token rejected before caching', async () => {
    const h = harness();
    await assert.rejects(createTokenCache({ fetcher: async () => json(body), clock: h.clock })(h.env), { code: 'invalid-token' });
    assert.equal(h.env.COMMERCE_AUTH.puts.length, 0);
  });
}
