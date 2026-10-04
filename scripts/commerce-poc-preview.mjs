import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPoCContract } from '../shared/commerce-poc-policy.js';
import { commerceConfig } from '../shared/commerce-config.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(readFileSync(resolve(root, 'site/catalog.json'), 'utf8'));
const publicDirectories = new Set([...catalog.apps, ...catalog.pages].map(p => p.slug));
const port = 8790, origin = `http://127.0.0.1:${port}`;
const display = process.argv.includes('--display');
if (!isPoCContract(commerceConfig)) throw new Error('PoC catalog authorization mismatch');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const allowed = path => (publicDirectories.has(path.split('/')[1]) && /^\/[a-z0-9-]+\/(?:index\.html|sw\.js|manifest\.webmanifest)?$/.test(path)) ||
  path === '/' || path === '/affiliate.js' || /^\/shared\/(?:tokens\.css|commerce(?:-policy|-config|-poc-policy)?\.js|commerce\.css)$/.test(path) ||
  /^\/icons\/[a-zA-Z0-9_.-]+\.(?:png|svg)$/.test(path);

export function createPreviewServer({ gatewayFetch = globalThis.fetch } = {}) {
  return createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); res.end(body);
    };
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) ||
        req.headers['sec-fetch-site'] === 'cross-site') return send(403, '{}');
    const url = new URL(req.url, origin);
    if (url.search || req.method !== 'GET') return send(400, '{}');
    if (url.pathname === '/__poc/offers') {
      if (!display) return send(403, '{"status":"disabled","items":{}}');
      try {
        const response = await gatewayFetch('http://127.0.0.1:8787/poc/offers', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
        return send(response.status, await response.text());
      } catch { return send(503, '{"status":"unavailable","items":{}}'); }
    }
    if (url.pathname === '/__poc/client.js') return send(200, `
import { createCommerceController } from '/shared/commerce.js';
import { commerceConfig } from '/shared/commerce-config.js';
import { isPoCContract } from '/shared/commerce-poc-policy.js';
if (${display} && location.origin === ${JSON.stringify(origin)} && isPoCContract(commerceConfig)) {
  createCommerceController({ document, window, navigator, contract: commerceConfig,
    developmentRead: { origin: location.origin, fetch: init => fetch('/__poc/offers', init) } });
}
`, types['.js']);
    if (!allowed(url.pathname)) return send(404, '{}');
    const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const absolute = resolve(root, `.${path}`);
    if (!absolute.startsWith(root + sep)) return send(403, '{}');
    try {
      let body = await readFile(absolute);
      if (extname(path) === '.html') {
        let html = body.toString('utf8').replace(/<script\b[^>]*\bsrc="(?:https:[^"]+|[^"\n]*analytics\.js)"[^>]*>[\s\S]*?<\/script>/g, '');
        if (['/deals/index.html', '/mem/index.html'].includes(path)) {
          html = html.replace('src="../shared/commerce.js"', 'src="/__poc/client.js"');
          html = html.replace('<h2>公開準備中</h2>', '<h2>開発検証（localhost）</h2>');
          html = html.replace('現在は価格・セール情報の表示を停止しています。以下は仕様から選定した承認済み候補です。セール対象であることを示す一覧ではありません。',
            display ? 'アクセスを制限した開発環境で、取得できた安全な情報のみ表示します。仕様・推薦理由を先に確認してください。' : '価格表示を停止した開発環境です。以下は仕様から選定した承認済み候補です。');
        }
        body = html;
      }
      send(200, body, types[extname(path)] || 'application/octet-stream');
    } catch { send(404, '{}'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`PoC Preview: ${origin}; display=${display}; no manual invocation route`));
}
