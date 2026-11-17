/* DoePet Service Worker - Web Push API & Background Alert Delivery (DT-06) */

const CACHE_NAME = 'doepet-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'DoePet — Alerta de Emergência Veterinária',
    body: 'Uma clínica próxima precisa de doação de sangue compatível com seu pet.',
    url: '/',
    tag: 'doepet-blood-need',
    needId: null,
    correlationId: null,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'doepet-blood-need',
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.url || '/',
      needId: payload.needId,
      correlationId: payload.correlationId,
    },
    actions: [
      { action: 'open', title: 'Ver Alerta' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
