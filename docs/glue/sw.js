// yzrswork.github.io(旧ホスト)専用の退役SW。yzrswork.github.io は
// yzrswork_ai-skill-recipe 等の別リポジトリとオリジンを共有しているため、
// 削除対象は自分自身が生成したキャッシュ名(glue-v数字)への厳密一致に限定する。
const CACHE_PREFIX = 'glue-';
const CACHE_RE = /^glue-v\d+$/;
const RETIRED_URL = new URL('./index.html?retired=1', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && CACHE_RE.test(key))
        .map((key) => caches.delete(key))
    );
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows
        .filter((client) => client.url.startsWith(self.registration.scope))
        .map((client) => client.navigate(RETIRED_URL + new URL(client.url).hash).catch(() => {}))
    );
  })());
});
