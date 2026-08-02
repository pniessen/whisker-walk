// Whisker Walk service worker — minimal offline app shell.
// Bump CACHE whenever the caching strategy changes; activate() wipes any
// caches from a previous version.
const CACHE = 'whisker-v1';

// self.registration.scope is the absolute URL this SW was registered under
// ('http://host/' in dev, 'https://host/whisker-walk/' on Pages) — deriving
// shell URLs from it (instead of hardcoded '/' paths) keeps this file
// correct under either base path.
const SCOPE = self.registration.scope;
const SHELL = [SCOPE, new URL('index.html', SCOPE).href];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // offline-at-install is fine; runtime caching fills in later
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin traffic (Supabase REST/Realtime, etc.) —
  // always let it hit the network untouched.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  const isHashedAsset = url.pathname.includes('/assets/');

  if (isNavigation) {
    // Network-first for HTML so a fresh deploy is picked up immediately;
    // fall back to the cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(new URL('index.html', SCOPE).href)))
    );
    return;
  }

  if (isHashedAsset) {
    // Hashed build assets are immutable — cache-first, network as fallback.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Everything else same-origin (icons, manifest, fonts): opportunistic
  // cache-then-network, so repeat visits still work offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
