// Service worker: makes the app work without internet (for example in a shop
// with bad signal). The build (vite.config.ts) fills in the version and the
// list of app files, and publishes this file as sw.js.
//
// - App files (HTML, scripts, styles, icons): saved on install, served from
//   the phone. The page itself is fetched fresh when online.
// - Price data (data/...): fetched fresh when online; the last copy is used
//   when offline or when the network is very slow.
// - Fonts and dish photos: saved the first time they load, and kept across
//   app updates (photos are not re-downloaded after every update).

const VERSION = '__VERSION__';
const PRECACHE = JSON.parse('__PRECACHE__');
const APP = `app-${VERSION}`;
const DATA = 'data-v1';
const FONTS = 'fonts-v1';
const PHOTOS = 'photos-v1';
const SLOW_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Fresh from the network; the saved copy when offline or slow. */
async function networkFirst(event, cacheName, fallback) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const saved = (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) || (fallback ? await caches.match(fallback, { ignoreVary: true }) : undefined);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
    return res;
  });
  if (!saved) return fresh;
  const slow = new Promise((resolve) => setTimeout(() => resolve(saved), SLOW_MS));
  return Promise.race([fresh.catch(() => saved), slow]);
}

/** Saved copy first; fetch and save it the first time. */
async function cacheFirst(event, cacheName) {
  // ignoreVary: script requests carry an Origin header the saved copy did not.
  const saved = await caches.match(event.request, { ignoreVary: true });
  if (saved) return saved;
  const res = await fetch(event.request);
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(event.request, copy)).catch(() => undefined);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, FONTS));
    return;
  }
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, APP, scope.href));
    return;
  }
  const path = url.pathname.slice(scope.pathname.length);
  if (path.startsWith('data/')) {
    event.respondWith(networkFirst(event, DATA));
    return;
  }
  if (path.startsWith('photos/')) {
    event.respondWith(cacheFirst(event, PHOTOS));
    return;
  }
  event.respondWith(cacheFirst(event, APP));
});
