// ── Your Little Corner — Service Worker ──────────────────
// Version: bump this string to force all clients to update
const CACHE_VERSION = 'ylc-v24';

// App shell — these files are cached on first install
// and served from cache on every subsequent load (cache-first)
const APP_SHELL = [
  '/',
  '/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// External static assets — cache on first use (cache-first)
// These are versioned/CDN assets that rarely change
const CACHE_EXTERNAL = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700&display=swap',
];

// ── INSTALL: cache app shell ───────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Cache app shell — don't fail install if external assets fail
      return cache.addAll(APP_SHELL).then(() => {
        return cache.addAll(CACHE_EXTERNAL).catch(err => {
          console.warn('[SW] External cache failed (ok):', err);
        });
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches ───────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: routing strategy ────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── 1. Never intercept Firebase requests ──────────────
  // Firebase Realtime DB, Storage, Auth — always live
  if (
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('firebasestorage.app') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebaseapp.com')
  ) {
    return; // fall through to network
  }

  // ── 2. Never intercept weather API ────────────────────
  if (url.hostname.includes('open-meteo.com') ||
      url.hostname.includes('nominatim.openstreetmap.org') ||
      url.hostname.includes('timeapi.io')) {
    return; // always fresh
  }

  // ── 3. App shell (index.html + icons) → cache-first ──
  // If cached, return immediately. If not, fetch and cache.
  if (
    url.pathname.startsWith('/') &&
    !url.pathname.includes('sw.js')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Only cache successful same-origin responses
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
    return;
  }

  // ── 4. External static assets → cache-first ──────────
  // Leaflet, Google Fonts — cache on first use
  if (
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('openstreetmap.org')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── 5. Everything else → network only ────────────────
  // Don't intercept — let it go to network normally
});

// ── MESSAGE: force update from app ────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
