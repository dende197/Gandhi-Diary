const CACHE_VERSION = '4.3.1';
const CACHE_NAME = `g-connect-static-${CACHE_VERSION}`;
const EXTERNAL_CACHE_NAME = `g-connect-external-${CACHE_VERSION}`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const EXTERNAL_ASSETS = [
  'https://unpkg.com/@phosphor-icons/web@2.1.1',
  'https://unpkg.com/lucide@0.441.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/marked@14.1.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];
const EXTERNAL_ORIGINS = new Set([
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
]);
const APP_SHELL = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/assets/tailwind.css?v=4.3.1`,
  `${BASE_PATH}/style.css?v=4.3.1`,
  `${BASE_PATH}/animations.css?v=4.3.1`,
  `${BASE_PATH}/assets/demo-cleanup.js?v=4.3.1`,
  `${BASE_PATH}/assets/frontend-runtime.js?v=4.3.1`,
  `${BASE_PATH}/assets/ui.js?v=4.3.1`,
  `${BASE_PATH}/assets/push-settings.js?v=4.3.1`,
  `${BASE_PATH}/assets/app-bootstrap.js?v=4.3.1`,
  `${BASE_PATH}/assets/fluidity-engine-v3.js?v=4.3.1`,
  `${BASE_PATH}/assets/fluidity-boot-patch.js?v=4.3.1`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/gandhi-diary-icon-180.png`,
  `${BASE_PATH}/gandhi-diary-icon-192.png`,
];

async function precacheExternalAssets() {
  const cache = await caches.open(EXTERNAL_CACHE_NAME);
  const optional = [...EXTERNAL_ASSETS, `${BASE_PATH}/assets/ui-views.js?v=4.3.1`, `${BASE_PATH}/assets/ui-modals.js?v=4.3.1`];
  await Promise.all(optional.map(async (asset) => {
    try {
      const response = await fetch(asset, { mode: 'no-cors' });
      if (isCacheable(response, new URL(asset, self.location.origin).href)) await cache.put(asset, response.clone());
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
      Promise.all(keys.filter((k) => k.startsWith('g-connect-') && k !== CACHE_NAME && k !== EXTERNAL_CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheable(response, url) {
  if (!response) return false;
  if (response.type === 'opaque') return new URL(url).origin !== self.location.origin;
  if (!response.ok) return false;
  const type = response.headers.get('content-type') || '';
  const path = new URL(url).pathname;
  if (/\.(m?js)$/.test(path)) return /javascript|ecmascript/.test(type);
  if (/\.css$/.test(path)) return type.includes('text/css');
  return true;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const external = EXTERNAL_ORIGINS.has(url.origin);
  if (!external && url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api_internal/')) return;
  const navigation = event.request.mode === 'navigate' || event.request.destination === 'document' ||
    event.request.headers.get('accept')?.includes('text/html');
  const key = external ? event.request : new Request(normalizeSameOriginUrl(event.request.url));
  // Register background work synchronously in the fetch event lifetime.
  const network = fetch(event.request).then(async response => {
    if (isCacheable(response, url.href)) {
      try { const cache = await caches.open(external ? EXTERNAL_CACHE_NAME : CACHE_NAME); await cache.put(key, response.clone()); }
      catch (_) { /* A quota error must not turn a working network response into a failure. */ }
    }
    return response;
  }).catch(() => null);
  event.waitUntil(network);
  event.respondWith((async () => {
    const cached = await caches.match(key);
    if (cached && isCacheable(cached, url.href)) return cached;
    const response = await network;
    if (response?.ok || response?.type === 'opaque') return response;
    if (navigation) {
      const shell = await caches.match(`${BASE_PATH}/index.html`);
      if (shell?.ok) return shell;
    }
    return response || new Response('Risorsa non disponibile offline', {status:504, headers:{'Content-Type':'text/plain'}});
  })());
});

// Web Push is delivered by the operating system even when no app window is open.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Always show a safe, visible fallback. */ }
  const routes = new Set(['home', 'planner', 'voti', 'circolari', 'profile']);
  const route = routes.has(payload.route) ? payload.route : 'home';
  event.waitUntil(self.registration.showNotification(String(payload.title || 'Gandhi Diary').slice(0,100), {
    body: String(payload.body || 'Hai nuove informazioni nel diario.').slice(0,240),
    icon: `${BASE_PATH}/gandhi-diary-icon-192.png`,
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0,64) : 'gandhi-update',
    data: { route },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const routes = new Set(['home', 'planner', 'voti', 'circolari', 'profile']);
  const route = routes.has(event.notification.data?.route) ? event.notification.data.route : 'home';
  const target = new URL(`${BASE_PATH}/#${route}`, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && (url.pathname === `${BASE_PATH}/` || url.pathname === `${BASE_PATH}/index.html`)) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
