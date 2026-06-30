const CACHE_NAME = 'bench-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/icon-512-maskable.png'
];

// ASSETSを絶対URLに正規化したSet（fetch判定で使用）
const BENCH_ASSET_URLS = new Set(
  ASSETS.map(path => new URL(path, self.location.href).href)
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // クロスオリジン（Google Fonts CDN等）は素通り
  if (url.origin !== self.location.origin) {
    return;
  }

  // GET以外（POST/PUT/DELETE等）は素通り
  if (request.method !== 'GET') {
    return;
  }

  // benchアプリの既知アセット以外は素通り
  // → index.html, memo.html 等の他ページに影響しない
  if (!BENCH_ASSET_URLS.has(url.href)) {
    return;
  }

  // ここから先はbenchアプリのアセットのみ
  // Cache First + ネットワークフォールバック
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // 成功レスポンスのみキャッシュに追加
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // ネットワーク失敗時：documentリクエストならindex.htmlを返す
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          // それ以外はそのままエラーを返す
        });
    })
  );
});

// === キャッシュ更新ルール ===
// manifest.webmanifest や index.html を更新したら CACHE_NAME を bump すること
// 例: 'bench-v1' → 'bench-v2'
//
// === キャッシュ範囲 ===
// このSWはASSETS配列に列挙されたbenchアプリの既知アセットのみキャッシュする。
// 同一オリジンの他ページ（ルートindex.html、memo.html等）には介入しない。
// ASSETSに新規ファイルを追加した場合はCACHE_NAMEのbumpも必須。
