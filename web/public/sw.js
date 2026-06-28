const CACHE_NAME = 'clipboard-cache-storage';
// Only cache truly static assets — NOT index.html.
// Vite content-hashes JS/CSS on every build; caching index.html causes it to
// serve stale asset references (old hashes) after a rebuild → 404 on JS/CSS.
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // activate immediately, don't wait for old SW to die
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  // Delete any old cache versions left from previous builds.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Always fetch HTML fresh from the server so a rebuild is reflected immediately.
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // Cache-first for icons and manifest (these never change between builds).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
