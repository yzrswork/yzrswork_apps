const CACHE_NAME = 'hdd-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/icon-512-maskable.png'
];

// ASSETSを絶対URLに正規化したSet（fetch判定で使用）
const HDD_ASSET_URLS = new Set(
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

  // クロスオリジン（Google Fonts等）は素通り
  if (url.origin !== self.location.origin) {
    return;
  }

  // GET以外は素通り
  if (request.method !== 'GET') {
    return;
  }

  // hddアプリの既知アセット以外は素通り（他ページに介入しない）
  if (!HDD_ASSET_URLS.has(url.href)) {
    return;
  }

  // Cache First + ネットワークフォールバック
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// === キャッシュ更新ルール ===
// index.html や manifest.webmanifest を更新したら CACHE_NAME を bump すること
// 例: 'hdd-v1' → 'hdd-v2'
//
// === キャッシュ範囲 ===
// このSWは /hdd/ スコープで、ASSETS配列に列挙された既知アセットのみキャッシュする。
// 他ページ（memo.html, bench/, fixit/, kit/, lab/ 等）には介入しない。
