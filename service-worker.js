const CACHE_VERSION = '3.3.8';
const CACHE_NAME = `g-connect-static-${CACHE_VERSION}`;
const EXTERNAL_CACHE_NAME = `g-connect-external-${CACHE_VERSION}`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com?plugins=forms,container-queries',
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js',
  'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];
const EXTERNAL_ORIGINS = new Set([
  'https://cdn.tailwindcss.com',
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
]);
const APP_SHELL = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/style.css?v=3.3.8`,
  `${BASE_PATH}/animations.css?v=3.3.8`,
  `${BASE_PATH}/ui.js?v=3.3.8`,
  `${BASE_PATH}/app-bootstrap.js?v=3.3.8`,
  `${BASE_PATH}/fluidity-engine-v3.js?v=3.3.8`,
  `${BASE_PATH}/fluidity-boot-patch.js?v=1.2.0`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/gandhi-diary-icon-180.png`,
  `${BASE_PATH}/gandhi-diary-icon-192.png`,
  `${BASE_PATH}/gandhi-diary-icon-512.png`,
];

async function precacheExternalAssets() {
  const cache = await caches.open(EXTERNAL_CACHE_NAME);
  await Promise.all(EXTERNAL_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { mode: 'no-cors' });
      if (response) await cache.put(asset, response.clone());
    } catch (err) {
      console.warn('[SW] External asset pre-cache failed:', asset, err?.message || err);
    }
  }));
}

function normalizeSameOriginUrl(url) {
  const normalized = new URL(url);
  if (normalized.origin !== self.location.origin) return normalized.toString();
  if (
    (normalized.pathname === `${BASE_PATH}/` || normalized.pathname === `${BASE_PATH}`) &&
    normalized.searchParams.get('source') === 'pwa'
  ) {
    normalized.searchParams.delete('source');
  }
  return normalized.toString();
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(precacheExternalAssets)
      .catch((err) => {
        console.error('[SW] Failed to pre-cache app shell:', err?.message || err);
        throw err;
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== EXTERNAL_CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (EXTERNAL_ORIGINS.has(url.origin)) {
    event.respondWith(
      caches.open(EXTERNAL_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response) await cache.put(event.request, response.clone());
          return response;
        } catch (_) {
          return cached || new Response('', { status: 504, statusText: 'Offline' });
        }
      })
    );
    return;
  }
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
        return caches.match(`${BASE_PATH}/index.html`);
      })
    );
    return;
  }

  // Network-first: always fetch fresh from network; fall back to cache when offline.
  event.respondWith(
    fetch(normalizedRequest).then(async (response) => {
      const cloned = response.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(normalizedRequest, cloned);
      } catch (err) {
        console.warn('[SW] Resource cache write failed:', err?.message || err);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(normalizedRequest);
      return cached || caches.match(`${BASE_PATH}/index.html`);
    })
  );
});
