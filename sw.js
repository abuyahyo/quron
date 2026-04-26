// Kill-switch service worker. Replaces any previously-registered cache-first
// SW so existing users stop being served stale assets from the old cache.
self.addEventListener('install', function (e) {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      await self.registration.unregister();
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { c.navigate(c.url); });
    } catch (err) { /* nothing left to do */ }
  })());
});
