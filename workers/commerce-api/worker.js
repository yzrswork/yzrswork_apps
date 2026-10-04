import { commerceConfig } from './generated-products.js';
import { createSnapshotOperations } from './snapshot.js';
export { snapshotKey } from './snapshot.js';
export const ALLOWED_ORIGIN = 'https://apps.yzrswork.com';

export function createWorker(options = {}) {
  const { contract = commerceConfig, clock = Date.now } = options;
  const operations = createSnapshotOperations(options);
  let running;
  return {
    async scheduled(_event, env) {
      if (contract.config.liveApiApproved !== true || env.LIVE_API_ENABLED !== 'true' || !Object.keys(contract.products).length) return { status: 'disabled' };
      if (!running) running = operations.update(env).finally(() => { running = null; });
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
      if (contract.config.enabled !== true || contract.config.amazonSupportApproved !== true || env.COMMERCE_PUBLIC_ENABLED !== 'true') {
        return response({ schemaVersion: 1, catalogRevision: contract.revision, serverNow: clock(), items: {}, status: 'disabled' });
      }
      return operations.read(env, response);
    },
  };
}
export default createWorker();
