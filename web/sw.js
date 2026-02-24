const CACHE_NAME = 'gdiary-v1.1.81';

const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/maskable_icon.png',
    '/icons/maskable_icon_x192.png',
    '/icons/maskable_icon_x512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Elimina vecchie cache
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request)
            .then((response) => response || fetch(e.request))
    );
});
