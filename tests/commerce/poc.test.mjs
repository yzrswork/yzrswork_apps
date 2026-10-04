import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoCWorker } from '../../workers/commerce-api/poc-worker.js';
import gateway from '../../workers/commerce-api/poc-gateway.js';
import { commerceConfig } from '../../workers/commerce-api/generated-products.js';
import { isPoCContract } from '../../shared/commerce-poc-policy.js';
import { createCommerceController } from '../../shared/commerce.js';
import { harness, rawItem, tokenResponse, json } from './fixtures.mjs';

function setup(handler) {
  const h = harness(), calls = [];
  Object.assign(h.env, { POC_MODE: 'controlled-live-20261004', COMMERCE_PUBLIC_ENABLED: 'false',
    POC_DISPLAY_ENABLED: 'true', POC_PREREQUISITES_CONFIRMED: 'true', TOKEN_ROTATION_EPOCH: 'poc-20261004-mock' });
  const items = () => Object.values(commerceConfig.products).reverse().map(p => {
    const item = rawItem(p.asin); item.detailPageURL = `https://www.amazon.co.jp/dp/${p.asin}?tag=yzrs_apps-22`;
    return item;
  });
  const fetcher = async (url, init) => {
    calls.push(url);
    return url.includes('/auth/') ? tokenResponse() : handler ? handler(init, items()) : json({ itemsResult: { items: items() } });
  };
  const options = { contract: commerceConfig, fetcher, clock: h.clock, sleep: h.sleep, timeoutMS: 30 };
  return { ...h, calls, options, worker: createPoCWorker(options) };
}
const request = (path = '/poc/invoke', options = {}) => new Request(`https://poc.internal${path}`, { method: 'POST', ...options });

test('PoC exact unchanged catalog guard rejects extra/pending/mismatched ASIN/model/kit and support spoofing', () => {
  assert.equal(isPoCContract(commerceConfig), true);
  for (const mutate of [c => { c.products.extra = c.products['mem-crucial-ddr4-32']; },
    c => { c.products['mem-crucial-ddr4-32'].asin = 'B000000099'; },
    c => { c.products['mem-crucial-ddr4-32'].model = 'other'; },
    c => { c.products['mem-crucial-ddr4-32'].conditions.kit = '32GBx1'; },
    c => { c.products['mem-crucial-ddr4-32'].ownerReview = 'pending'; },
    c => { c.config.amazonSupportApproved = true; }]) {
    const c = structuredClone(commerceConfig); mutate(c); assert.equal(isPoCContract(c), false);
  }
});
test('PoC cold/warm/new factory share KV token; ASIN reverse join; read/health zero extra Amazon calls; no leaks', async () => {
  const h = setup();
  const cold = await (await h.worker.fetch(request(), h.env)).json();
  assert.equal(cold.status, 'updated'); assert.equal(cold.tokenCalls, 1); assert.equal(cold.itemCalls, 1);
  assert.equal(cold.token.expiresAt - cold.token.acquiredAt, 3540000);
  assert.equal(cold.shapes.length, 2); assert.equal(cold.shapes[0].fields[0].money, 'object');
  for (const worker of [h.worker, createPoCWorker(h.options)]) {
    const warm = await (await worker.fetch(request(), h.env)).json();
    assert.equal(warm.tokenCalls, 0); assert.equal(warm.itemCalls, 1); assert.equal(warm.stopped, false);
    for (const path of ['/health', '/poc/offers']) {
      const response = await worker.fetch(request(path, { method: 'GET' }), h.env);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      const body = await response.json();
      if (path.endsWith('offers')) for (const [key, p] of Object.entries(commerceConfig.products)) assert.equal(body.items[key].offer.asin, p.asin);
      assert.doesNotMatch(JSON.stringify(body), /accessToken|mock-only|AMAZON_CLIENT_SECRET/);
    }
  }
  assert.equal(h.calls.filter(url => url.includes('/auth/')).length, 1);
  assert.equal(h.calls.filter(url => !url.includes('/auth/')).length, 3);
  assert.equal(h.worker.scheduled, undefined);
});
test('PoC guards: browser Origin, arbitrary query/body, wrong method, prerequisites and public flag => zero calls', async () => {
  for (const r of [request('/poc/invoke?asin=B000000099'), request('/poc/invoke', { body: '{"asin":"B000000099"}' }),
    request('/poc/invoke', { method: 'GET' }), request('/poc/invoke', { headers: { Origin: 'http://127.0.0.1:8790' } })]) {
    const h = setup(); assert.ok((await h.worker.fetch(r, h.env)).status >= 400); assert.equal(h.calls.length, 0);
  }
  for (const [field, value] of [['POC_MODE', 'production'], ['COMMERCE_PUBLIC_ENABLED', 'true'], ['LIVE_API_ENABLED', 'false'],
    ['POC_PREREQUISITES_CONFIRMED', 'false'], ['TOKEN_ROTATION_EPOCH', 'production'], ['CREDENTIAL_VERSION', '3.1']]) {
    const h = setup(); h.env[field] = value;
    assert.ok((await h.worker.fetch(request(), h.env)).status >= 400); assert.equal(h.calls.length, 0);
  }
});
for (const status of [403, 429, 500]) test(`PoC ${status} stops without retry; subsequent manual invocation zero calls`, async () => {
  const h = setup(() => json({ code: status === 403 ? 'AssociateNotEligible' : 'TooManyRequests' }, status));
  const first = await (await h.worker.fetch(request(), h.env)).json();
  assert.equal(first.status, 'unavailable'); assert.equal(first.itemCalls, 1); assert.equal(first.tokenCalls, 1);
  assert.equal(first.stopped, true); assert.equal((await h.worker.fetch(request(), h.env)).status, 403);
  assert.equal(h.calls.length, 2);
});
test('PoC unrecognized errors/unapproved response ASIN/duplicate joins fail closed before snapshot write', async () => {
  for (const change of [items => ({ itemsResult: { items }, errors: [{ code: 'Unknown', message: 'mock-only-secret' }] }),
    items => ({ itemsResult: { items: [...items, rawItem('B000000099')] } }),
    items => ({ itemsResult: { items: [items[0], items[0]] } })]) {
    const h = setup((_init, items) => json(change(items)));
    const result = await (await h.worker.fetch(request(), h.env)).json();
    assert.equal(result.failure, 'unrecognized-response'); assert.equal(result.stopped, true);
    assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 0); assert.doesNotMatch(JSON.stringify(result), /mock-only-secret/);
  }
});

for (const target of ['token', 'GetItems']) test(`PoC ${target} redirect fails closed without retry or snapshot write`, async () => {
  const h = setup(), calls = [];
  const worker = createPoCWorker({ ...h.options, fetcher: async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'manual');
    if (target === 'token' || !url.includes('/auth/')) {
      return new Response('mock-only-redirect-body', { status: 302, headers: { Location: 'https://unapproved.invalid/' } });
    }
    return tokenResponse();
  } });
  const first = await (await worker.fetch(request(), h.env)).json();
  assert.equal(first.failure, 'unexpected-redirect'); assert.equal(first.status, 'unavailable');
  assert.equal(first.tokenCalls, 1); assert.equal(first.itemCalls, target === 'token' ? 0 : 1);
  assert.equal(first.stopped, true); assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 0);
  assert.equal(h.env.COMMERCE_AUTH.puts.length, target === 'token' ? 0 : 1);
  assert.equal((await worker.fetch(request(), h.env)).status, 403);
  assert.equal(calls.length, target === 'token' ? 1 : 2);
  assert.ok(calls.every(url => !url.includes('unapproved.invalid')));
  assert.doesNotMatch(JSON.stringify(first), /mock-only-redirect-body|unapproved.invalid/);
});
test('PoC manual gateway denies browser, public host, wrong key and arbitrary query before binding access', async () => {
  let calls = 0;
  const env = { POC_MANUAL_KEY: 'mock-only-key', POC: { fetch: async () => { calls++; return json({ status: 'ok' }); } } };
  for (const [url, options] of [['http://127.0.0.1:8787/poc/invoke', { method: 'POST' }],
    ['http://127.0.0.1:8787/poc/invoke', { method: 'POST', headers: { 'X-PoC-Manual-Key': 'mock-only-key', Origin: 'https://evil.invalid' } }],
    ['https://public.invalid/health', {}], ['http://127.0.0.1:8787/poc/offers?asin=anything', {}]]) {
    assert.equal((await gateway.fetch(new Request(url, options), env)).status, 403);
  }
  assert.equal(calls, 0);
  assert.equal((await gateway.fetch(new Request('http://127.0.0.1:8787/poc/invoke', { method: 'POST', headers: { 'X-PoC-Manual-Key': 'mock-only-key' } }), env)).status, 200);
  assert.equal(calls, 1);
});
test('loopback renderer can read unchanged disabled contract; public page cannot use development adapter', async () => {
  for (const origin of ['http://127.0.0.1:8790', 'https://apps.yzrswork.com', 'https://preview.pages.dev']) {
    let calls = 0;
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible', querySelectorAll: () => [] });
    const window = Object.assign(new EventTarget(), { location: { origin } });
    const controller = createCommerceController({ contract: commerceConfig, document, window, navigator: { onLine: true },
      developmentRead: { origin: 'http://127.0.0.1:8790', fetch: async () => { calls++; return json({}); } } });
    await controller.refresh(); assert.equal(calls, origin.includes('127.0.0.1') ? 1 : 0); controller.dispose();
  }
});
