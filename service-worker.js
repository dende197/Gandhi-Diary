const CACHE_VERSION = '3.2.7';
const CACHE_NAME = `g-connect-static-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css?v=3.2.7',
  '/animations.css?v=3.2.7',
  '/ui.js?v=3.2.7',
  '/fluidity-engine-v3.js?v=3.0.2',
  '/manifest.webmanifest?v=3.2.7',
  '/gandhi-diary-icon-180.png?v=3.2.7',
  '/gandhi-diary-icon-192.png?v=3.2.7',
  '/gandhi-diary-icon-512.png?v=3.2.7',
  '/gandhi_diary_icon_final-2.svg?v=3.2.7'
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const normalizedUrl = normalizeSameOriginUrl(event.request.url);
  const normalizedRequest = new Request(normalizedUrl, { method: 'GET' });

  event.respondWith(
    caches.match(normalizedRequest).then((cached) => {
      if (cached) return cached;
      return fetch(normalizedRequest).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(normalizedRequest, cloned)).catch((err) => {
          console.warn('[SW] Failed to cache response for', normalizedRequest.url, ':', err?.message || err);
        });
        return response;
      }).catch((err) => {
        console.warn('[SW] Fetch failed for', normalizedRequest.url, ':', err?.message || err);
        return caches.match('/index.html');
      });
    })
  );
});
