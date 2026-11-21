// Whisker Walk service worker — offline app shell plus every file of a build.
// Bump CACHE whenever the caching strategy changes; activate() wipes any
// caches from a previous version. v2 (F6, places load on demand): the first
// F6 deploy drops the v1 cache. That costs nothing a child can see, because a
// pre-F6 page carries every place in its main chunk (Rooftops aside, a dev
// switch), so no open v1 page ever asks for a file only v1's cache held.
//
// The website build ships this file with a `// build <id>` line on top
// (vite.config.js), so every deploy changes its bytes and the browser installs
// the new worker; the rest is byte-for-byte this file.
const CACHE = 'whisker-v2';

// self.registration.scope is the absolute URL this SW was registered under
// ('http://host/' in dev, 'https://host/whisker-walk/' on Pages) — deriving
// shell URLs from it (instead of hardcoded '/' paths) keeps this file
// correct under either base path.
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
// The build's own list of its files (scripts/precache.mjs): { build, files }.
const PRECACHE_URL = new URL('precache.json', SCOPE).href;
// Each build's list is kept in the cache under __builds/<build>, in the order
// the builds were first seen; it is what pruning keeps.
const BUILDS = new URL('__builds/', SCOPE).href;

// Places load on demand, so a build is about 25 files under assets/ and an
// offline walk into a place needs that place's file already cached. Every
// file of a build is cached on install (and topped up on the next online page
// load), and pruning keeps the files of the newest KEEP_BUILDS builds: a page
// left open across a deploy can still enter a place, because its old files
// (gone from Pages) are still here. Pure on purpose: test/swprune.test.js
// loads it from this file between the markers. Never touches non-/assets/ URLs.
// prune:start
const KEEP_BUILDS = 3;
function precacheUrls(list, scope) {
  if (!list || typeof list !== 'object' || !Array.isArray(list.files)) return [];
  return list.files.filter((f) => typeof f === 'string' && f.startsWith('assets/')).map((f) => new URL(f, scope).href);
}
function buildsToDrop(buildKeys, max) {
  return buildKeys.length > max ? buildKeys.slice(0, buildKeys.length - max) : [];
}
function assetsToPrune(urls, keepUrls) {
  const keep = new Set(keepUrls);
  return urls.filter((u) => new URL(u).pathname.includes('/assets/') && !keep.has(u));
}
// The /assets/ files a page names (Vite's index.html: the entry script's src,
// each static import's modulepreload href, the stylesheet's href), as
// absolute URLs on the page's own site. A cached page needs exactly these to
// start, whatever build list precache.json gave.
function htmlAssetUrls(html, base) {
  if (typeof html !== 'string') return [];
  const out = [];
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    let u;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.origin === new URL(base).origin && u.pathname.includes('/assets/')) out.push(u.href);
  }
  return out;
}
// prune:end

// Stores a build's list unless it is already stored: re-storing would move it
// to the end and make an old build look new. Resolves true when the list is
// in the cache.
function storeList(cache, list) {
  if (typeof list.build !== 'string' || !list.build) return Promise.resolve(false);
  const key = BUILDS + encodeURIComponent(list.build);
  return cache.match(key).then((hit) => {
    if (hit) return true;
    const body = JSON.stringify({ build: list.build, files: list.files });
    return cache.put(key, new Response(body, { headers: { 'content-type': 'application/json' } })).then(() => true);
  });
}

// Caches the shell and every file the live build lists, one by one, skipping
// ones already cached. The index.html shell is fetched again every time, not
// skipped: it is the offline fallback for any page URL never cached (a query
// string), and nothing else refreshes it (a page load refreshes only its own
// URL); a refresh that fails keeps the one cached. A file that fails
// (offline, a 404 mid-deploy) leaves the rest cached and is retried by the
// next top-up. The list is stored before the files so a prune running
// meanwhile keeps them. Never rejects; resolves true when the live build's
// list is stored.
function precache() {
  return fetch(PRECACHE_URL, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((list) =>
      caches.open(CACHE).then((cache) => {
        const files = precacheUrls(list, SCOPE);
        const listed = files.length ? storeList(cache, list).catch(() => false) : Promise.resolve(false);
        return listed.then((ok) =>
          Promise.allSettled([
            // past the browser's HTTP cache too (Pages keeps a page 10 minutes)
            cache.add(new Request(INDEX, { cache: 'no-cache' })),
            ...[SCOPE, ...files].map((u) => cache.match(u).then((hit) => hit || cache.add(u))),
          ]).then(() => ok)
        );
      })
    )
    .catch(() => false);
}

// Drops build lists beyond KEEP_BUILDS, then every /assets/ file outside the
// kept lists and not named by the two shells (SCOPE, index.html). The shells
// matter because Pages can serve a fresh page with the previous precache.json
// for a while after a deploy: the fresh page's start-up files (cached as it
// loaded them) are in no stored list yet, and dropping them would leave an
// offline launch blank. Every other cached page (a page load at a URL with a
// query string: ?roofs=1, ?grow=1) is dropped too: kept, each would pin its
// build's files for good, or name files already gone. Offline, such a URL
// falls back to index.html, which every precache refreshes; online it is
// cached again by its next load. With no list (a build without
// precache.json) it prunes nothing; if a kept list can't be read it prunes
// nothing rather than guess.
function pruneAssets() {
  return caches
    .open(CACHE)
    .then((cache) =>
      cache.keys().then((reqs) => {
        const urls = reqs.map((r) => r.url);
        const lists = urls.filter((u) => u.startsWith(BUILDS));
        if (!lists.length) return;
        const drop = buildsToDrop(lists, KEEP_BUILDS);
        const kept = lists.filter((u) => !drop.includes(u));
        return Promise.all(drop.map((u) => cache.delete(u)))
          .then(() => Promise.all(kept.map((u) => cache.match(u).then((r) => (r ? r.json() : null)))))
          .then((read) => {
            if (read.some((l) => !precacheUrls(l, SCOPE).length)) return;
            const keep = read.flatMap((l) => precacheUrls(l, SCOPE));
            return Promise.all([shellsNamed(cache), otherPages(cache, urls)]).then(([named, pages]) =>
              Promise.all([...assetsToPrune(urls, [...keep, ...named]), ...pages].map((u) => cache.delete(u)))
            );
          });
      })
    )
    .catch(() => {}); // pruning is housekeeping; never let it break the worker
}

// Every /assets/ URL the two cached shells (SCOPE, index.html) name.
function shellsNamed(cache) {
  return Promise.all(
    [SCOPE, INDEX].map((u) => cache.match(u).then((r) => (r ? r.text().then((html) => htmlAssetUrls(html, u)) : [])))
  ).then((lists) => lists.flat());
}

// Every cached page but the two shells: a cached response served as text/html
// (pictures, sounds, icons and the manifest are not).
function otherPages(cache, urls) {
  const maybe = urls.filter(
    (u) => u !== SCOPE && u !== INDEX && !u.startsWith(BUILDS) && !new URL(u).pathname.includes('/assets/')
  );
  return Promise.all(
    maybe.map((u) => cache.match(u).then((r) => (r && (r.headers.get('content-type') || '').includes('text/html') ? u : null)))
  ).then((pages) => pages.filter(Boolean));
}

// Pruning only follows a precache that stored the live build's list, so the
// live build's files (some perhaps cached by the page, not by a precache) are
// never pruned; and a page's start-up files are kept while a cached shell names
// them, even when precache.json was still the previous build's. A worker restarted between install and activate skips the
// prune; the next page load's top-up does it.
let installListed = false;

// Every online page load tops up: it fills what an install missed (offline,
// a flaky file), and a worker that missed an update stores the new build's
// list and prunes exactly as activate does. One at a time.
let topping = null;
function topUp() {
  if (!topping) {
    topping = precache()
      .then((listed) => (listed ? pruneAssets() : undefined))
      .finally(() => {
        topping = null;
      });
  }
  return topping;
}

// Extends an event's life for background cache work; never throws.
function keep(event, promise) {
  const p = promise.catch(() => {});
  try {
    event.waitUntil(p);
  } catch {
    /* the event is already over; the work still runs */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache()
      .then((listed) => {
        installListed = listed;
      })
      .catch(() => {}) // never fail install: runtime caching and the next top-up fill in
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => (installListed ? pruneAssets() : undefined))
      .catch(() => {})
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
          if (response.ok) {
            const copy = response.clone();
            keep(event, caches.open(CACHE).then((cache) => cache.put(request, copy)));
            keep(event, topUp());
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(INDEX)))
    );
    return;
  }

  if (isHashedAsset) {
    // Hashed build assets are immutable — cache-first, network as fallback.
    // No prune here: pruning follows activate and a top-up.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              keep(event, caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
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
        if (response.ok) {
          const copy = response.clone();
          keep(event, caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
