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

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
        return response;
      }).catch(() => cached);
    })
  );
});
