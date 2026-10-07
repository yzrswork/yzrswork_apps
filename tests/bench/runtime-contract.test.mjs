import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function analyticsEventsFor(pathname) {
  const source = readFileSync(join(ROOT, 'analytics.js'), 'utf8');
  const listeners = new Map();
  const dataLayer = [];
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    body: {},
    createElement() { return {}; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const window = { dataLayer };
  const context = vm.createContext({
    Array,
    Date,
    MutationObserver: function MutationObserver() {},
    Number,
    Object,
    RegExp,
    Set,
    String,
    URL,
    console,
    dataLayer,
    document,
    location: { pathname },
    window,
  });

  vm.runInContext(source, context, { filename: 'analytics.js' });

  const target = {
    closest(selector) {
      if (selector.includes('button')) return { tagName: 'INPUT' };
      return null;
    },
  };
  for (const listener of listeners.get('click') || []) listener({ target });
  window.yzrsTrackResult('ohm', 'electronics');

  return dataLayer
    .map((entry) => Array.from(entry))
    .filter(([kind, name]) => kind === 'event' && ['tool_start', 'result_view', 'tool_complete'].includes(name));
}

test('Bench EN analytics keeps app_name=bench and language=en on extensionless production route', () => {
  for (const pathname of ['/bench/en', '/bench/en.html']) {
    const events = analyticsEventsFor(pathname);
    assert.equal(events.length, 3);
    for (const [, , params] of events) {
      assert.equal(params.app_name, 'bench');
      assert.equal(params.language, 'en');
      assert.equal(Object.hasOwn(params, 'input_value'), false);
      assert.equal(Object.hasOwn(params, 'result_text'), false);
    }
  }
});

test('Bench service worker maps extensionless and query EN documents to cached en.html only', async () => {
  const source = readFileSync(join(ROOT, 'bench', 'sw.js'), 'utf8');
  const listeners = {};
  const matchedKeys = [];
  const cached = { source: 'cached-en-document' };
  const expectedCacheUrl = 'https://apps.yzrswork.com/bench/en.html';

  const caches = {
    match(key) {
      const normalized = typeof key === 'string' ? key : key.url;
      matchedKeys.push(normalized);
      return Promise.resolve(normalized === expectedCacheUrl ? cached : null);
    },
    open() {
      throw new Error('network/cache write should not be reached when EN document is precached');
    },
    keys() { return Promise.resolve([]); },
  };
  const self = {
    location: {
      href: 'https://apps.yzrswork.com/bench/sw.js',
      origin: 'https://apps.yzrswork.com',
    },
    clients: { claim() {} },
    skipWaiting() {},
    addEventListener(type, listener) { listeners[type] = listener; },
  };

  vm.runInNewContext(source, {
    URL,
    caches,
    console,
    fetch() { throw new Error('network should not be used for a precached EN document'); },
    self,
  }, { filename: 'bench/sw.js' });

  async function fetchThroughSw(url) {
    let responsePromise = null;
    listeners.fetch({
      request: { url, method: 'GET', destination: 'document' },
      respondWith(promise) { responsePromise = promise; },
    });
    return responsePromise ? await responsePromise : null;
  }

  for (const url of [
    'https://apps.yzrswork.com/bench/en',
    'https://apps.yzrswork.com/bench/en?yzrs_ref=makers-bench-en',
    'https://apps.yzrswork.com/bench/en.html?yzrs_ref=makers-bench-en',
  ]) {
    assert.equal(await fetchThroughSw(url), cached);
    assert.equal(matchedKeys.at(-1), expectedCacheUrl);
  }

  assert.equal(await fetchThroughSw('https://apps.yzrswork.com/bench/not-a-known-asset?x=1'), null);
  assert.equal(await fetchThroughSw('https://apps.yzrswork.com/hdd/'), null);
});
