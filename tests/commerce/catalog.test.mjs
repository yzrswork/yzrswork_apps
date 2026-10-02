import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCommerceCatalog, commerceProjection } from '../../scripts/commerce-catalog.mjs';
import { matchesMemory, saleEligible } from '../../shared/commerce-policy.js';
import { product, contract, START, rawItem } from './fixtures.mjs';
import { normalizeItem } from '../../workers/commerce-api/normalize.js';

const catalog = JSON.parse(readFileSync(new URL('../../site/catalog.json', import.meta.url)));
test('real catalog: three pending ASINs remain disabled; no public/Worker allowlist', () => {
  assert.deepEqual(validateCommerceCatalog(catalog), []);
  assert.deepEqual(commerceProjection(catalog).products, {});
  for (const p of Object.values(catalog.site.affiliate.products).filter(p => p.kind === 'product')) {
    assert.equal(p.ownerReview, 'pending'); assert.equal(p.enabled, false); assert.equal(p.evidence, null);
  }
  assert.equal(catalog.site.commerce.enabled, false);
  assert.equal(catalog.site.commerce.liveApiApproved, false);
  assert.equal(catalog.site.commerce.amazonSupportApproved, false);
});
test('pending cannot be enabled; approved cannot bypass product review; dynamic data rejected', () => {
  for (const mutate of [p => { p.enabled = true; }, p => { p.ownerReview = 'approved'; p.enabled = true; }, p => { p.price = 9000; }]) {
    const fixture = structuredClone(catalog); mutate(fixture.site.affiliate.products['mem-team-ddr4-32']);
    assert.ok(validateCommerceCatalog(fixture).length); assert.throws(() => commerceProjection(fixture));
  }
});
test('one Product Authority/revision: fabricated approval changes generated revision, not source values', () => {
  const fixture = structuredClone(catalog), before = commerceProjection(fixture).revision;
  fixture.site.affiliate.products.mock = product();
  assert.deepEqual(validateCommerceCatalog(fixture), []);
  assert.notEqual(commerceProjection(fixture).revision, before);
  fixture.site.commerce.enabled = true;
  assert.ok(validateCommerceCatalog(fixture).some(e => e.includes('gates')));
});
test('mem: confirmed DDR, accepted candidate, capacity and intended use are all required', () => {
  const context = { accepted: true, ddr: 'DDR4', useCase: 'game', minGB: 16, maxGB: 32 };
  assert.equal(matchesMemory(product(), context), true);
  for (const override of [{ accepted: false }, { ddr: null }, { ddr: 'DDR5' }, { useCase: 'web', minGB: 8, maxGB: 16 }]) {
    assert.equal(matchesMemory(product(), { ...context, ...override }), false);
  }
  assert.equal(matchesMemory(product({ ownerReview: 'pending' }), context), false);
  assert.equal(matchesMemory(product({ enabled: false }), context), false);
});
test('SALE gate: both savings thresholds, active Deal without times, expired exclusion', () => {
  const p = product(), config = contract().config;
  const offer = { ...normalizeItem(rawItem(), p, config, START, START).offer,
    price: 4500, savingsPercent: 10, savingsJPY: 500, savingBasis: 5000 };
  assert.equal(saleEligible(p, offer, START, config), true);
  assert.equal(saleEligible(p, { ...offer, savingsPercent: 9 }, START, config), false);
  assert.equal(saleEligible(p, { ...offer, price: 4501, savingsJPY: 499 }, START, config), false);
  assert.equal(saleEligible(p, { ...offer, savingsPercent: null, deal: { active: true, startAt: null, endAt: null } }, START, config), true);
  assert.equal(saleEligible(p, { ...offer, expiresAt: START + 1000, deal: { active: true, startAt: null, endAt: START + 1000 } }, START + 1000, config), false);
});
