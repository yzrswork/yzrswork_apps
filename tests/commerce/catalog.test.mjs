import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCommerceCatalog, commerceProjection } from '../../scripts/commerce-catalog.mjs';
import { matchesMemory, saleEligible } from '../../shared/commerce-policy.js';
import { product, contract, START, rawItem } from './fixtures.mjs';
import { normalizeItem } from '../../workers/commerce-api/normalize.js';
import { commerceConfig as browser } from '../../shared/commerce-config.js';
import { commerceConfig as worker } from '../../workers/commerce-api/generated-products.js';

const catalog = JSON.parse(readFileSync(new URL('../../site/catalog.json', import.meta.url)));
test('real catalog: six Owner-approved products; TEAMGROUP remains pending; production normal web only', () => {
  assert.deepEqual(validateCommerceCatalog(catalog), []);
  const projection = commerceProjection(catalog);
  assert.deepEqual(browser, projection); assert.deepEqual(worker, projection);
  assert.deepEqual(Object.keys(projection.products), [
    'mem-crucial-ddr4-32',
    'mem-crucial-ddr5-32',
    'solder-hakko-fx600a',
    'tool-engineer-paw01',
    'hdd-wd-blue-4tb-wd40ezax-ajp',
    'solder-goot-sd83',
  ]);
  assert.deepEqual(Object.values(projection.products).map(p => [p.model, p.asin]), [
    ['CP2K16G4DFRA32A', 'B0C29R9LNL'],
    ['CP2K16G60C48U5', 'B0CT9BMGLF'],
    ['FX600A', 'B076KMS5CV'],
    ['PAW-01', 'B072BYT2V3'],
    ['WD40EZAX-AJP', 'B0CKLCK9SW'],
    ['SD-83', 'B0C8YYM78X'],
  ]);
  for (const p of Object.values(projection.products)) {
    assert.equal(p.ownerReview, 'approved'); assert.equal(p.enabled, true);
    assert.ok(p.specSummary); assert.ok(p.recommendationReason); assert.ok(p.evidence);
    assert.ok(p.displayOn.includes('deals'));
  }
  const sd83 = projection.products['solder-goot-sd83'];
  assert.equal(sd83.evidence.level, 'used');
  assert.match(sd83.note, /鉛入り/); assert.match(sd83.note, /換気/); assert.match(sd83.note, /手を洗/);
  const pending = catalog.site.affiliate.products['mem-team-ddr4-32'];
  assert.equal(pending.ownerReview, 'pending'); assert.equal(pending.enabled, false); assert.equal(pending.evidence, null);
  assert.equal(catalog.site.commerce.enabled, true);
  assert.deepEqual(catalog.site.commerce.webDisplayOn, ['deals']);
  assert.equal(catalog.site.commerce.liveApiApproved, true);
  assert.equal(catalog.site.commerce.amazonSupportApproved, true);
});
test('static Deals: all approved cards use generic spec summaries; Trust/reason before price slot', () => {
  const html = readFileSync(new URL('../../deals/index.html', import.meta.url), 'utf8');
  assert.equal([...html.matchAll(/data-deals-card=/g)].length, Object.keys(browser.products).length);
  assert.ok(!html.includes('mem-team-ddr4-32')); assert.ok(!html.includes('B093GNJS1T'));
  for (const [key, p] of Object.entries(browser.products)) {
    const card = html.split(`data-deals-card="${key}"`)[1].split('</article>')[0];
    assert.ok(card.indexOf('commerce-trust') < card.indexOf('data-commerce-slot'));
    assert.ok(card.indexOf(p.recommendationReason) < card.indexOf('data-commerce-slot'));
    assert.ok(card.includes(p.specSummary));
    assert.ok(card.includes(`https://www.amazon.co.jp/dp/${p.asin}?tag=yzrs_apps-22`));
    assert.match(card, /data-commerce-slot="[^"]+" hidden/);
  }
  assert.match(html, /Sn60\/Pb40/); assert.match(html, /鉛入りはんだ/);
  assert.ok(!html.includes('undefined / undefined / undefined'));
  assert.ok(!html.includes('manifest.webmanifest')); assert.ok(!html.includes('serviceWorker'));
  assert.match(html, /noindex, follow/); assert.ok(!html.includes('commerce-price'));
  assert.doesNotMatch(html, /"@type":\s*"(?:Product|Offer|WebApplication)"/);
  assert.ok(!readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8').includes('/deals/'));
});
test('pending cannot be enabled; approved cannot bypass product review; dynamic data rejected', () => {
  for (const mutate of [p => { p.enabled = true; }, p => { p.ownerReview = 'approved'; p.enabled = true; }, p => { p.price = 9000; }]) {
    const fixture = structuredClone(catalog); mutate(fixture.site.affiliate.products['mem-team-ddr4-32']);
    assert.ok(validateCommerceCatalog(fixture).length); assert.throws(() => commerceProjection(fixture));
  }
});
test('repository explicit approval guard rejects ASIN substitution and otherwise complete TEAMGROUP approval', () => {
  const temp = mkdtempSync(join(tmpdir(), 'yzrs-approval-guard-'));
  try {
    cpSync(new URL('../../', import.meta.url), temp, { recursive: true, filter: path => !['.git', '.wrangler', 'node_modules'].includes(basename(path)) });
    const run = () => spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: temp, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const altered = structuredClone(catalog);
    altered.site.affiliate.products['mem-crucial-ddr4-32'].asin = 'B000000099';
    writeFileSync(join(temp, 'site/catalog.json'), JSON.stringify(altered));
    const mismatch = run(); assert.equal(mismatch.status, 1); assert.match(mismatch.stderr, /Owner個別承認と商品構成が一致しない/);
    const unapproved = structuredClone(catalog), p = unapproved.site.affiliate.products['mem-team-ddr4-32'];
    Object.assign(p, { enabled: true, ownerReview: 'approved', ownerReviewedAt: '2026-10-02',
      useCases: ['game'], displayOn: ['mem', 'deals'], recommendationReason: 'MOCK ONLY', specSummary: 'MOCK ONLY',
      evidence: { level: 'specification', description: 'MOCK ONLY', sourceUrl: p.sourceUrl } });
    assert.deepEqual(validateCommerceCatalog(unapproved), []); // Schema completeness cannot grant approval.
    writeFileSync(join(temp, 'site/catalog.json'), JSON.stringify(unapproved));
    const unauthorized = run(); assert.equal(unauthorized.status, 1);
    assert.match(unauthorized.stderr, /固定ASIN候補をpending以外に変更/);
    assert.match(unauthorized.stderr, /想定外のaffiliate productを承認/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('one Product Authority/revision: fabricated approval changes generated revision, not source values', () => {
  const fixture = structuredClone(catalog), before = commerceProjection(fixture).revision;
  fixture.site.affiliate.products.mock = product();
  assert.deepEqual(validateCommerceCatalog(fixture), []);
  assert.notEqual(commerceProjection(fixture).revision, before);
  fixture.site.commerce.enabled = true; fixture.site.commerce.liveApiApproved = false;
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
