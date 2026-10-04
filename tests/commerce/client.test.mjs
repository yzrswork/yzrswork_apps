import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceController, validatePayload } from '../../shared/commerce.js';
import { normalizeItem } from '../../workers/commerce-api/normalize.js';
import { offerState, saleEligible } from '../../shared/commerce-policy.js';
import { contract, product, rawItem, START, json } from './fixtures.mjs';
import { commerceConfig } from '../../shared/commerce-config.js';

function payload(item = rawItem(), now = START) {
  const normalized = normalizeItem(item, product(), contract().config, START, now);
  return { schemaVersion: 1, catalogRevision: 'mock-revision', status: 'ok', serverNow: now,
    items: { mock: { ...normalized, remainingMS: normalized.offer ? normalized.expiresAt - now : 0 } } };
}
function element() {
  return { children: [], textContent: '', hidden: true, isConnected: true,
    replaceChildren() { this.children = []; }, append(value) { this.children.push(value); } };
}
function ui(fetcher, options = {}) {
  let mono = 0, sequence = 0; const timers = new Map();
  const window = new EventTarget(); window.location = options.location; const document = new EventTarget(), navigator = { onLine: true };
  const slot = { ...element(), dataset: { commerceSlot: 'mock' }, closest: () => options.deals ? card : null };
  const card = { ...element(), hidden: false }, cta = { ...element(), href: 'https://www.amazon.co.jp/dp/B000000001?tag=fixture-22' };
  document.visibilityState = 'visible'; document.createElement = () => element();
  document.querySelectorAll = () => [slot]; document.querySelector = () => cta;
  const controller = createCommerceController({ contract: options.contract || contract(), document, window, navigator, fetcher,
    monotonic: () => mono, setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: mono + delay }); return id; },
    clearTimer: id => timers.delete(id) });
  return { controller, document, window, navigator, slot, card, cta,
    text: () => slot.children.map(child => child.textContent).join('\n'),
    advance(ms) { mono += ms; for (const [id, task] of [...timers]) if (task.at <= mono) { timers.delete(id); task.fn(); } },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('approved Pre-Live allowlist stays static: disabled client makes zero network calls, including resume/offline', async () => {
  let calls = 0;
  const h = ui(() => { calls++; assert.fail('Pre-Live must not fetch'); }, { contract: {...commerceConfig,config:{...commerceConfig.config,enabled:false}}, deals: true });
  await h.controller.refresh(); h.window.dispatchEvent(new Event('pageshow'));
  h.window.dispatchEvent(new Event('offline')); h.window.dispatchEvent(new Event('online'));
  await tick(); assert.equal(calls, 0); assert.equal(h.slot.hidden, true);
  assert.ok(!h.text().includes('¥')); h.controller.dispose();
});

test('pending without previous state has no economics; concurrent refresh shares one request', async () => {
  let resolve, calls = 0;
  const h = ui(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = h.controller.refresh(); await tick();
  assert.equal(calls, 1); assert.ok(!h.text().includes('¥')); assert.match(h.text(), /確認しています/);
  assert.equal(h.cta.href, 'https://www.amazon.co.jp/dp/B000000001?tag=fixture-22');
  resolve(json(payload())); await pending;
  assert.match(h.text(), /¥9,000/); h.controller.dispose();
});
test('pending preserves existing valid state; timer still invalidates at freshness boundary', async () => {
  let resolve, calls = 0;
  const h = ui(() => ++calls === 1 ? Promise.resolve(json(payload())) : new Promise(done => { resolve = done; }));
  await h.controller.refresh();
  const pending = h.controller.refresh(); await tick();
  assert.match(h.text(), /¥9,000/); h.advance(3599999); assert.match(h.text(), /¥9,000/);
  h.advance(1); assert.ok(!h.text().includes('¥')); assert.match(h.text(), /現在の価格情報/); assert.ok(!h.text().includes('終了'));
  resolve(json({ ...payload(), serverNow: START + 3600000, items: {} })); await pending; h.controller.dispose();
});
test('known Deal ends: clears price/savings/API URL; expired text differs from stale', async () => {
  const item = rawItem(); item.offersV2.listings[0].dealDetails = { accessType: 'ALL', endTime: new Date(START + 300000).toISOString() };
  const h = ui(async () => json(payload(item)));
  await h.controller.refresh(); assert.match(h.text(), /¥9,000/); assert.match(h.cta.href, /linkCode/);
  h.advance(300000); assert.ok(!h.text().includes('¥')); assert.match(h.text(), /セール期間は終了/);
  assert.ok(!h.cta.href.includes('linkCode')); h.controller.dispose();
});
test('Deal without endTime does not expire by null coercion; it becomes stale after 60min', async () => {
  const item = rawItem(); item.offersV2.listings[0].dealDetails = { accessType: 'ALL' };
  const h = ui(async () => json(payload(item)), { deals: true }); await h.controller.refresh();
  assert.equal(h.card.hidden, false); assert.match(h.text(), /Deal対象/);
  h.advance(3600000); assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('終了')); h.controller.dispose();
});
test('new response with Deal gone uses only new normal price; regular fresh offer remains visible without SALE', async () => {
  const first = rawItem(); first.offersV2.listings[0].dealDetails = { accessType: 'ALL' };
  const next = rawItem(); next.offersV2.listings[0].price = { money: { amount: 9500, currency: 'JPY' } };
  let calls = 0; const h = ui(async () => json(payload(++calls === 1 ? first : next)), { deals: true });
  await h.controller.refresh(); assert.equal(h.card.hidden, false);
  await h.controller.refresh(); assert.equal(h.card.hidden, false); assert.match(h.text(), /¥9,500/); assert.ok(!h.text().includes('SALE'));  assert.ok(!h.text().includes('¥9,000')); assert.ok(!h.text().includes('Deal対象'));
  h.controller.dispose();
  const guide = ui(async () => json(payload(next))); await guide.controller.refresh(); assert.match(guide.text(), /¥9,500/); guide.controller.dispose();
});
test('no-offer/not-accessible/expired/stale preserve recommendation and ordinary CTA', async () => {
  for (const status of ['no-offer', 'not-accessible', 'expired', 'stale']) {
    const body = payload(); body.items.mock = { status, fetchedAt: START, expiresAt: START + 3600000, remainingMS: 0, offer: null };
    const h = ui(async () => json(body), {deals:true}); await h.controller.refresh(); assert.equal(h.card.hidden,false);
    assert.ok(!h.text().includes('¥')); assert.ok(h.cta.isConnected);
    assert.equal(h.cta.href, 'https://www.amazon.co.jp/dp/B000000001?tag=fixture-22');
    assert.equal(h.text().includes('終了'), status === 'expired'); h.controller.dispose();
  }
});
test('visibility/BFCache resume while request pending discards old response, revalidates once', async () => {
  const responses = []; let calls = 0;
  const h = ui(() => { calls++; return new Promise(resolve => responses.push(resolve)); });
  await tick(); assert.equal(calls, 1);
  h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'));
  h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'));
  h.window.dispatchEvent(new Event('pageshow'));
  responses[0](json(payload())); await tick(); await tick();
  assert.equal(calls, 2); assert.ok(!h.text().includes('¥'));
  responses[1](json(payload())); await h.controller.refresh(); assert.match(h.text(), /¥9,000/);
  h.window.dispatchEvent(new Event('pagehide')); assert.ok(!h.text().includes('¥')); h.controller.dispose();
});
test('offline event removes all Commerce; recovery never puts prices in browser storage', async () => {
  const h = ui(async (_url, init) => { assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit'); return json(payload()); });
  await h.controller.refresh(); h.navigator.onLine = false; h.window.dispatchEvent(new Event('offline'));
  assert.ok(!h.text().includes('¥')); assert.ok(!h.cta.href.includes('linkCode'));
  await h.controller.refresh(); assert.ok(!h.text().includes('¥')); h.controller.dispose();
});
test('worker down/CORS failure: no price, no stuck pending wording; ordinary CTA retained', async () => {
  for (const fetcher of [async () => { throw new Error('CORS mock'); }, async () => json({}, 503)]) {
    const h = ui(fetcher); await h.controller.refresh();
    assert.ok(!h.text().includes('¥')); assert.match(h.text(), /確認できません/); assert.ok(h.cta.isConnected); h.controller.dispose();
  }
});
test('network duration is subtracted from remaining freshness; expired response cannot revive price', async () => {
  let resolve; const h = ui(() => new Promise(done => { resolve = done; }));
  const pending = h.controller.refresh(); await tick(); h.advance(3600000); resolve(json(payload())); await pending;
  assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('終了')); h.controller.dispose();
});
test('publication disabled: zero fetches', async () => {
  const c = contract(); c.config.enabled = false;
  const h = ui(async () => assert.fail('fetch disabled'), { contract: c }); await h.controller.refresh();
  assert.equal(h.slot.hidden, true); h.controller.dispose();
});

test('production web scope: only canonical Deals reads; existing PWA and preview perform zero reads', async () => {
  for (const location of [{origin:'https://apps.yzrswork.com',pathname:'/mem/'},
    {origin:'https://apps.yzrswork.com',pathname:'/kit/'}, {origin:'https://preview.invalid',pathname:'/deals/'}]) {
    const h = ui(async () => assert.fail('outside normal web scope'), {contract:commerceConfig,location,deals:true});
    await h.controller.refresh(); h.window.dispatchEvent(new Event('pageshow')); await tick();
    assert.equal(h.card.hidden,false); assert.equal(h.slot.hidden,true); h.controller.dispose();
  }
  const c = contract(); c.config.webDisplayOn = ['deals']; let reads = 0;
  const h = ui(async () => {reads++;return json(payload());}, {contract:c,deals:true,
    location:{origin:'https://apps.yzrswork.com',pathname:'/deals/'}});
  await h.controller.refresh(); assert.equal(reads,1); assert.match(h.text(),/¥9,000/);
  assert.match(h.text(),/購入時にAmazon.co.jp/); assert.equal(h.card.hidden,false); h.controller.dispose();
});

test('SALE label requires policy thresholds; freshness expiry hides commerce and preserves recommendation', async () => {
  const h = ui(async () => json(payload()), {deals:true}); await h.controller.refresh();
  assert.match(h.text(),/SALE条件/); h.advance(3600000);
  assert.ok(!h.text().includes('SALE')); assert.ok(!h.text().includes('¥')); assert.equal(h.card.hidden,false);
  assert.equal(h.cta.href,'https://www.amazon.co.jp/dp/B000000001?tag=fixture-22'); h.controller.dispose();
});
test('payload revision, partial response, price/offer null, unsafe expiry and unknown fields', () => {
  const c = contract(); assert.ok(validatePayload(payload(), c).mock);
  assert.deepEqual(validatePayload({ ...payload(), catalogRevision: 'wrong' }, c), {});
  const partial = contract({ mock: product(), missing: product({ asin: 'B000000002' }) });
  assert.deepEqual(Object.keys(validatePayload(payload(), partial)), ['mock']);
  for (const mutate of [body => { body.items.mock.offer = null; }, body => { body.items.mock.offer.price = null; }, body => { body.items.mock.expiresAt += 1; }, body => { body.items.mock.remainingMS += 1; }]) {
    const body = payload(); mutate(body); assert.deepEqual(validatePayload(body, c), {});
  }
  const body = payload(); body.items.mock.offer.secret = 'not-projected';
  assert.ok(!JSON.stringify(validatePayload(body, c)).includes('secret'));
});
test('complete SALE product gate; explicit fresh/expired/stale/no-offer classification', () => {
  const p = product(), c = contract().config, offer = payload().items.mock.offer;
  assert.equal(saleEligible(p, offer, START, c), true);
  for (const override of [{ enabled: false }, { ownerReview: 'pending' }, { kind: 'search' }, { displayOn: ['mem'] }]) assert.equal(saleEligible({ ...p, ...override }, offer, START, c), false);
  assert.equal(offerState(null, START), 'no-offer'); assert.equal(saleEligible(p, null, START, c), false);
  assert.equal(offerState({ ...offer, price: null }, START), 'no-offer');
  assert.equal(offerState(offer, START + 3600000), 'stale');
  const expired = { ...offer, expiresAt: START + 1000, deal: { active: true, startAt: null, endAt: START + 1000 } };
  assert.equal(offerState(expired, START + 1000), 'expired'); assert.equal(saleEligible(p, expired, START + 1000, c), false);
  assert.equal(saleEligible(p, { ...offer, deal: { active: true, startAt: START + 1000, endAt: null } }, START, c), false);
});
