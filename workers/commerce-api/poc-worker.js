import { commerceConfig } from './generated-products.js';
import { isPoCContract } from '../../shared/commerce-poc-policy.js';
import { createSnapshotOperations } from './snapshot.js';
import { ITEMS_URL, RESOURCES } from './amazon.js';
import { TOKEN_URL } from './oauth-cache.js';
import { CommerceError } from './http.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fieldType = v => v === null ? 'null' : v === undefined ? 'missing' : Array.isArray(v) ? 'array' : typeof v;

// Only service-bound access. Config must have no route/workers.dev/Preview URL.
// No scheduled handler: even accidental scheduled delivery cannot call Amazon.
export function createPoCWorker({ contract = commerceConfig, fetcher = globalThis.fetch, clock = Date.now, sleep, timeoutMS } = {}) {
  let running = false, stopped = false;
  function gated(env) {
    return isPoCContract(contract) && env.POC_MODE === 'controlled-live-20261004' &&
      env.COMMERCE_PUBLIC_ENABLED === 'false' && env.CREDENTIAL_VERSION === '3.3' &&
      /^poc-20261004-[a-z0-9-]+$/.test(env.TOKEN_ROTATION_EPOCH || '') &&
      env.COMMERCE_AUTH && env.COMMERCE_SNAPSHOTS;
  }
  return { async fetch(request, env) {
    const url = new URL(request.url);
    if (!gated(env)) return reply({ status: 'disabled' }, 403);
    if (request.headers.has('Origin') || request.headers.has('Sec-Fetch-Site')) return reply({ status: 'forbidden' }, 403);
    if (url.search) return reply({ status: 'invalid-query' }, 400);
    if (url.pathname === '/health' && request.method === 'GET') return reply({ status: 'ok',
      liveEnabled: env.LIVE_API_ENABLED === 'true', displayEnabled: env.POC_DISPLAY_ENABLED === 'true',
      credentialsPresent: Boolean(env.AMAZON_CLIENT_ID && env.AMAZON_CLIENT_SECRET), stopped });
    const operations = createSnapshotOperations({ contract, clock });
    if (url.pathname === '/poc/offers' && request.method === 'GET') {
      if (env.POC_DISPLAY_ENABLED !== 'true') return reply({ status: 'disabled', items: {} });
      return operations.read(env, reply);
    }
    if (url.pathname !== '/poc/invoke') return reply({ status: 'not-found' }, 404);
    if (request.method !== 'POST') return reply({ status: 'method-not-allowed' }, 405);
    if ((await request.text()) !== '') return reply({ status: 'invalid-body' }, 400);
    if (stopped || env.LIVE_API_ENABLED !== 'true' || env.POC_PREREQUISITES_CONFIRMED !== 'true') return reply({ status: 'disabled' }, 403);
    if (running) return reply({ status: 'busy' }, 409);
    running = true;
    const observation = { tokenCalls: 0, itemCalls: 0, token: null, responses: [], shapes: [] };
    let failure = null;
    const countedFetch = async (endpoint, init) => {
      const token = endpoint === TOKEN_URL;
      if (!token && endpoint !== ITEMS_URL) throw new CommerceError('unexpected-host');
      const count = token ? 'tokenCalls' : 'itemCalls';
      if (observation[count] >= 1) throw new CommerceError('unexpected-call-count');
      if (!token) {
        const body = JSON.parse(init.body);
        const expected = Object.values(contract.products).map(p => p.asin);
        if (JSON.stringify(body.itemIds) !== JSON.stringify(expected) || body.marketplace !== 'www.amazon.co.jp' ||
            body.partnerTag !== 'yzrs_apps-22' || JSON.stringify(body.resources) !== JSON.stringify(RESOURCES)) throw new CommerceError('request-contract');
      }
      observation[count]++;
      const response = await fetcher(endpoint, init);
      observation.responses.push({ endpoint: token ? 'token' : 'GetItems', status: response.status });
      if (!token && response.ok) {
        const body = await response.clone().json();
        const incoming = body.itemsResult?.items || body.itemResults?.items;
        const asins = new Set(Object.values(contract.products).map(p => p.asin));
        if (!Array.isArray(incoming) || incoming.some(i => !i || !asins.has(i.asin)) ||
            new Set(incoming.map(i => i.asin)).size !== incoming.length ||
            (body.errors != null && (!Array.isArray(body.errors) || body.errors.some(e => e?.code !== 'ItemNotAccessible')))) {
          throw new CommerceError('unrecognized-response');
        }
        observation.shapes = Object.entries(contract.products).map(([key, p]) => {
          const item = incoming.find(i => i.asin === p.asin), listings = item?.offersV2?.listings;
          return { key, itemPresent: Boolean(item), offersV2: fieldType(item?.offersV2), listings: fieldType(listings),
            fields: Array.isArray(listings) ? listings.map(l => ({ price: fieldType(l?.price), money: fieldType(l?.price?.money),
              availability: fieldType(l?.availability), dealDetails: fieldType(l?.dealDetails),
              savings: fieldType(l?.price?.savings), savingBasis: fieldType(l?.price?.savingBasis),
              violatesMAP: fieldType(l?.violatesMAP) })) : [] };
        });
      }
      return response;
    };
    try {
      const update = createSnapshotOperations({ contract, clock, sleep, timeoutMS, maxAttempts: 1, fetcher: countedFetch,
        observeToken: metadata => { observation.token = metadata; },
        onError: error => { failure = error instanceof CommerceError ? error.code : 'internal-failure'; } });
      const result = await update.update(env);
      if (result.status !== 'updated' || observation.itemCalls !== 1) stopped = true;
      return reply({ ...result, failure, ...observation, stopped });
    } finally { running = false; }
  } };
}
export default createPoCWorker();
