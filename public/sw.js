// Custom service worker used on top of @angular/service-worker's ngsw.
// Angular's SW handles caching; this file wires up Web Push events so
// notifications fire even when the app is closed.
//
// Loaded via `ngswWorker: 'sw.js'` in angular.json so ngsw imports it.

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'MaxPOS', body: event.data.text() };
  }

  const title = payload.title || 'MaxPOS notification';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    tag: payload.tag || 'maxpos-notify',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/sales';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch { /* ignore */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
