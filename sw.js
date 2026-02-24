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

self.addEventListener('push', function(event) {
    if (!event.data) return;
    try {
        const data = event.data.json();
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/maskable_icon_x192.png',
            badge: '/icons/maskable_icon_x192.png',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            data: { url: data.url || '/' }  // ← messo in oggetto data
        };
        const title = data.title || 'G-Diary';
        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        console.error('Push Event parsing failed:', err);
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    // Legge l'URL dai dati della notifica
    const urlToOpen = new URL(
        event.notification.data?.url || '/', 
        self.location.origin
    ).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {

            // Cerca finestra PWA già aperta con quell'URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }

            // Cerca qualsiasi finestra aperta del dominio
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    client.focus();
                    return client.navigate(urlToOpen);
                }
            }

            // Nessuna finestra aperta — apri la PWA
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
