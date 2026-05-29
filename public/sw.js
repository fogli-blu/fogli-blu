const CACHE_NAME = 'vocalddt-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Service Worker and cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching static assets...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: stale-while-revalidate strategy for static resources, bypass for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass cache for API calls (let the browser deal with it)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch background update to keep cache fresh
        fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
