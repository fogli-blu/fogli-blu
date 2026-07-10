const CACHE_NAME = 'vocalddt-v9';

// Solo risorse statiche non cambiano spesso (icone, manifest)
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: pre-cacha solo le risorse statiche (NON css/js — usano network-first)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets (icons only)...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: elimina tutte le vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        }
      }))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - API → bypass totale (no cache)
//   - CSS / JS / HTML → NETWORK FIRST (sempre fresh dal server)
//   - Icone / manifest → cache first
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass cache per API
  if (url.pathname.startsWith('/api/')) return;

  // Network-first per HTML, CSS e JS (modifiche immediate)
  if (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first per risorse statiche (icone, manifest)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
