const CACHE_NAME = 'soubi-navi-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/icon-512-maskable.png'
];

const SOUBI_ASSET_URLS = new Set(
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
        keys.filter((k) => k.startsWith('soubi-navi-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (!SOUBI_ASSET_URLS.has(url.href)) {
    return;
  }

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
