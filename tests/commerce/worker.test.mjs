import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorker, snapshotKey } from '../../workers/commerce-api/worker.js';
import { createAmazonClient } from '../../workers/commerce-api/amazon.js';
import { commerceConfig } from '../../workers/commerce-api/generated-products.js';
import { harness, contract, product, rawItem, tokenResponse, json, offersRequest, START } from './fixtures.mjs';

function setup(handler) {
  const h = harness(), calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return url.includes('/auth/') ? tokenResponse() : handler ? handler(url, init, calls) : json({ itemsResult: { items: [rawItem()] } }); };
  return { ...h, calls, worker: createWorker({ contract: contract(), fetcher, clock: h.clock, sleep: h.sleep, timeoutMS: 20 }), fetcher };
}
test('production default and unapproved allowlist: zero outbound and no public data even with env true', async () => {
  const h = harness(); const fetcher = async () => { assert.fail('network forbidden'); };
  for (const c of [commerceConfig, contract({ pending: product({ ownerReview: 'pending' }) }), contract({ disabled: product({ enabled: false }) })]) {
    const worker = createWorker({ contract: c, fetcher, clock: h.clock });
    assert.equal((await worker.scheduled({}, h.env)).status, 'disabled');
    assert.deepEqual((await (await worker.fetch(offersRequest(), h.env)).json()).items, {});
  }
  const config = readFileSync(new URL('../../workers/commerce-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /crons = \[\]/); assert.match(config, /LIVE_API_ENABLED = "false"/);
  assert.ok(!config.includes('[[kv_namespaces]]'));
});
test('normal Cron → KV; read endpoint never calls Amazon/auth; projection is minimal/no-store/CORS', async () => {
  const h = setup(); assert.equal((await h.worker.scheduled({}, h.env)).status, 'updated');
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey('mock-revision'));
  assert.equal(stored.expiration, (START + 3600000) / 1000);
  stored.value.items.mock.offer.accessToken = 'should-never-leak';
  for (let i = 0; i < 3; i++) {
    const response = await h.worker.fetch(offersRequest(), h.env);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://apps.yzrswork.com');
    const body = await response.json(); assert.equal(body.items.mock.offer.price, 9000);
    assert.ok(!JSON.stringify(body).includes('accessToken')); assert.ok(!JSON.stringify(body).includes('mock-only-secret'));
  }
  assert.equal(h.calls.length, 2);
  assert.equal((await h.worker.fetch(offersRequest('https://evil.invalid'), h.env)).status, 403);
  assert.equal((await h.worker.fetch(offersRequest(undefined, '/v1/offers?asin=B000000001'), h.env)).status, 400);
  assert.equal((await h.worker.fetch(new Request('https://worker.invalid/v1/offers', { method: 'POST', headers: { Origin: 'https://apps.yzrswork.com' } }), h.env)).status, 405);
  assert.equal((await (await h.worker.fetch(new Request('https://worker.invalid/health'), {})).json()).status, 'ok');
  assert.equal(h.calls.length, 2);
});
test('10 ASIN batch, 1 TPS, order independent joins; cache reused across batches/cold runs', async () => {
  const h = harness(), products = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`mock${i}`, product({ asin: `B${String(i + 1).padStart(9, '0')}` })]));
  let auth = 0, api = 0; const requestTimes = [];
  const fetcher = async (url, init) => {
    if (url.includes('/auth/')) { auth++; return tokenResponse(); }
    api++; requestTimes.push(h.clock()); const body = JSON.parse(init.body);
    assert.ok(body.itemIds.length <= 10); assert.equal(body.condition, 'New');
    assert.equal(init.headers['x-marketplace'], 'www.amazon.co.jp');
    return json({ itemResults: { items: body.itemIds.reverse().map(asin => rawItem(asin)) } });
  };
  const options = { contract: contract(products), fetcher, clock: h.clock, sleep: h.sleep, timeoutMS: 20 };
  await createWorker(options).scheduled({}, h.env);
  assert.equal(auth, 1); assert.equal(api, 2); assert.ok(requestTimes[1] - requestTimes[0] >= 1000);
  const response = await createWorker(options).fetch(offersRequest(), h.env), body = await response.json();
  assert.equal(Object.keys(body.items).length, 12); assert.equal(body.items.mock11.offer.asin, products.mock11.asin);
  await createWorker(options).scheduled({}, h.env); assert.equal(auth, 1); assert.equal(api, 4);
});
test('single-isolate overlapping Cron coalesces; no duplicated update', async () => {
  const h = setup(); await Promise.all([h.worker.scheduled({}, h.env), h.worker.scheduled({}, h.env)]);
  assert.equal(h.calls.length, 2); assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 1);
});
for (const [name, handler] of [
  ['403', () => json({ code: 'AssociateNotEligible' }, 403)],
  ['429 long Retry-After', () => json({ code: 'TooManyRequests' }, 429, { 'Retry-After': '300' })],
  ['5xx', () => json({ code: 'InternalError' }, 503)],
  ['timeout', () => new Promise(() => {})],
  ['network failure', () => { throw new Error('mock-only-secret'); }],
]) test(`${name}: no freshness laundering and bounded retry`, async () => {
  const h = setup(handler);
  assert.equal((await h.worker.scheduled({}, h.env)).status, 'unavailable');
  assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 0);
  assert.equal(h.calls.filter(call => call.url.includes('/auth/')).length, 1);
  assert.ok(h.calls.length <= 4);
});
test('OAuth failure/token429 do not trigger GetItems', async () => {
  for (const status of [400, 429]) {
    const h = harness(); let calls = 0;
    const worker = createWorker({ contract: contract(), clock: h.clock, fetcher: async () => { calls++; return json({ error: 'mock' }, status, { 'Retry-After': '300' }); } });
    assert.equal((await worker.scheduled({}, h.env)).status, 'unavailable'); assert.equal(calls, 1);
    assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 0);
  }
});
test('GetItems 429 transient succeeds without reminting token', async () => {
  let attempts = 0; const h = setup(() => ++attempts === 1 ? json({}, 429, { 'Retry-After': '1' }) : json({ itemsResult: { items: [rawItem()] } }));
  assert.equal((await h.worker.scheduled({}, h.env)).status, 'updated');
  assert.equal(attempts, 2); assert.equal(h.calls.length, 3);
});
test('TokenExpired refresh once; repeated expiration stops, no shared-slot deletion', async () => {
  let attempts = 0; const h = setup(() => ++attempts === 1 ? json({ code: 'TokenExpired' }, 401) : json({ itemsResult: { items: [rawItem()] } }));
  assert.equal((await h.worker.scheduled({}, h.env)).status, 'updated');
  assert.equal(h.calls.filter(c => c.url.includes('/auth/')).length, 2); assert.deepEqual(h.env.COMMERCE_AUTH.deletes, []);
  const failed = setup(() => json({ code: 'TokenExpired' }, 401));
  assert.equal((await failed.worker.scheduled({}, failed.env)).status, 'unavailable');
  assert.equal(failed.calls.length, 4);
});
test('partial ItemNotAccessible/missing item and all-invalid404 clear prior offer; no ASIN inference', async () => {
  for (const handler of [() => json({ itemsResult: { items: [] }, errors: [{ code: 'ItemNotAccessible', message: 'MOCK ONLY inaccessible' }] }), () => json({ code: 'ResourceNotFoundException' }, 404)]) {
    const h = setup(); await h.worker.scheduled({}, h.env);
    const changed = createWorker({ contract: contract(), clock: h.clock, fetcher: async url => url.includes('/auth/') ? tokenResponse() : handler(), sleep: h.sleep });
    await changed.scheduled({}, h.env);
    assert.equal((await (await changed.fetch(offersRequest(), h.env)).json()).items.mock.offer, null);
  }
});
test('failed update retains original deadline; 403 clears snapshot immediately', async () => {
  for (const status of [503, 403]) {
    const h = setup(); await h.worker.scheduled({}, h.env);
    const expiration = h.env.COMMERCE_SNAPSHOTS.puts[0].expiration; h.advance(100000);
    const failed = createWorker({ contract: contract(), clock: h.clock, fetcher: async () => json({}, status), sleep: h.sleep, timeoutMS: 20 });
    await failed.scheduled({}, h.env); assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 1);
    if (status === 403) assert.ok(h.env.COMMERCE_SNAPSHOTS.deletes.length);
    else assert.equal(h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey('mock-revision')).expiration, expiration);
    h.advance(3600000); assert.deepEqual((await (await failed.fetch(offersRequest(), h.env)).json()).items, {});
  }
});
test('non-JSON GetItems 403 still clears the previous snapshot and exposes no upstream body', async () => {
  const h = setup(); await h.worker.scheduled({}, h.env);
  const failed = createWorker({ contract: contract(), clock: h.clock, fetcher: async () => new Response('private upstream message', { status: 403 }) });
  assert.deepEqual(await failed.scheduled({}, h.env), { status: 'unavailable' });
  assert.ok(h.env.COMMERCE_SNAPSHOTS.deletes.length);
  assert.deepEqual((await (await failed.fetch(offersRequest(), h.env)).json()).items, {});
});
test('KV missing/stale/read failure/wrong revision and publication flag always fail closed', async () => {
  const h = setup();
  assert.equal((await (await h.worker.fetch(offersRequest(), h.env)).json()).status, 'unavailable');
  await h.worker.scheduled({}, h.env);
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey('mock-revision'));
  stored.value.catalogRevision = 'wrong'; assert.deepEqual((await (await h.worker.fetch(offersRequest(), h.env)).json()).items, {});
  stored.value.catalogRevision = 'mock-revision'; h.env.COMMERCE_PUBLIC_ENABLED = 'false';
  assert.equal((await (await h.worker.fetch(offersRequest(), h.env)).json()).status, 'disabled');
  h.env.COMMERCE_PUBLIC_ENABLED = 'true'; h.env.COMMERCE_SNAPSHOTS.get = async () => { throw new Error('mock-only-secret'); };
  assert.equal((await (await h.worker.fetch(offersRequest(), h.env)).json()).status, 'unavailable');
});
test('Deal disappears / item removed / price null / availability missing replace only Commerce state', async () => {
  for (const mutate of [item => { item.offersV2 = null; }, item => { item.offersV2.listings[0].price = null; }, item => { item.offersV2.listings[0].availability = null; }]) {
    const item = rawItem(); mutate(item); const h = setup(() => json({ itemsResult: { items: [item] } }));
    await h.worker.scheduled({}, h.env);
    assert.equal((await (await h.worker.fetch(offersRequest(), h.env)).json()).items.mock.offer, null);
  }
});

test('partial response preserves explicit fresh/not-accessible/no-offer states', async () => {
  const h = harness(), products = { mock: product(), inaccessible: product({ asin: 'B000000002' }), noPrice: product({ asin: 'B000000003' }) };
  const noPrice = rawItem('B000000003'); noPrice.offersV2.listings[0].price = null;
  const worker = createWorker({ contract: contract(products), clock: h.clock, sleep: h.sleep,
    fetcher: async url => url.includes('/auth/') ? tokenResponse() : json({ itemsResult: { items: [noPrice, rawItem()] }, errors: [{ code: 'ItemNotAccessible', resourceId: 'B000000002' }] }) });
  await worker.scheduled({}, h.env);
  const body = await (await worker.fetch(offersRequest(), h.env)).json();
  assert.equal(body.items.mock.status, 'fresh'); assert.equal(body.items.inaccessible.status, 'not-accessible');
  assert.equal(body.items.noPrice.status, 'no-offer'); assert.equal(body.items.inaccessible.offer, null);
});
test('known end inside a partial snapshot yields expired with no old economics; stale never implies ended', async () => {
  const h = harness(), products = { mock: product(), second: product({ asin: 'B000000002' }) };
  const deal = rawItem(); deal.offersV2.listings[0].dealDetails = { accessType: 'ALL', endTime: new Date(START + 300000).toISOString() };
  const worker = createWorker({ contract: contract(products), clock: h.clock, sleep: h.sleep,
    fetcher: async url => url.includes('/auth/') ? tokenResponse() : json({ itemsResult: { items: [deal, rawItem('B000000002')] } }) });
  await worker.scheduled({}, h.env); h.advance(300000);
  let body = await (await worker.fetch(offersRequest(), h.env)).json();
  assert.equal(body.items.mock.status, 'expired'); assert.equal(body.items.mock.offer, null); assert.equal(body.items.second.status, 'fresh');
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey('mock-revision'));
  // Simulate KV returning an old value despite expiration: readers must reject it.
  h.env.COMMERCE_SNAPSHOTS.get = async () => structuredClone(stored.value); h.advance(3600000);
  const response = await worker.fetch(offersRequest(), h.env); body = await response.json();
  assert.equal(response.status, 503); assert.deepEqual(body.items, {});
});
test('Deal disappears in next success: only new regular price is retained', async () => {
  const old = rawItem(); old.offersV2.listings[0].dealDetails = { accessType: 'ALL' };
  const fresh = rawItem(); fresh.offersV2.listings[0].price = { money: { amount: 9500, currency: 'JPY' } };
  let calls = 0; const h = setup(() => json({ itemsResult: { items: [++calls === 1 ? old : fresh] } }));
  await h.worker.scheduled({}, h.env); await h.worker.scheduled({}, h.env);
  const offer = (await (await h.worker.fetch(offersRequest(), h.env)).json()).items.mock.offer;
  assert.equal(offer.price, 9500); assert.equal(offer.deal, null); assert.equal(offer.savingsJPY, null);
});
