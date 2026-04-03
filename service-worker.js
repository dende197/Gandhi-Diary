const CACHE_VERSION = '3.3.2';
const CACHE_NAME = `g-connect-static-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css?v=3.3.2',
  '/animations.css?v=3.3.2',
  '/ui.js?v=3.3.2',
  '/fluidity-engine-v3.js?v=3.0.2',
  '/manifest.webmanifest?v=3.3.2',
  '/gandhi-diary-icon-180.png?v=3.3.2',
  '/gandhi-diary-icon-192.png?v=3.3.2',
  '/gandhi-diary-icon-512.png?v=3.3.2',
];

function normalizeSameOriginUrl(url) {
  const normalized = new URL(url);
  if (normalized.origin !== self.location.origin) return normalized.toString();
  if (normalized.pathname === '/' && normalized.searchParams.get('source') === 'pwa') {
    normalized.searchParams.delete('source');
  }
  return normalized.toString();
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch((err) => {
      console.error('[SW] Failed to pre-cache app shell:', err?.message || err);
      throw err;
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api_internal/')) return;
  const normalizedUrl = normalizeSameOriginUrl(event.request.url);
  const normalizedRequest = new Request(normalizedUrl, { method: 'GET' });
  const isNavigation =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    event.request.headers.get('accept')?.includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(normalizedRequest).then(async (response) => {
        const cloned = response.clone();
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(normalizedRequest, cloned);
        } catch (err) {
          console.warn('[SW] Navigation cache write failed:', err?.message || err);
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(normalizedRequest);
        if (cached) return cached;
        return caches.match('/index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(normalizedRequest).then(async (cached) => {
      if (cached) {
        event.waitUntil(
          fetch(normalizedRequest).then((response) => {
            const cloned = response.clone();
            return caches.open(CACHE_NAME).then((cache) => cache.put(normalizedRequest, cloned));
          }).catch(() => {})
        );
        return cached;
      }
      try {
        const response = await fetch(normalizedRequest);
        const cloned = response.clone();
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(normalizedRequest, cloned);
        } catch (err) {
          console.warn('[SW] Resource cache write failed:', err?.message || err);
        }
        return response;
      } catch {
        return caches.match('/index.html');
      }
    })
  );
});
