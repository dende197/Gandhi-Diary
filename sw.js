self.addEventListener('push', function (event) {
    if (!event.data) return;

    try {
        const data = event.data.json();

        const options = {
            body: data.body || '',
            icon: data.icon || '/icon-192.png',
            badge: '/icon-192.png', // idealmente un'icona bianca su sfondo trasparente
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            data: data.url || '/'
        };

        const title = data.title || 'G-Diary';
        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        console.error('Push Event parsing failed:', err);
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Se c'è già una finestra aperta con G-Diary, la mettiamo in primo piano
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Altrimenti apriamo una nuova finestra
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
