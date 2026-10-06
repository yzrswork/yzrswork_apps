import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { product } from './fixtures.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = path => readFileSync(join(root, path), 'utf8');
const catalog = JSON.parse(read('site/catalog.json'));

test('mem base remains functional when optional Commerce JS fails; matching preserves owner/DDR/capacity gate', () => {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', hidden: true, querySelector: () => null, querySelectorAll: () => [] });
    return elements.get(id);
  }, querySelectorAll: () => [] };
  const sandbox = { window: { dispatchEvent() {}, addEventListener() {} }, document, navigator: {}, CustomEvent: class {} };
  runInNewContext(read('affiliate.js'), sandbox);
  const api = sandbox.window.yzrsAffiliate;
  sandbox.window.yzrsAffiliate = api;
  const mainScript = [...read('mem/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('function renderPicks'))[1];
  runInNewContext(mainScript, sandbox);
  runInNewContext("selSocket = 'am4'; selUse = 'game'; candidateAccepted = true; renderReco(); renderPicks();", sandbox);
  assert.match(elements.get('reco').innerHTML, /この条件で探す/);
  assert.match(elements.get('reco').innerHTML, /DDR4/);
  assert.equal(elements.get('picks-section').hidden, false);
  assert.match(elements.get('picks').innerHTML, /mem-crucial-ddr4-32/);
  assert.ok(!elements.get('picks').innerHTML.includes('mem-crucial-ddr5-32'));
  for (const [socket, expected, excluded] of [['am4', 'mem-crucial-ddr4-32', 'mem-crucial-ddr5-32'], ['am5', 'mem-crucial-ddr5-32', 'mem-crucial-ddr4-32']]) {
    for (const use of ['game', 'creative', 'ai']) {
      runInNewContext(`selSocket = '${socket}'; selUse = '${use}'; candidateAccepted = true; renderReco(); renderPicks();`, sandbox);
      assert.equal(elements.get('picks-section').hidden, false);
      assert.ok(elements.get('picks').innerHTML.includes(expected));
      assert.ok(!elements.get('picks').innerHTML.includes(excluded));
      assert.ok(!elements.get('picks').innerHTML.includes('mem-team-ddr4-32'));
    }
    runInNewContext("selUse = 'web'; renderPicks();", sandbox); assert.equal(elements.get('picks-section').hidden, true);
    runInNewContext("selUse = 'game'; candidateAccepted = false; renderPicks();", sandbox); assert.equal(elements.get('picks-section').hidden, true);
  }
  runInNewContext("selSocket = 'lga1700'; selDdrChoice = null; candidateAccepted = true; renderPicks();", sandbox);
  assert.equal(elements.get('picks-section').hidden, true);
  runInNewContext("selSocket = 'am4'; selUse = 'game'; candidateAccepted = true;", sandbox);
  sandbox.window.yzrsAffiliate = undefined;
  assert.doesNotThrow(() => runInNewContext('renderReco(); renderPicks();', sandbox));
  assert.match(elements.get('reco').innerHTML, /あなたの構成の目安/);
  // Exercise the actual generated affiliate helper with fabricated product data only.
  const fixtureSource = read('affiliate.js').replace(/const PRODUCTS = Object\.freeze\([^\n]*\);/, `const PRODUCTS = Object.freeze(${JSON.stringify({ mock: product() })});`);
  const fixture = {}; runInNewContext(fixtureSource, fixture);
  sandbox.window.yzrsAffiliate = fixture.yzrsAffiliate;
  runInNewContext('renderPicks();', sandbox); assert.equal(elements.get('picks-section').hidden, false);
  assert.match(elements.get('picks').innerHTML, /MOCK ONLY 推薦理由/);
  runInNewContext("selUse = 'web'; renderPicks();", sandbox); assert.equal(elements.get('picks-section').hidden, true);
  runInNewContext("selUse = 'game'; candidateAccepted = false; renderPicks();", sandbox); assert.equal(elements.get('picks-section').hidden, true);
  runInNewContext("selSocket = 'unknown'; candidateAccepted = true; renderReco(); renderPicks();", sandbox);
  assert.equal(elements.get('picks-section').hidden, true); assert.ok(!elements.get('reco').innerHTML.includes('この条件で探す'));
});
test('Service Worker offline: caches static assets only; Commerce endpoint never intercepted or cached', async () => {
  const listeners = {}, stores = new Map([['mem-v12', new Map()], ['hdd-v10', new Map()]]);
  const origin = 'https://apps.yzrswork.com', base = `${origin}/mem/sw.js`;
  const caches = { async open(name) {
    if (!stores.has(name)) stores.set(name, new Map()); const store = stores.get(name);
    return { async addAll(paths) { for (const path of paths) { const url = new URL(path, base); const local = decodeURIComponent(url.pathname).slice(1); store.set(url.href, new Response(read(local.endsWith('/') ? `${local}index.html` : local))); } },
      async put(request, response) { store.set(request.url, response); } };
  }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); },
  async match(request) { const url = typeof request === 'string' ? new URL(request, base).href : request.url; for (const store of stores.values()) if (store.has(url)) return store.get(url).clone(); } };
  let network = 0;
  const self = { location: { href: base, origin }, addEventListener(name, handler) { listeners[name] = handler; }, skipWaiting() {}, clients: { claim() {} } };
  runInNewContext(read('mem/sw.js'), { self, caches, URL, fetch() { network++; throw new Error('offline'); } });
  let pending; listeners.install({ waitUntil(promise) { pending = promise; } }); await pending;
  listeners.activate({ waitUntil(promise) { pending = promise; } }); await pending;
  assert.ok(!stores.has('mem-v12')); assert.ok(stores.has('hdd-v10'));
  for (const path of ['/mem/', '/shared/commerce.js', '/shared/commerce-config.js', '/affiliate.js']) {
    let reply; listeners.fetch({ request: new Request(`${origin}${path}`), respondWith(promise) { reply = promise; } });
    assert.ok((await reply).ok);
  }
  for (const url of [`${origin}/v1/offers`, 'https://mock.invalid/v1/offers', `${origin}/kit/`]) {
    let intercepted = false; listeners.fetch({ request: new Request(url), respondWith() { intercepted = true; } }); assert.equal(intercepted, false);
  }
  assert.equal(network, 0); assert.ok([...stores.values()].every(store => [...store.keys()].every(key => !key.includes('/v1/offers'))));
});
test('invalid Product Master stops build before overwriting generated artifacts', () => {
  const temp = mkdtempSync(join(tmpdir(), 'yzrs-commerce-build-'));
  try {
    for (const dir of ['scripts', 'shared', 'site']) mkdirSync(join(temp, dir));
    for (const file of ['scripts/build.mjs', 'scripts/commerce-catalog.mjs', 'shared/commerce-policy.js']) copyFileSync(join(root, file), join(temp, file));
    writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
    const bad = structuredClone(catalog); bad.site.affiliate.products['mem-team-ddr4-32'].enabled = true;
    writeFileSync(join(temp, 'site/catalog.json'), JSON.stringify(bad));
    writeFileSync(join(temp, 'affiliate.js'), 'existing-generated-artifact');
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /individual Owner approval/);
    assert.equal(readFileSync(join(temp, 'affiliate.js'), 'utf8'), 'existing-generated-artifact');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
