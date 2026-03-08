self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
        self.registration.showNotification(data.title || '☀️ Buongiorno!', {
            body: data.body || 'Tocca per il briefing',
            icon: data.icon || '/icon-192.png',
            badge: '/icon-96.png',
            vibrate: [200, 100, 200],
            data: { url: data.url || '/morning' }
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const url = event.notification.data?.url || '/morning';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
