// ── Nyasadesk Service Worker ───────────────────────────────────────────────
// Handles: push notifications, offline caching (app shell + assets),
// background sync, and notification clicks.
// Strategy: Cache-first for static assets, network-first for API calls.

const CACHE_NAME = 'nyasadesk-v3';
const OFFLINE_URL = '/';

// App shell — core files to cache on install so the app loads offline
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

// ── Install: precache app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache failed for some urls:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart caching strategy ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: non-GET, cross-origin, API calls, Supabase, auth
  if (request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googleapis.com')) return;

  // For navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache successful navigation responses
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // For JS/CSS/images: cache-first (fast loads), fall back to network
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ico)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'New message', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nyasadesk';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: data.data || {},
    tag: data.data?.conversationId ? `conv-${data.data.conversationId}` : 'nyasa-msg',
    renotify: true,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'reply',   title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  // Update the app badge (unread count on icon)
  const badgeCount = data.data?.unreadTotal;
  if (typeof badgeCount === 'number' && 'setAppBadge' in self.registration) {
    event.waitUntil(
      Promise.all([
        (badgeCount > 0
          ? self.registration.setAppBadge(badgeCount)
          : self.registration.clearAppBadge()
        ).catch(() => {}),
        self.registration.showNotification(title, options),
      ])
    );
  } else {
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Focus existing window if open
    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        await client.navigate(url);
        return client.focus();
      }
    }

    // Open new window
    return self.clients.openWindow(url);
  })());
});

// ── Background sync (future: queue failed API calls) ──────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'nyasa-sync') {
    // placeholder for future background message sync
    event.waitUntil(Promise.resolve());
  }
});
