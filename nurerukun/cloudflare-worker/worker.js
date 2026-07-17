// Cloudflare Worker: 塗れるくん(nurerukun)用 met.no Locationforecast プロキシ
//
// なぜ必要か:
//   met.no(MET Norway)は商用利用OK(CC BY 4.0)だが、規約で次を要求している。
//   (1) 連絡先を含む識別可能な User-Agent を送ること
//   (2) ブラウザからの直アクセスは本番非推奨(CORSも通らない)
//   (3) ある程度のトラフィックには caching proxy を必ず置くこと
//   ブラウザの fetch では User-Agent を付けられないため、この Worker を1枚挟んで
//   「正しい UA + エッジキャッシュ + CORS」を満たし、規約に完全準拠させる。
//
// デプロイ手順(無料・カード不要):
//   1. https://dash.cloudflare.com にログイン(無料アカウント)
//   2. Workers & Pages -> Create -> Worker -> 適当な名前(例: nurerukun-weather)
//   3. 「Edit code」でこのファイルの中身を全部貼り付けて Deploy
//   4. 発行された URL (例: https://nurerukun-weather.<自分のサブドメイン>.workers.dev) を控える
//   5. その URL を nurerukun/index.html 冒頭の WEATHER_PROXY に設定する
//
// 動作確認:
//   https://<your-worker>.workers.dev/forecast?lat=35.18&lon=136.9
//   -> met.no の JSON が返り、レスポンスに Access-Control-Allow-Origin が付いていればOK

const CONTACT = 'https://note.com/yzrswork';                           // 連絡先(公開URL。met.no識別要件用。メアドにしてもよい)
const APP_URL = 'https://apps.yzrswork.com/nurerukun/'; // アプリのURL
const UA = `nurerukun/1.0 (${APP_URL}; ${CONTACT})`;     // met.no要件の識別UA
const ALLOW_ORIGINS = [
  'https://apps.yzrswork.com',   // 公開サイトのオリジン(Cloudflare Pages)
  'https://yzrswork.github.io',  // 旧公開サイトのオリジン(並行稼働終了後に削除)
  'http://localhost:8080',       // ローカル確認用(不要なら消す)
];
const CACHE_TTL = 900; // 秒。met.noは概ね30分更新なので15分キャッシュで十分(=met.no要件のproxyキャッシュ)

export default {
  async fetch(request, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);

    const u = new URL(request.url);
    if (u.pathname !== '/forecast') return json({ error: 'not found' }, 404, cors);

    const lat = clampCoord(u.searchParams.get('lat'), 90);
    const lon = clampCoord(u.searchParams.get('lon'), 180);
    if (lat === null || lon === null) return json({ error: 'lat/lon required (numeric)' }, 400, cors);

    // met.no(座標は4桁に丸める = met.no推奨かつキャッシュ効率が上がる)。met.no以外へは絶対に通さない
    const upstream = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;

    // エッジキャッシュ(met.no要件の caching proxy を満たす)
    const cache = caches.default;
    const cacheKey = new Request(upstream, { method: 'GET' });
    let resp = await cache.match(cacheKey);
    if (!resp) {
      const upstreamResp = await fetch(upstream, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      });
      if (!upstreamResp.ok) return json({ error: 'upstream error', status: upstreamResp.status }, 502, cors);
      const body = await upstreamResp.text();
      resp = new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    }

    const out = new Response(resp.body, resp); // CORSを付けて返す
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}
function clampCoord(v, max) {
  const n = parseFloat(v);
  if (!isFinite(n) || Math.abs(n) > max) return null;
  return n.toFixed(4);
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
