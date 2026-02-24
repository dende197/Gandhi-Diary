const CACHE_NAME = 'gdiary-v3.0.0';

const ASSETS = [
    '/manifest.json',
    '/icons/maskable_icon.png',
    '/icons/maskable_icon_x192.png',
    '/icons/maskable_icon_x512.png'
];

// Install: cache only static assets (NOT index.html — we always want fresh HTML)
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting(); // Activate immediately, don't wait for old tabs to close
});

// Activate: delete ALL old caches, take control of all pages immediately
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim(); // Take control immediately without reload
});

// Fetch: NETWORK-FIRST for HTML pages, cache-first for static assets
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // HTML pages → always fetch from network, fall back to cache only if offline
    if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Static assets (icons, manifest) → serve from cache, fall back to network
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});

// Push notification handler
self.addEventListener('push', function (event) {
    if (!event.data) return;
    try {
        const data = event.data.json();
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/maskable_icon_x192.png',
            badge: '/icons/maskable_icon_x192.png',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            data: { url: '/' }
        };
        const title = data.title || 'G-Diary';
        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        console.error('Push parse error:', err);
    }
});

// Notification click → open/focus the app
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
