import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, snapshotKey } from '../../workers/commerce-api/worker.js';
import { commerceConfig } from '../../workers/commerce-api/generated-products.js';
import { MAX_AGE_MS, saleEligible } from '../../shared/commerce-policy.js';
import { MAX_IMAGE_AGE_MS, validProductImage, safeProductImageUrl } from '../../shared/product-image-policy.js';
import { harness, contract, rawItem, tokenResponse, json, offersRequest, START } from './fixtures.mjs';

// Fabricated metadata only. These tests never request or save image bytes.
const primaryImage = () => ({ url: 'https://m.media-amazon.com/images/I/MOCK-ONLY._SL160_.jpg', width: 160, height: 96 });
function itemWithImage(asin) {
  return { ...rawItem(asin), images: { primary: { medium: primaryImage() } } };
}
function setup(products, incoming, configOverrides = {}) {
  const h = harness(), calls = [], c = contract(products);
  c.config = { ...c.config, ...configOverrides };
  const worker = createWorker({ contract: c, clock: h.clock, sleep: h.sleep, timeoutMS: 20,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return url.includes('/auth/') ? tokenResponse() : json({ itemsResult: { items: typeof incoming === 'function' ? incoming() : incoming } });
    } });
  return { ...h, calls, worker, contract: c };
}
const body = async h => (await h.worker.fetch(offersRequest(), h.env)).json();

test('Crucial pilot: GetItems → normalization → KV → public payload preserves independent image lifetime', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  const h = setup({ [key]: product }, [itemWithImage(product.asin)]);
  assert.equal((await h.worker.scheduled({}, h.env)).status, 'updated');
  const apiRequest = JSON.parse(h.calls.find(call => call.url.includes('/catalog/')).init.body);
  assert.ok(apiRequest.resources.includes('images.primary.medium'));
  assert.deepEqual(apiRequest.itemIds, [product.asin]);
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey(h.contract.revision));
  assert.equal(stored.expiration, (START + MAX_IMAGE_AGE_MS) / 1000);
  const projected = (await body(h)).items[key];
  assert.equal(projected.status, 'fresh');
  assert.equal(projected.offer.price, 9000);
  assert.deepEqual(projected.image, { ...primaryImage(), fetchedAt: START, expiresAt: START + MAX_IMAGE_AGE_MS, remainingMS: MAX_IMAGE_AGE_MS });
  h.advance(MAX_AGE_MS);
  const stale = (await body(h)).items[key];
  assert.equal(stale.status, 'stale'); assert.equal(stale.offer, null);
  assert.equal(stale.image.remainingMS, MAX_IMAGE_AGE_MS - MAX_AGE_MS);
  assert.equal(h.calls.length, 2); // Reads never call Amazon or the image host.
});

test('image policy accepts only the verified HTTPS host, medium dimensions and bounded live metadata', () => {
  const value = { ...primaryImage(), fetchedAt: START, expiresAt: START + MAX_IMAGE_AGE_MS, extra: 'not-public' };
  assert.deepEqual(validProductImage(value, START), { ...primaryImage(), fetchedAt: START, expiresAt: START + MAX_IMAGE_AGE_MS });
  for (const unsafe of ['http://m.media-amazon.com/images/I/mock.jpg', 'https://evil.invalid/images/I/mock.jpg',
    'https://m.media-amazon.com.evil.invalid/images/I/mock.jpg', 'https://images-na.ssl-images-amazon.com/images/I/mock.jpg',
    'https://user:pass@m.media-amazon.com/images/I/mock.jpg', 'https://m.media-amazon.com:444/images/I/mock.jpg',
    'https://m.media-amazon.com/redirect?url=evil', 'https://m.media-amazon.com/images/I/mock.jpg#fragment',
    'https://m.media-amazon.com/images/I/mock.jpg#', ' https://m.media-amazon.com/images/I/mock.jpg', 'data:image/png;base64,mock']) {
    assert.equal(safeProductImageUrl(unsafe), null, unsafe);
  }
  for (const invalid of [null, [], {}, { ...value, width: 0 }, { ...value, height: 161 }, { ...value, width: 1.5 },
    { ...value, width: '160' }, { ...value, fetchedAt: START + 1 }, { ...value, expiresAt: START },
    { ...value, expiresAt: START + MAX_IMAGE_AGE_MS + 1 }]) assert.equal(validProductImage(invalid, START), null);
  assert.equal(validProductImage(value, START + MAX_IMAGE_AGE_MS), null);
});

test('missing, null, malformed or unsafe API images preserve the Crucial price, SALE eligibility and approved URL', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  for (const images of [undefined, null, {}, { primary: { medium: null } }, { primary: { medium: { ...primaryImage(), width: 0 } } },
    { primary: { medium: { ...primaryImage(), url: 'https://evil.invalid/images/I/mock.jpg' } } }]) {
    const item = { ...rawItem(product.asin), images }, h = setup({ [key]: product }, [item]);
    await h.worker.scheduled({}, h.env);
    const projected = (await body(h)).items[key];
    assert.equal(projected.image, null); assert.equal(projected.offer.price, 9000);
    assert.equal(saleEligible(product, projected.offer, START, h.contract.config), true);
    assert.equal(projected.offer.detailPageURL, item.detailPageURL);
    assert.equal(h.env.COMMERCE_SNAPSHOTS.puts[0].expiration, (START + MAX_AGE_MS) / 1000);
  }
});

test('valid image remains independent when the Crucial offer is unavailable or a Deal has ended', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  for (const mutate of [item => { item.offersV2 = null; }, item => {
    item.offersV2.listings[0].dealDetails = { accessType: 'ALL', endTime: new Date(START + 1000).toISOString() };
  }]) {
    const item = itemWithImage(product.asin); mutate(item);
    const h = setup({ [key]: product }, [item]); await h.worker.scheduled({}, h.env); h.advance(1000);
    const projected = (await body(h)).items[key];
    assert.equal(projected.offer, null); assert.ok(projected.image);
    assert.equal(projected.image.remainingMS, MAX_IMAGE_AGE_MS - 1000);
  }
});

test('expired or corrupt image metadata in a 24h snapshot never suppresses a fresh offer', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  const h = setup({ [key]: product }, [itemWithImage(product.asin)]); await h.worker.scheduled({}, h.env);
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey(h.contract.revision));
  for (const mutate of [image => { image.expiresAt = START; }, image => { image.url = 'https://evil.invalid/images/I/mock.jpg'; },
    image => { image.height = -1; }, image => { image.expiresAt = START + MAX_IMAGE_AGE_MS + 1; }]) {
    stored.value.items[key].image = { ...primaryImage(), fetchedAt: START, expiresAt: START + MAX_IMAGE_AGE_MS };
    mutate(stored.value.items[key].image);
    const projected = (await body(h)).items[key];
    assert.equal(projected.status, 'fresh'); assert.equal(projected.image, null);
    assert.equal(projected.offer.price, 9000); assert.equal(saleEligible(product, projected.offer, START, h.contract.config), true);
  }
});

test('old schemaVersion 1 snapshots without an image still project valid Crucial economics', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  const h = setup({ [key]: product }, [rawItem(product.asin)]); await h.worker.scheduled({}, h.env);
  const stored = h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey(h.contract.revision));
  delete stored.value.items[key].image;
  const projected = (await body(h)).items[key];
  assert.equal(projected.image, null); assert.equal(projected.offer.price, 9000);
});

test('API failure retains the original image deadline; Associate 403 removes offer and image together', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  for (const status of [503, 403]) {
    const h = setup({ [key]: product }, [itemWithImage(product.asin)]); await h.worker.scheduled({}, h.env); h.advance(MAX_AGE_MS + 1000);
    const failed = createWorker({ contract: h.contract, clock: h.clock, sleep: h.sleep, timeoutMS: 20,
      fetcher: async url => url.includes('/auth/') ? tokenResponse() : json({}, status) });
    assert.equal((await failed.scheduled({}, h.env)).status, 'unavailable');
    assert.equal(h.env.COMMERCE_SNAPSHOTS.puts.length, 1);
    const projected = (await (await failed.fetch(offersRequest(), h.env)).json()).items[key];
    if (status === 403) assert.equal(projected, undefined);
    else {
      assert.equal(projected.offer, null); assert.equal(projected.image.expiresAt, START + MAX_IMAGE_AGE_MS);
      assert.equal(h.env.COMMERCE_SNAPSHOTS.data.get(snapshotKey(h.contract.revision)).expiration, (START + MAX_IMAGE_AGE_MS) / 1000);
    }
    h.advance(MAX_IMAGE_AGE_MS);
    assert.deepEqual((await (await failed.fetch(offersRequest(), h.env)).json()).items, {});
  }
});

test('image is associated only after matching ASIN and a safe approved detail URL', async () => {
  const key = 'mem-crucial-ddr4-32', product = commerceConfig.products[key];
  for (const item of [itemWithImage('B000000001'), { ...itemWithImage(product.asin), detailPageURL: 'https://evil.invalid/dp/mock' }]) {
    const h = setup({ [key]: product }, [item]); await h.worker.scheduled({}, h.env);
    const projected = (await body(h)).items[key];
    assert.equal(projected.offer, null); assert.equal(projected.image, null);
  }
});

const sixKeys = Object.freeze(['mem-crucial-ddr4-32', 'mem-crucial-ddr5-32', 'solder-hakko-fx600a',
  'tool-engineer-paw01', 'hdd-wd-blue-4tb-wd40ezax-ajp', 'solder-goot-sd83']);
function sixItems() {
  return sixKeys.map((key, index) => {
    const item = itemWithImage(commerceConfig.products[key].asin);
    item.detailPageURL = `https://www.amazon.co.jp/dp/${item.asin}?tag=${commerceConfig.config.associateTag}&linkCode=ogi`;
    item.images.primary.medium = { ...primaryImage(), height: 96 + index * 8,
      url: `https://m.media-amazon.com/images/I/MOCK-ONLY-${item.asin}._SL160_.jpg` };
    return item;
  });
}

test('six approved products: reversed upstream order joins by ASIN and preserves frozen editorial order, economics and CTA', async () => {
  assert.deepEqual(Object.keys(commerceConfig.products), sixKeys);
  const before = JSON.stringify(commerceConfig.products), incoming = sixItems();
  const h = setup(commerceConfig.products, [...incoming].reverse(), { associateTag: commerceConfig.config.associateTag });
  assert.deepEqual(await h.worker.scheduled({}, h.env), { status: 'updated', itemCount: 6 });
  const apiRequest = JSON.parse(h.calls.find(call => call.url.includes('/catalog/')).init.body);
  assert.deepEqual(apiRequest.itemIds, sixKeys.map(key => commerceConfig.products[key].asin));
  assert.equal(apiRequest.partnerTag, commerceConfig.config.associateTag);
  assert.ok(apiRequest.resources.includes('images.primary.medium'));
  const projected = (await body(h)).items;
  assert.deepEqual(Object.keys(projected), sixKeys);
  for (const [index, key] of sixKeys.entries()) {
    const item = projected[key], product = commerceConfig.products[key];
    assert.equal(item.status, 'fresh'); assert.equal(item.offer.asin, product.asin);
    assert.equal(item.offer.price, 9000); assert.equal(item.offer.savingsJPY, 1000); assert.equal(item.offer.savingsPercent, 10);
    assert.equal(item.offer.detailPageURL, incoming[index].detailPageURL);
    assert.deepEqual(item.image, { ...incoming[index].images.primary.medium, fetchedAt: START,
      expiresAt: START + MAX_IMAGE_AGE_MS, remainingMS: MAX_IMAGE_AGE_MS });
    assert.equal(saleEligible(product, item.offer, START, h.contract.config), true);
  }
  h.advance(MAX_AGE_MS);
  const stale = (await body(h)).items;
  assert.deepEqual(Object.keys(stale), sixKeys);
  for (const key of sixKeys) {
    assert.equal(stale[key].offer, null); assert.equal(stale[key].status, 'stale');
    assert.equal(stale[key].image.remainingMS, MAX_IMAGE_AGE_MS - MAX_AGE_MS);
  }
  assert.equal(h.calls.length, 2); assert.equal(JSON.stringify(commerceConfig.products), before);
});

test('six-product mixed image failures affect only images; no-offer retains current image and active Deal still grants SALE', async () => {
  const incoming = sixItems();
  delete incoming[1].images;
  incoming[2].images.primary.medium.width = 0;
  incoming[3].images.primary.medium.url = 'https://evil.invalid/images/I/mock.jpg';
  incoming[4].offersV2 = null;
  incoming[5].offersV2.listings[0].price = { money: { amount: 9500, currency: 'JPY' } };
  incoming[5].offersV2.listings[0].dealDetails = { accessType: 'ALL' };
  const h = setup(commerceConfig.products, [...incoming].reverse(), { associateTag: commerceConfig.config.associateTag });
  assert.equal((await h.worker.scheduled({}, h.env)).status, 'updated');
  const projected = (await body(h)).items;
  assert.deepEqual(Object.keys(projected), sixKeys);
  for (const [index, key] of sixKeys.entries()) {
    const item = projected[key], product = commerceConfig.products[key];
    if ([1, 2, 3].includes(index)) assert.equal(item.image, null);
    else assert.ok(item.image);
    if (index === 4) { assert.equal(item.status, 'no-offer'); assert.equal(item.offer, null); continue; }
    assert.equal(item.status, 'fresh'); assert.equal(item.offer.asin, product.asin);
    assert.equal(item.offer.price, index === 5 ? 9500 : 9000);
    assert.equal(item.offer.detailPageURL, incoming[index].detailPageURL);
    assert.equal(saleEligible(product, item.offer, START, h.contract.config), true);
  }
  assert.equal(h.env.COMMERCE_SNAPSHOTS.puts[0].expiration, (START + MAX_IMAGE_AGE_MS) / 1000);
  assert.equal(h.calls.length, 2);
});
