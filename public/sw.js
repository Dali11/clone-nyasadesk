// ── Nyasadesk Service Worker v4 ────────────────────────────────────────────
// Grouped/stacked notifications (WhatsApp-style), badge icon, offline cache.

const CACHE_NAME = 'nyasadesk-v4';
const OFFLINE_URL = '/';

const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png',
  '/icon-maskable-512.png', '/apple-touch-icon.png', '/badge-n.png'];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(err => console.warn('[SW] precache:', err))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ico)$/) ||
      url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          return res;
        });
      })
    );
  }
});

// ── Push notifications (WhatsApp-style grouping) ───────────────────────────
//
// Strategy mirrors WhatsApp:
//  • Each conversation gets its own notification, keyed by tag=conv-<id>
//  • If that conversation already has a notification, we UPDATE it in place
//    (reuse the same tag) accumulating the message count shown in the body
//  • When 2+ conversations are active, a "summary" notification replaces
//    individual ones (tag='nyasa-summary'), just like WA's "3 new messages
//    from 2 chats" summary
//  • Badge icon: /badge-n.png — the "N" monogram
//  • App icon badge (number dot): set via Badging API

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'New message', body: event.data?.text() || '' }; }

  const convId   = data.data?.conversationId;
  const convTag  = convId ? `conv-${convId}` : 'nyasa-msg';
  const url      = data.data?.url || (convId ? `/?conv=${convId}` : '/');
  const unread   = typeof data.data?.unreadTotal === 'number' ? data.data.unreadTotal : 0;
  const unreadConvs = typeof data.data?.unreadConvs === 'number' ? data.data.unreadConvs : 1;

  event.waitUntil((async () => {
    // ── 1. Update app badge count ───────────────────────────────────────
    if ('setAppBadge' in self.registration) {
      (unread > 0
        ? self.registration.setAppBadge(unread)
        : self.registration.clearAppBadge()
      ).catch(() => {});
    }

    // ── 2. Get currently visible notifications ──────────────────────────
    const existing = await self.registration.getNotifications();
    const convNotifs = existing.filter(n => n.tag?.startsWith('conv-'));

    // ── 3. Build this conversation's notification ───────────────────────
    // If there's already a notif for THIS conversation, accumulate the count
    const prevNotif = existing.find(n => n.tag === convTag);
    const prevCount = prevNotif?.data?.msgCount || 0;
    const msgCount  = prevCount + 1;
    if (prevNotif) prevNotif.close();

    const sender    = data.title  || 'New message';
    const msgBody   = (data.body  || '').slice(0, 100) || '📎 Attachment';

    const convOptions = {
      body:      msgCount > 1 ? `${msgCount} messages · ${msgBody}` : msgBody,
      icon:      '/icon-192.png',
      badge:     '/badge-n.png',          // ← "N" monogram in status bar
      tag:       convTag,
      renotify:  true,
      silent:    msgCount > 1,            // only ring on the FIRST message per conv
      vibrate:   msgCount === 1 ? [200, 100, 200] : [],
      timestamp: Date.now(),
      data:      { url, conversationId: convId, msgCount, unreadTotal: unread },
      actions: [
        { action: 'open',    title: 'Open'    },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    // ── 4. Multi-conversation summary (like WhatsApp) ──────────────────
    // If there are already notifications for OTHER conversations, collapse
    // everything into a summary and close the individual ones.
    const otherConvNotifs = convNotifs.filter(n => n.tag !== convTag);

    if (otherConvNotifs.length >= 1 || unreadConvs > 1) {
      // Close individual notifs
      for (const n of existing) {
        if (n.tag !== 'nyasa-summary') n.close();
      }

      const totalConvs  = Math.max(otherConvNotifs.length + 1, unreadConvs);
      const totalMsgs   = unread;

      await self.registration.showNotification('Nyasadesk', {
        body:      `${totalMsgs} new message${totalMsgs !== 1 ? 's' : ''} from ${totalConvs} conversation${totalConvs !== 1 ? 's' : ''}`,
        icon:      '/icon-192.png',
        badge:     '/badge-n.png',
        tag:       'nyasa-summary',
        renotify:  false,
        silent:    true,
        data:      { url: '/', isSummary: true, unreadTotal: unread },
        actions: [
          { action: 'open', title: 'Open inbox' },
        ],
      });
    } else {
      // Single conversation — show it directly (no summary needed)
      // Close stale summary if one exists
      const summary = existing.find(n => n.tag === 'nyasa-summary');
      if (summary) summary.close();

      await self.registration.showNotification(sender, convOptions);
    }
  })());
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

// ── Background sync ────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'nyasa-sync') event.waitUntil(Promise.resolve());
});
