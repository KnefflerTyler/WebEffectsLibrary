const CACHE = 'web-effects-v5';

// ── Install: nothing to pre-cache — assets are cached on first fetch ─────────
self.addEventListener('install', () => self.skipWaiting());

// ── Activate: delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: stale-while-revalidate for all same-origin GET requests ───────────
// Every file is cached automatically on first visit — no list to maintain.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached      = await cache.match(e.request);
      const networkFetch = fetch(e.request);

      // Update cache in background — silently swallow any network errors
      // so a failed revalidation never surfaces as an unhandled rejection.
      networkFetch
        .then(r => { if (r.ok) cache.put(e.request, r.clone()); })
        .catch(() => {});

      // Serve from cache immediately; fall back to live network if uncached.
      return cached || networkFetch;
    })
  );
});
