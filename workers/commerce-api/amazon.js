import { CommerceError, jsonRequest, retryAfter } from './http.js';
import { createTokenCache } from './oauth-cache.js';

export const ITEMS_URL = 'https://creatorsapi.amazon/catalog/v1/getItems';
export const RESOURCES = Object.freeze(['availability', 'condition', 'dealDetails', 'isBuyBoxWinner', 'price', 'type']
  .map(field => `offersV2.listings.${field}`));

export function createAmazonClient({ fetcher, clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMS }) {
  const getToken = createTokenCache({ fetcher, clock, timeoutMS });
  return async function getItems(env, config, products) {
    const entries = Object.entries(products);
    if (!entries.length) return [];
    const deadline = clock() + 60_000;
    let token = await getToken(env), refreshed = false, lastRequest = -Infinity;
    const batches = [];
    for (let offset = 0; offset < entries.length; offset += 10) {
      const batch = entries.slice(offset, offset + 10);
      const completed = batches.length;
      for (let attempt = 0; attempt < 3; attempt++) {
        const gap = Math.max(0, lastRequest + 1000 - clock());
        if (clock() + gap + (timeoutMS || 12_000) >= deadline) throw new CommerceError('run-budget');
        if (gap) await sleep(gap);
        if (token.expiresAt <= clock()) token = await getToken(env);
        const fetchedAt = clock(); lastRequest = fetchedAt;
        const { response, body } = await jsonRequest(fetcher, ITEMS_URL, {
          method: 'POST', headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json', 'x-marketplace': config.marketplace },
          body: JSON.stringify({ itemIds: batch.map(([, p]) => p.asin), itemIdType: 'ASIN', condition: 'New',
            marketplace: config.marketplace, partnerTag: config.associateTag, resources: RESOURCES }),
        }, timeoutMS);
        if (clock() >= deadline) throw new CommerceError('run-budget');
        const code = body?.code || body?.type || body?.__type;
        if ((response.status === 401 || response.status === 400) && code === 'TokenExpired' && !refreshed) {
          refreshed = true;
          token = await getToken(env, token.generation);
          continue;
        }
        if (response.status === 403) throw new CommerceError('associate-forbidden');
        if (response.status === 404 && code === 'ResourceNotFoundException') {
          batches.push({ batch, fetchedAt, body: { itemsResult: { items: [] } } }); break;
        }
        if (response.status === 429 || response.status >= 500) {
          if (attempt === 2) throw new CommerceError(response.status === 429 ? 'items-throttled' : 'amazon-unavailable');
          const wait = Math.max(1000 * 2 ** attempt + Math.floor(Math.random() * 250),
            (retryAfter(response.headers.get('Retry-After'), clock()) || clock()) - clock());
          if (clock() + wait + (timeoutMS || 12_000) >= deadline) throw new CommerceError('retry-deferred');
          await sleep(wait); continue;
        }
        if (!response.ok) throw new CommerceError('items-failed');
        if (!Array.isArray(body?.itemsResult?.items) && !Array.isArray(body?.itemResults?.items)) throw new CommerceError('invalid-items-response');
        batches.push({ batch, fetchedAt, body }); break;
      }
      if (batches.length === completed) throw new CommerceError('items-failed');
    }
    return batches;
  };
}
