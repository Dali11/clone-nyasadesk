// Nyasadesk push service worker — shows a native OS notification for every
// new inbound message, same as WhatsApp does on desktop/mobile, even when
// the tab isn't focused (or the PWA isn't open at all, as long as the
// browser/OS keeps the service worker registered).

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'New message', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Nyasadesk';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    data: data.data || {},
    tag: data.data?.conversationId ? `conv-${data.data.conversationId}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
