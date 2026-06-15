const CACHE = 'web-effects-v5';

// Check if caching is disabled via client message
let cachingEnabled = false;

self.addEventListener('message', (e) => {
  if (e.data.type === 'TOGGLE_CACHE') {
    cachingEnabled = e.data.enabled;
    console.log(`[Service Worker] Caching ${cachingEnabled ? 'enabled' : 'disabled'}`);
  }
});

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
// Caching can be disabled via message: navigator.serviceWorker.controller.postMessage({ type: 'TOGGLE_CACHE', enabled: false })
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // If caching is disabled, always fetch from network
  if (!cachingEnabled) {
    return e.respondWith(fetch(e.request));
  }

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const networkFetch = fetch(e.request)
        .then(r => {
          if (r.ok) cache.put(e.request, r.clone());
          return r;
        })
        .catch(() => null);

      // Serve from cache immediately; fall back to live network if uncached.
      // If network fetch fails, return cached response or a 504 Response.
      const networkResponse = await networkFetch;
      return cached || networkResponse || new Response('Gateway Timeout', { status: 504, statusText: 'Gateway Timeout' });
    })
  );
});
