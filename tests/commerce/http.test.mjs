import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonRequest } from '../../workers/commerce-api/http.js';

test('JSON request uses runtime-compatible manual redirects even if caller asks to follow', async () => {
  let calls = 0;
  const result = await jsonRequest(async (url, init) => {
    calls++;
    assert.equal(url, 'https://upstream.invalid/original');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, '{"mock":"credential"}');
    assert.equal(init.headers.Authorization, 'mock-only-bearer');
    assert.ok(init.signal instanceof AbortSignal);
    return new Response('{"ok":true}', { status: 200 });
  }, 'https://upstream.invalid/original', {
    method: 'POST', body: '{"mock":"credential"}', headers: { Authorization: 'mock-only-bearer' }, redirect: 'follow',
  });
  assert.equal(calls, 1); assert.deepEqual(result.body, { ok: true });
});

test('every 3xx is rejected before reading body or redirect headers; no follow-up fetch', async () => {
  for (let status = 300; status < 400; status++) {
    let calls = 0;
    await assert.rejects(jsonRequest(async (_url, init) => {
      calls++; assert.equal(init.redirect, 'manual');
      return { status,
        get headers() { throw Error('Redirect headers must not be read'); },
        json() { throw Error('Redirect body must not be read'); },
      };
    }, 'https://upstream.invalid/original', { method: 'POST' }), { code: 'unexpected-redirect' });
    assert.equal(calls, 1);
  }
});
