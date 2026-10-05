// Fabricated metadata only. These tests never fetch or store Amazon image bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommerceController, validatePayload } from '../../shared/commerce.js';
import { createWorker } from '../../workers/commerce-api/worker.js';
import { normalizeItem } from '../../workers/commerce-api/normalize.js';
import { contract, product, rawItem, START, json, harness, tokenResponse, offersRequest } from './fixtures.mjs';
import { commerceConfig } from '../../shared/commerce-config.js';

const IMAGE_AGE_MS = 24 * 60 * 60 * 1000;
const IMAGE_URL = 'https://m.media-amazon.com/images/I/mock-only.jpg';
const tick = () => new Promise(resolve => setImmediate(resolve));

function image(overrides = {}, now = START) {
  return { url: IMAGE_URL, width: 160, height: 120, fetchedAt: START,
    expiresAt: START + IMAGE_AGE_MS, remainingMS: START + IMAGE_AGE_MS - now, ...overrides };
}

function payload({ image: metadata = image(), omitImage = false, status = 'fresh', now = START } = {}) {
  const normalized = normalizeItem(rawItem(), product(), contract().config, START, now);
  const item = { ...normalized, remainingMS: normalized.offer ? normalized.expiresAt - now : 0 };
  delete item.image;
  if (status !== 'fresh') Object.assign(item, { status, offer: null, remainingMS: 0 });
  if (!omitImage) item.image = metadata;
  return { schemaVersion: 1, catalogRevision: 'mock-revision', status: 'ok', serverNow: now, items: { mock: item } };
}

function element(tagName = 'div') {
  const attributes = new Map();
  return { tagName: tagName.toUpperCase(), children: [], textContent: '', hidden: true, isConnected: true,
    dataset: {}, className: '',
    replaceChildren(...values) { this.children = values; }, append(value) { this.children.push(value); },
    setAttribute(name, value) { attributes.set(name, String(value)); this[name] = String(value); },
    getAttribute(name) { return attributes.get(name) ?? this[name] ?? null; },
    removeAttribute(name) { attributes.delete(name); delete this[name]; },
    querySelector(selector) { return selector === 'img' ? this.children.find(child => child.tagName === 'IMG') || null : null; },
  };
}

// Same controller harness approach as client.test.mjs, with separate image slots
// so metadata failures cannot be mistaken for recommendation or offer failures.
function ui(fetcher, options = {}) {
  let mono = 0, sequence = 0;
  const timers = new Map(), c = options.contract || contract();
  const window = new EventTarget(), document = new EventTarget(), navigator = { onLine: true };
  window.location = options.location;
  document.visibilityState = 'visible';
  const rows = Object.entries(c.products).map(([key, p]) => {
    const card = { ...element(), hidden: false, recommendation: p.recommendationReason };
    const slot = { ...element(), dataset: { commerceSlot: key }, closest: () => card };
    const href = `https://www.amazon.co.jp/dp/${p.asin}?tag=${c.config.associateTag}`;
    const cta = { ...element('a'), hidden: false, href };
    const img = { ...element('img'), hidden: false, alt: '' };
    const anchor = { ...element('a'), href, dataset: { commerceImage: key, amazonHref: href }, children: [img] };
    return { key, card, slot, cta, img, anchor, originalHref: href };
  });
  document.createElement = tag => element(tag);
  document.querySelectorAll = selector => selector === '[data-commerce-image]' ? rows.map(row => row.anchor) :
    selector === '[data-deals-card]' ? rows.map(row => row.card) : rows.map(row => row.slot);
  document.querySelector = selector => {
    const match = /^\[data-commerce-(cta|image)="([^"]+)"\]$/.exec(selector);
    const row = match && rows.find(row => row.key === match[2]);
    return row ? match[1] === 'cta' ? row.cta : row.anchor : null;
  };
  const controller = createCommerceController({ contract: c, document, window, navigator, fetcher,
    monotonic: () => mono,
    setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: mono + delay }); return id; },
    clearTimer: id => timers.delete(id) });
  return { controller, document, window, navigator, contract: c, rows, ...rows[0],
    text: (row = rows[0]) => row.slot.children.map(child => child.textContent).join('\n'),
    visibleImage: (row = rows[0]) => !row.anchor.hidden && !row.img.hidden && Boolean(row.img.src),
    load: (row = rows[0]) => row.img.onload?.(),
    fail: (row = rows[0]) => row.img.onerror?.(),
    advance(ms) {
      mono += ms;
      for (const [id, task] of [...timers]) if (task.at <= mono) { timers.delete(id); task.fn(); }
    },
  };
}

function assertRecommendation(h, row = h.rows[0]) {
  assert.equal(row.card.hidden, false);
  assert.equal(row.card.recommendation, h.contract.products[row.key].recommendationReason);
  assert.equal(row.cta.isConnected, true);
}

test('image payload is optional and valid metadata is projected without unapproved fields', () => {
  const c = contract(), body = payload();
  body.items.mock.image.unapproved = 'not-projected';
  const valid = validatePayload(body, c).mock;
  assert.ok(valid.offer);
  assert.deepEqual(valid.image, image());
  assert.ok(!JSON.stringify(valid).includes('not-projected'));
  for (const body of [payload({ image: null }), payload({ omitImage: true })]) {
    const item = validatePayload(body, c).mock;
    assert.ok(item.offer);
    assert.equal(item.offer.price, 9000);
    assert.equal(item.image ?? null, null);
  }
});

test('unsafe/malformed/expired image metadata fails independently of fresh offer validation', () => {
  const cases = [null, {}, [], 'image',
    image({ url: 'http://m.media-amazon.com/images/I/mock-only.jpg' }),
    image({ url: 'https://m.media-amazon.com.evil.invalid/images/I/mock-only.jpg' }),
    image({ url: 'https://example.invalid/images/I/mock-only.jpg' }),
    image({ url: 'data:image/png;base64,mock-only' }),
    image({ url: 'https://fixture:mocks@m.media-amazon.com/images/I/mock-only.jpg' }),
    image({ url: `${IMAGE_URL}#fragment` }),
    image({ width: 0 }), image({ height: -1 }), image({ width: 1.5 }), image({ height: 161 }),
    image({ fetchedAt: START + 1 }), image({ expiresAt: START }),
    image({ expiresAt: START + IMAGE_AGE_MS + 1 }), image({ remainingMS: 0 }),
    image({ remainingMS: -1 }), image({ remainingMS: IMAGE_AGE_MS + 1 }), image({ remainingMS: Infinity })];
  const expectedOffer = validatePayload(payload({ image: null }), contract()).mock.offer;
  for (const metadata of cases) {
    const item = validatePayload(payload({ image: metadata }), contract()).mock;
    assert.ok(item, JSON.stringify(metadata));
    assert.deepEqual(item.offer, expectedOffer, JSON.stringify(metadata));
    assert.equal(item.image ?? null, null, JSON.stringify(metadata));
  }
});

test('exact Crucial pilot crosses fabricated GetItems → Worker → KV → payload → browser thumbnail with no image-byte fetch', async () => {
  const key = 'mem-crucial-ddr4-32', p = commerceConfig.products[key], c = contract({ [key]: p });
  const upstream = rawItem(p.asin);
  upstream.images = { primary: { medium: { url: IMAGE_URL, width: 160, height: 120 } } };
  const storage = harness(), calls = [];
  const worker = createWorker({ contract: c, clock: storage.clock, sleep: storage.sleep, timeoutMS: 20,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      assert.ok(!url.startsWith('https://m.media-amazon.com/'));
      return url.includes('/auth/') ? tokenResponse() : json({ itemsResult: { items: [upstream] } });
    } });
  assert.equal((await worker.scheduled({}, storage.env)).status, 'updated');
  const request = JSON.parse(calls.find(call => call.url.includes('/catalog/')).init.body);
  assert.deepEqual(request.itemIds, [p.asin]); assert.ok(request.resources.includes('images.primary.medium'));
  const h = ui(() => worker.fetch(offersRequest(), storage.env), { contract: c });
  try {
    await h.controller.refresh(); h.load();
    assert.equal(h.visibleImage(), true); assert.equal(h.img.src, IMAGE_URL);
    assert.equal(h.key, key); assertRecommendation(h);
    assert.match(h.text(), /¥9,000/); assert.match(h.text(), /SALE条件/);
    assert.equal(h.anchor.href, h.cta.href); assert.equal(calls.length, 2);
  } finally { h.controller.dispose(); }
});

test('Fresh Offer plus valid image displays thumbnail after load with approved CTA, SALE and metadata dimensions', async () => {
  const h = ui(async () => json(payload()));
  try {
    await h.controller.refresh();
    assert.equal(h.img.src, IMAGE_URL);
    assert.equal(Number(h.img.width), 160); assert.equal(Number(h.img.height), 120);
    h.load();
    assert.equal(h.visibleImage(), true);
    assert.match(h.text(), /¥9,000/); assert.match(h.text(), /SALE条件/);
    assert.equal(h.anchor.href, h.cta.href);
    assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('Fresh Offer plus missing/null/unsafe image preserves price, SALE and explicit CTA with natural hidden-image fallback', async () => {
  for (const options of [{ omitImage: true }, { image: null }, { image: image({ url: 'https://unsafe.invalid/image.jpg' }) }]) {
    const h = ui(async () => json(payload(options)));
    try {
      await h.controller.refresh(); h.load();
      assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
      assert.match(h.text(), /¥9,000/); assert.match(h.text(), /SALE条件/);
      assert.match(h.cta.href, /linkCode=ogi/); assertRecommendation(h);
    } finally { h.controller.dispose(); }
  }
});

test('image loading failure collapses only image layout; price, SALE, recommendation and CTA remain intact', async () => {
  const h = ui(async () => json(payload()));
  try {
    await h.controller.refresh(); h.load();
    const economics = h.text(), href = h.cta.href;
    h.fail();
    assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
    assert.equal(h.text(), economics); assert.equal(h.cta.href, href); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('image expiry removes thumbnail at exact deadline while fresh price/SALE/CTA persist', async () => {
  const h = ui(async () => json(payload({ image: image({ expiresAt: START + 30_000, remainingMS: 30_000 }) })));
  try {
    await h.controller.refresh(); h.load();
    h.advance(29_999); assert.equal(h.visibleImage(), true);
    h.advance(1); assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
    assert.match(h.text(), /¥9,000/); assert.match(h.text(), /SALE条件/);
    assert.match(h.cta.href, /linkCode=ogi/); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('offer freshness expires independently; current image remains only until exact 24-hour boundary', async () => {
  const h = ui(async () => json(payload()));
  try {
    await h.controller.refresh(); h.load();
    h.advance(3_600_000);
    assert.equal(h.visibleImage(), true); assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('SALE'));
    assert.equal(h.cta.href, h.originalHref); assert.equal(h.anchor.href, h.cta.href); assertRecommendation(h);
    h.advance(IMAGE_AGE_MS - 3_600_000 - 1); assert.equal(h.visibleImage(), true);
    h.advance(1); assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
    assert.equal(h.cta.href, h.originalHref); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('no-offer/not-accessible/stale/expired economics still permit independently current image and ordinary CTA', async () => {
  for (const status of ['no-offer', 'not-accessible', 'stale', 'expired']) {
    const h = ui(async () => json(payload({ status })));
    try {
      await h.controller.refresh(); h.load();
      assert.equal(h.visibleImage(), true); assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('SALE'));
      assert.equal(h.cta.href, h.originalHref); assert.equal(h.anchor.href, h.originalHref); assertRecommendation(h);
    } finally { h.controller.dispose(); }
  }
});

test('malformed economics fail closed without discarding valid independent image metadata', async () => {
  const body = payload(); body.items.mock.offer.price = -1;
  const h = ui(async () => json(body));
  try {
    await h.controller.refresh(); h.load();
    assert.equal(h.visibleImage(), true); assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('SALE'));
    assert.equal(h.cta.href, h.originalHref); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('response latency is subtracted from image freshness without invalidating still-current offer', async () => {
  let resolve;
  const h = ui(() => new Promise(done => { resolve = done; }));
  try {
    const pending = h.controller.refresh(); await tick(); h.advance(30_000);
    resolve(json(payload({ image: image({ expiresAt: START + 30_000, remainingMS: 30_000 }) }))); await pending;
    h.load();
    assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
    assert.match(h.text(), /¥9,000/); assert.match(h.text(), /SALE条件/); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('in-flight refresh preserves valid image until its own expiry and new null response cannot revive old load event', async () => {
  let resolve, calls = 0;
  const h = ui(() => ++calls === 1 ? Promise.resolve(json(payload({ image: image({ expiresAt: START + 30_000, remainingMS: 30_000 }) }))) :
    new Promise(done => { resolve = done; }));
  try {
    await h.controller.refresh(); h.load(); const oldLoad = h.img.onload;
    const pending = h.controller.refresh(); await tick();
    assert.equal(h.visibleImage(), true); h.advance(30_000); assert.equal(h.anchor.hidden, true);
    resolve(json(payload({ image: null, now: START + 30_000 }))); await pending;
    oldLoad?.();
    assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
    assert.match(h.text(), /¥9,000/); assertRecommendation(h);
  } finally { h.controller.dispose(); }
});

test('offline, pagehide and disposal discard image URL references and preserve static recommendation/CTA', async () => {
  for (const event of ['offline', 'pagehide', 'dispose']) {
    const h = ui(async () => json(payload()));
    try {
      await h.controller.refresh(); h.load();
      if (event === 'dispose') h.controller.dispose(); else h.window.dispatchEvent(new Event(event));
      assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
      assert.ok(!h.img.src); assert.ok(!h.text().includes('¥'));
      assert.equal(h.cta.href, h.originalHref); assertRecommendation(h);
    } finally { h.controller.dispose(); }
  }
});

test('API/KV failure collapses image but retains recommendation and approved ordinary CTA', async () => {
  for (const fail of [async () => { throw new Error('fixture outage'); }, async () => json({}, 503)]) {
    let calls = 0;
    const h = ui(() => ++calls === 1 ? Promise.resolve(json(payload())) : fail());
    try {
      await h.controller.refresh(); h.load(); await h.controller.refresh();
      assert.equal(h.anchor.hidden, true); assert.equal(h.visibleImage(), false);
      assert.ok(!h.text().includes('¥')); assert.ok(!h.text().includes('SALE'));
      assert.equal(h.cta.href, h.originalHref); assertRecommendation(h);
    } finally { h.controller.dispose(); }
  }
});

test('disabled publication and pages outside Deals initiate no image or offer reads', async () => {
  const disabled = contract(); disabled.config.enabled = false;
  const cases = [{ contract: disabled },
    { contract: commerceConfig, location: { origin: 'https://apps.yzrswork.com', pathname: '/mem/' } },
    { contract: commerceConfig, location: { origin: 'https://preview.invalid', pathname: '/deals/' } }];
  for (const options of cases) {
    const h = ui(async () => assert.fail('outside approved publication must not fetch'), options);
    try {
      await h.controller.refresh(); h.window.dispatchEvent(new Event('pageshow')); await tick();
      for (const row of h.rows) { assert.equal(row.anchor.hidden, true); assert.ok(!row.img.src); assert.equal(row.cta.href, row.originalHref); }
    } finally { h.controller.dispose(); }
  }
});

test('all six approved products preserve editorial order, recommendation, SALE and CTA through mixed image outcomes', async () => {
  const expected = ['mem-crucial-ddr4-32', 'mem-crucial-ddr5-32', 'solder-hakko-fx600a',
    'tool-engineer-paw01', 'hdd-wd-blue-4tb-wd40ezax-ajp', 'solder-goot-sd83'];
  const c = commerceConfig;
  assert.deepEqual(Object.keys(c.products), expected);
  const html = readFileSync(new URL('../../deals/index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/data-deals-card="([^"]+)"/g)].map(match => match[1]), expected);
  function sixPayload(mixed = false) {
    const items = Object.fromEntries(Object.entries(c.products).map(([key, p], index) => {
      const raw = rawItem(p.asin);
      raw.detailPageURL = `https://www.amazon.co.jp/dp/${p.asin}?tag=${c.config.associateTag}&linkCode=ogi`;
      const normalized = normalizeItem(raw, p, c.config, START, START);
      const metadata = image({ url: `https://m.media-amazon.com/images/I/mock-only-${index}.jpg`,
        width: index % 2 ? 80 : 160, height: index % 2 ? 160 : 80 });
      const item = { ...normalized, remainingMS: normalized.expiresAt - START, image: metadata };
      if (mixed) {
        if (index === 1) item.image = null;
        if (index === 2) item.image = { ...metadata, width: 0 };
        if (index === 3) item.image = { ...metadata, expiresAt: START, remainingMS: 0 };
        if (index === 4) delete item.image;
      }
      return [key, item];
    }).reverse()); // API order cannot replace editorial authority.
    return { schemaVersion: 1, catalogRevision: c.revision, status: 'ok', serverNow: START, items };
  }
  let calls = 0;
  const h = ui(async () => json(sixPayload(++calls > 1)), {
    contract: c, location: { origin: 'https://apps.yzrswork.com', pathname: '/deals/' } });
  try {
    await h.controller.refresh();
    assert.deepEqual(Object.keys(validatePayload(sixPayload(), c)), expected);
    for (const row of h.rows) {
      h.load(row); assert.equal(h.visibleImage(row), true); assertRecommendation(h, row);
      assert.match(h.text(row), /¥9,000/); assert.match(h.text(row), /SALE条件/);
      assert.equal(row.anchor.href, row.cta.href);
    }
    await h.controller.refresh(); h.load(h.rows[0]); h.load(h.rows[5]); h.fail(h.rows[5]);
    assert.deepEqual(h.rows.filter(row => h.visibleImage(row)).map(row => row.key), [expected[0]]);
    assert.deepEqual(h.rows.filter(row => !row.card.hidden).map(row => row.key), expected);
    for (const row of h.rows) {
      assertRecommendation(h, row); assert.match(h.text(row), /¥9,000/); assert.match(h.text(row), /SALE条件/);
      assert.match(row.cta.href, /linkCode=ogi/);
    }
  } finally { h.controller.dispose(); }
});
