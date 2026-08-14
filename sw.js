/* sapulapojne service worker — handle push di background */
const CACHE_NAME = 'sapulapojne-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'sapulapojne',
    body: 'Ada yang baru di pojok kita 💌',
    url: '/',
    tag: 'sapulapojne-default'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    // fallback kalau payload bukan JSON
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (_) {}
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'sapulapojne-default',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/',
      type: data.type || 'general'
    },
    vibrate: [120, 60, 120]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'sapulapojne', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.url && !client.url.includes(targetUrl) && 'navigate' in client) {
            try { client.navigate(targetUrl); } catch (_) {}
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
