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
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(response => {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        });
        // Serve cached version immediately; update cache in background
        return cached || fresh;
      })
    )
  );
});
