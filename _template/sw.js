/* TODO: CACHE名をアプリ名に変更
   推奨: 新規アプリは手書きせず、app.json を作って scripts/build.mjs でこのファイルを
   自動生成する運用に乗せる（kit/ 等を参照）。これはビルド未対応の場合の最小フォールバック。 */
var CACHE = 'TODO_slug-v1';
var ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS) }).then(function() { return self.skipWaiting() }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) { return Promise.all(keys.filter(function(k) { return k !== CACHE }).map(function(k) { return caches.delete(k) })) })
      .then(function() { return self.clients.claim() })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request) }));
});
