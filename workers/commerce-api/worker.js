import { commerceConfig } from './generated-products.js';
import { isCommerceProduct, MAX_AGE_MS, safeAmazonUrl, offerState, validSavings } from '../../shared/commerce-policy.js';
import { createAmazonClient } from './amazon.js';
import { normalizeItem } from './normalize.js';

export const ALLOWED_ORIGIN = 'https://apps.yzrswork.com';
export const snapshotKey = revision => `offers:v1:${revision}`;

function publicOffer(value, product, tag, now, fetchedAt, expiresAt) {
  if (!value || value.asin !== product.asin || value.fetchedAt !== fetchedAt || value.expiresAt !== expiresAt ||
      value.currency !== 'JPY' || value.availability !== 'available' || !(value.price > 0) || !Number.isFinite(value.price) ||
      typeof value.primeExclusive !== 'boolean' || !safeAmazonUrl(value.detailPageURL, product.asin, tag)) return null;
  if (offerState(value, now) !== 'fresh') return null;
  const { deal } = value, savingsValid = validSavings(value);
  return { asin: product.asin, price: value.price, currency: 'JPY', availability: 'available',
    detailPageURL: value.detailPageURL, fetchedAt, expiresAt, primeExclusive: value.primeExclusive,
    deal: deal ? { active: true, startAt: deal.startAt, endAt: deal.endAt } : null,
    savingBasis: savingsValid ? value.savingBasis : null, savingBasisLabel: savingsValid ? value.savingBasisLabel : null,
    savingsJPY: savingsValid ? value.savingsJPY : null, savingsPercent: savingsValid ? value.savingsPercent : null };
}

export function createWorker({ contract = commerceConfig, fetcher = globalThis.fetch, clock = Date.now, sleep, timeoutMS } = {}) {
  const products = Object.fromEntries(Object.entries(contract.products).filter(([, p]) => isCommerceProduct(p) && /^[A-Z0-9]{10}$/.test(p.asin)));
  const { config, revision } = contract;
  const getItems = createAmazonClient({ fetcher, clock, sleep, timeoutMS });
  let running;

  async function update(env) {
    if (config.liveApiApproved !== true || env.LIVE_API_ENABLED !== 'true' || !Object.keys(products).length) return { status: 'disabled' };
    if (!env.COMMERCE_SNAPSHOTS || !env.COMMERCE_AUTH) return { status: 'unavailable' };
    try {
      const batches = await getItems(env, config, products);
      const items = {};
      for (const { batch, fetchedAt, body } of batches) {
        const incoming = body.itemsResult?.items || body.itemResults?.items || [];
        for (const [key, product] of batch) {
          const matches = incoming.filter(item => item.asin === product.asin);
          const error = body.errors?.find(error => error.resourceId === product.asin || error.itemId === product.asin);
          items[key] = normalizeItem(error || matches.length !== 1 ? null : matches[0], product, config, fetchedAt, clock());
        }
      }
      if (!Object.keys(items).length) return { status: 'unavailable' };
      const fetchedAt = Math.min(...Object.values(items).map(item => item.fetchedAt));
      const expiresAt = Math.max(...Object.values(items).map(item => item.expiresAt));
      const snapshot = { schemaVersion: 1, catalogRevision: revision, fetchedAt, expiresAt, items };
      // KV expiration is absolute. Failed runs never write a new freshness window.
      if (expiresAt > clock() + 60_000) {
        await env.COMMERCE_SNAPSHOTS.put(snapshotKey(revision), JSON.stringify(snapshot), { expiration: Math.floor(expiresAt / 1000) });
      } else await env.COMMERCE_SNAPSHOTS.delete(snapshotKey(revision));
      return { status: 'updated', itemCount: Object.keys(items).length };
    } catch (error) {
      if (error?.code === 'associate-forbidden') {
        try { await env.COMMERCE_SNAPSHOTS.delete(snapshotKey(revision)); } catch { /* readers still enforce expiry */ }
      }
      // No upstream body, token, ASIN error message or secrets reach responses/logs.
      return { status: 'unavailable' };
    }
  }

  return {
    async scheduled(_event, env) {
      if (!running) running = update(env).finally(() => { running = null; });
      return running;
    },
    async fetch(request, env) {
      const url = new URL(request.url), origin = request.headers.get('Origin');
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', Vary: 'Origin' };
      if (origin === ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
      const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
      if (url.pathname === '/health' && request.method === 'GET') return response({ status: 'ok' });
      if (url.pathname !== '/v1/offers') return response({ status: 'not-found' }, 404);
      if (origin !== ALLOWED_ORIGIN) return response({ status: 'forbidden' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Accept' } });
      if (request.method !== 'GET') return response({ status: 'method-not-allowed' }, 405);
      if (url.search) return response({ status: 'invalid-query' }, 400);
      const base = { schemaVersion: 1, catalogRevision: revision, serverNow: clock(), items: {} };
      if (config.enabled !== true || config.amazonSupportApproved !== true || env.COMMERCE_PUBLIC_ENABLED !== 'true') return response({ ...base, status: 'disabled' });
      try {
        const snapshot = await env.COMMERCE_SNAPSHOTS.get(snapshotKey(revision), 'json');
        const now = clock(); base.serverNow = now;
        if (snapshot?.schemaVersion !== 1 || snapshot.catalogRevision !== revision ||
            !Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt > now || !Number.isFinite(snapshot.expiresAt) ||
            snapshot.expiresAt <= now || snapshot.expiresAt > snapshot.fetchedAt + MAX_AGE_MS + 60_000 ||
            !snapshot.items || typeof snapshot.items !== 'object') return response({ ...base, status: 'unavailable' }, 503);
        for (const [key, product] of Object.entries(products)) {
          const item = snapshot.items[key];
          if (!item || !Number.isFinite(item.fetchedAt) || item.fetchedAt > now || !Number.isFinite(item.expiresAt) ||
              item.expiresAt > item.fetchedAt + MAX_AGE_MS) continue;
          const lifecycle = item.offer ? offerState(item.offer, now) : null;
          const offer = item.status === 'fresh' && item.expiresAt > now ? publicOffer(item.offer, product, config.associateTag, now, item.fetchedAt, item.expiresAt) : null;
          const status = offer ? 'fresh' : lifecycle === 'expired' ? 'expired' : item.expiresAt <= now ? 'stale' :
            ['expired', 'stale', 'not-accessible'].includes(item.status) ? item.status : 'no-offer';
          base.items[key] = { status, fetchedAt: item.fetchedAt, expiresAt: item.expiresAt, remainingMS: offer ? item.expiresAt - now : 0, offer };
        }
        return response({ ...base, status: 'ok' });
      } catch { return response({ ...base, status: 'unavailable' }, 503); }
    },
  };
}

export default createWorker();
