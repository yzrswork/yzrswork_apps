const CACHE_PREFIXES = ["yapps-prompt-forge-"];
const RETIRED_URL = new URL('./index.html?retired=1', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => caches.delete(key))
    );

    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows
        .filter((client) => client.url.startsWith(self.registration.scope))
        .map((client) => client.navigate(RETIRED_URL))
    );
  })());
});
