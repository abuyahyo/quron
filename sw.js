// Quron service worker.
//
// Strategy:
//   - HTML navigations and data.js: network-first (always fresh when online,
//     cached copy as offline fallback). This guarantees that when the
//     developer pushes a new index.html or bumps data.js?v=..., returning
//     online users see the update on the very next page load.
//   - Icons, fonts, other static assets: stale-while-revalidate.
//   - skipWaiting + clients.claim in install/activate so a new SW takes over
//     immediately instead of waiting for every tab to close.
//   - Activate deletes every cache whose name is not the current CACHE_NAME,
//     so bumping CACHE_VERSION wipes the old payload.
//   - Emergency hatch: visiting any URL with ?killsw=1 nukes every cache
//     and unregisters the SW.
//
// Bump CACHE_VERSION whenever the app shell changes substantively (and bump
// the data.js?v= query string in index.html when data.js changes).

const CACHE_VERSION = '2026-05-20-01';
const CACHE_NAME = 'quron-' + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(APP_SHELL.map(function (u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    } catch (_) { /* shell pre-cache is best-effort */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    } catch (_) { /* ignore */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHTMLRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (req.destination === 'document') return true;
  if (url.pathname === '/' || url.pathname.endsWith('/')) return true;
  if (url.pathname.endsWith('.html')) return true;
  return false;
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  if (url.searchParams.get('killsw') === '1') {
    e.respondWith((async function () {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        await self.registration.unregister();
      } catch (_) { /* ignore */ }
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Кеш тозаланди</title>' +
        '<p style="font:16px/1.5 sans-serif;padding:24px">' +
        'Service Worker ва барча кешлар тозаланди. ' +
        '<a href="' + url.pathname + '">Сахифани очиш</a>.' +
        '</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isGoogleFonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isGoogleFonts) return;

  const isHTML = sameOrigin && isHTMLRequest(req, url);
  const isData = sameOrigin && /(^|\/)data\.js$/.test(url.pathname);

  if (isHTML || isData) {
    e.respondWith(networkFirst(req, isHTML));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req, isNavigation) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(function () {});
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (isNavigation) {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).catch(function () {});
    }
    return res;
  }).catch(function () { return null; });
  return cached || (await networkPromise) || fetch(req);
}
