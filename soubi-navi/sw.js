// soubi-navi は kit/ の重複コピーだったため廃止し、../kit/ へのリダイレクトに置き換えた。
// 既にこのSWをインストール済みのブラウザでは、cache-firstの旧SWが新しいリダイレクトHTMLより
// 先にレスポンスを返してしまうため、このファイル自体を書き換えて自己解除する。
const OLD_CACHE_PREFIX = 'soubi-navi-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(OLD_CACHE_PREFIX)).map((k) => caches.delete(k))
      ))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});

self.addEventListener('fetch', () => {
  // 素通し。unregister後は次のナビゲーションからこのSW自体が外れる。
});
