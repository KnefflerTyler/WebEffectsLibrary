const CACHE = 'web-effects-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/back-button.js',
  '/preview.js',
  '/settings.css',

  '/default_cube/index.html',
  '/default_cube/js/config.js',
  '/default_cube/js/default.js',
  '/default_cube/js/shaders.js',
  '/default_cube/glsl/cube.frag.glsl',
  '/default_cube/glsl/cube.vert.glsl',

  '/galaxy/index.html',
  '/galaxy/js/bodies.js',
  '/galaxy/js/CelestialBody.js',
  '/galaxy/js/config.js',
  '/galaxy/js/galaxy.js',
  '/galaxy/js/GalaxySystem.js',
  '/galaxy/js/shaders.js',
  '/galaxy/js/three.js',
  '/galaxy/js/userinput.js',
  '/galaxy/glsl/blackhole.frag.glsl',
  '/galaxy/glsl/body.frag.glsl',
  '/galaxy/glsl/body.vert.glsl',
  '/galaxy/glsl/moon.frag.glsl',
  '/galaxy/glsl/planet.frag.glsl',
  '/galaxy/glsl/star.frag.glsl',

  '/grid_3d_points/index.html',
  '/grid_3d_points/js/config.js',
  '/grid_3d_points/js/MouseLines.js',
  '/grid_3d_points/js/MouseWeb.js',
  '/grid_3d_points/js/pointGrid.js',
  '/grid_3d_points/js/shaders.js',
  '/grid_3d_points/js/SlabManager.js',
  '/grid_3d_points/glsl/line.frag.glsl',
  '/grid_3d_points/glsl/line.vert.glsl',
  '/grid_3d_points/glsl/point.frag.glsl',
  '/grid_3d_points/glsl/point.vert.glsl',

  '/grid_breath/index.html',
  '/grid_breath/js/config.js',
  '/grid_breath/js/gridBreath.js',
  '/grid_breath/js/shaders.js',
  '/grid_breath/glsl/point.frag.glsl',
  '/grid_breath/glsl/point.vert.glsl',

  '/grid_shape/index.html',
  '/grid_shape/js/config.js',
  '/grid_shape/js/gridGeometry.js',
  '/grid_shape/js/ripple.js',
  '/grid_shape/js/shaders.js',
  '/grid_shape/js/shapeGrid.js',
  '/grid_shape/js/spotlight.js',
  '/grid_shape/glsl/line.frag.glsl',
  '/grid_shape/glsl/line.vert.glsl',

  '/obj_display/index.html',
  '/obj_display/js/config.js',
  '/obj_display/js/mtlParser.js',
  '/obj_display/js/objDisplay.js',
  '/obj_display/js/objParser.js',
  '/obj_display/js/shaders.js',
  '/obj_display/glsl/obj.frag.glsl',
  '/obj_display/glsl/obj.vert.glsl',

  '/Parallax_Horizontal/index.html',
  '/Parallax_Horizontal/js/parallax.js',
  '/Parallax_Horizontal/assets/images/bg1.svg',
  '/Parallax_Horizontal/assets/images/bg2.svg',

  '/Parallax_Vertical/index.html',
  '/Parallax_Vertical/js/parallax.js',
  '/Parallax_Vertical/assets/images/bg1.svg',
  '/Parallax_Vertical/assets/images/bg2.svg',

  '/perlin_noise_mask/index.html',
  '/perlin_noise_mask/js/config.js',
  '/perlin_noise_mask/js/default.js',
  '/perlin_noise_mask/js/shaders.js',
  '/perlin_noise_mask/glsl/noise.frag.glsl',
  '/perlin_noise_mask/glsl/noise.vert.glsl',
];

// ── Install: pre-cache all assets ───────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ─────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first, fall back to network ─────────────────
self.addEventListener('fetch', (e) => {
  // Only handle GET requests for same-origin assets
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
      // Cache any new successful responses for future visits
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return response;
    }))
  );
});
