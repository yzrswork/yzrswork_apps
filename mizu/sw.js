// このSWはキャッシュを削除しない。
// 理由: 移転先 yzrswork_ai-skill-recipe/mizu が同一オリジン(yzrswork.github.io)で同名キャッシュを現役利用中
// 対象prefix: yapps-mizu-
// 同一オリジンでCacheStorageを共有するため、削除すると移転先の現役PWAを壊す。
// (site/catalog.json の site.sharedOrigin と cacheClearBlockedBy を参照)
const CACHE_CLEAR_DISABLED = true;
const RETIRED_URL = new URL('./index.html?retired=1', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows
        .filter((client) => client.url.startsWith(self.registration.scope))
        .map((client) => client.navigate(RETIRED_URL))
    );
  })());
});
