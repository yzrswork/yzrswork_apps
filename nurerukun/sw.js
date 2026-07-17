/* 塗れるくん Service Worker -- 最小構成 (アプリ殻のみキャッシュ) */
const CACHE = 'nurerukun-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* アプリ殻はキャッシュ優先、天気/住所APIは常にネットワーク */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API はそのまま通す
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
