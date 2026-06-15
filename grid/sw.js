const CACHE='yapps-grid-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    if(resp&&resp.ok&&new URL(e.request.url).origin===location.origin){c.put(e.request,resp.clone());}
    return resp;
  }).catch(()=>r))));
});
