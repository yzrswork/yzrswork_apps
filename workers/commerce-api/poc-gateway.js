// Local-only gateway. Never deploy. Remote service binding is authenticated by
// Wrangler; Amazon secrets stay on the dedicated, unrouted development Worker.
export default { async fetch(request, env) {
  const url = new URL(request.url);
  const denied = () => new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (url.hostname !== '127.0.0.1' || !url.port || url.search ||
      request.headers.has('Origin') || request.headers.has('Sec-Fetch-Site')) return denied();
  if (url.pathname === '/poc/invoke') {
    if (request.method !== 'POST' || !env.POC_MANUAL_KEY ||
        request.headers.get('X-PoC-Manual-Key') !== env.POC_MANUAL_KEY || (await request.text()) !== '') return denied();
  } else if (!['/health', '/poc/offers'].includes(url.pathname) || request.method !== 'GET') return denied();
  return env.POC.fetch(new Request(`https://poc.internal${url.pathname}`, { method: request.method }));
} };
