import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from '../../workers/commerce-api/normalize.js';
import { START, rawItem, product, contract } from './fixtures.mjs';

const normalize = item => normalizeItem(item, product(), contract().config, START, START);
test('OffersV2 money wrapper; one listing only; no first-listing or seller inference', () => {
  const item = rawItem();
  item.offersV2.listings.unshift({ condition: { value: 'Used' }, isBuyBoxWinner: false, price: { money: { amount: 1, currency: 'JPY' } } });
  const result = normalize(item);
  assert.equal(result.status, 'fresh'); assert.equal(result.offer.price, 9000);
  assert.equal(result.offer.savingsPercent, 10); assert.equal(result.offer.savingsJPY, 1000);
  assert.ok(!Object.hasOwn(result.offer, 'merchantInfo'));
});
const cases = [
  ['Offerなし', item => { item.offersV2 = null; }, 'no-offer'],
  ['price null', item => { item.offersV2.listings[0].price = null; }, 'no-price'],
  ['old price path', item => { item.offersV2.listings[0].price = { amount: 9000 }; }, 'no-price'],
  ['availabilityなし', item => { delete item.offersV2.listings[0].availability; }, 'unavailable'],
  ['availability未知', item => { item.offersV2.listings[0].availability.type = 'UNKNOWN'; }, 'unavailable'],
  ['MAP true', item => { item.offersV2.listings[0].violatesMAP = true; }, 'unsafe-offer'],
  ['MAP missing', item => { delete item.offersV2.listings[0].violatesMAP; }, 'unsafe-offer'],
  ['subscription', item => { item.offersV2.listings[0].type = 'SUBSCRIBE_AND_SAVE'; }, 'unsafe-offer'],
  ['duplicate BuyBox', item => { item.offersV2.listings.push(structuredClone(item.offersV2.listings[0])); }, 'unsafe-offer'],
  ['foreign currency', item => { item.offersV2.listings[0].price.money.currency = 'USD'; }, 'no-price'],
  ['bad tag', item => { item.detailPageURL = 'https://www.amazon.co.jp/dp/B000000001?tag=wrong-22'; }, 'unsafe-url'],
  ['URL mismatch', item => { item.detailPageURL = 'https://www.amazon.co.jp/dp/B000000002?tag=fixture-22'; }, 'unsafe-url'],
  ['unsafe domain', item => { item.detailPageURL = 'https://www.amazon.co.jp.evil.invalid/dp/B000000001?tag=fixture-22'; }, 'unsafe-url'],
];
for (const [name, mutate, status] of cases) test(name, () => { const item = rawItem(); mutate(item); const result = normalize(item); assert.equal(result.status, status); assert.equal(result.offer, null); });
test('missing/inconsistent Savings never fabricated; regular price retained', () => {
  const item = rawItem(); item.offersV2.listings[0].price.savings.money.amount = 50;
  const result = normalize(item); assert.equal(result.status, 'fresh'); assert.equal(result.offer.savingsPercent, null);
  delete item.offersV2.listings[0].price.savings;
  assert.equal(normalize(item).offer.savingsJPY, null);
});
test('Deal no times stays live only within snapshot; Prime conditions explicit; no badge/countdown leak', () => {
  for (const access of ['ALL', 'PRIME_EXCLUSIVE']) {
    const item = rawItem(); item.offersV2.listings[0].dealDetails = { accessType: access, badge: 'Ends in ' };
    const result = normalize(item);
    assert.equal(result.offer.deal.active, true); assert.equal(result.offer.primeExclusive, access === 'PRIME_EXCLUSIVE');
    assert.equal(result.expiresAt, START + 3600000); assert.ok(!JSON.stringify(result).includes('Ends in'));
  }
});
for (const [name, details, status] of [
  ['expired Deal', { endTime: new Date(START).toISOString() }, 'expired'],
  ['future Deal', { startTime: new Date(START + 1000).toISOString() }, 'not-started'],
  ['invalid time', { endTime: 'bad-date' }, 'unsafe-deal'],
  ['unknown access', { accessType: 'UNKNOWN' }, 'unsafe-deal'],
  ['early access unvalidated', { accessType: 'PRIME_EARLY_ACCESS', earlyAccessDurationInMilliseconds: 1800000 }, 'unsafe-deal'],
  ['claimed 100%', { percentClaimed: 100 }, 'unsafe-deal'],
]) test(name, () => {
  const item = rawItem(); item.offersV2.listings[0].dealDetails = { accessType: 'ALL', ...details };
  const result = normalize(item); assert.equal(result.status, status); assert.equal(result.offer, null);
});
test('freshness counted from request start; Deal end shortens expiry', () => {
  const item = rawItem(); item.offersV2.listings[0].dealDetails = { accessType: 'ALL', endTime: new Date(START + 300000).toISOString() };
  assert.equal(normalize(item).expiresAt, START + 300000);
  const result = normalizeItem(rawItem(), product(), contract().config, START, START + 3600000);
  assert.equal(result.status, 'stale'); assert.equal(result.offer, null);
});
