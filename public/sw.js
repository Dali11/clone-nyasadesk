// ── Nyasadesk Service Worker v5 ────────────────────────────────────────────
// Grouped/stacked notifications (WhatsApp-style), inline reply, badge icon.

const CACHE_NAME = 'nyasadesk-v5';
const OFFLINE_URL = '/';
const NOTIF_REPLY_ENDPOINT = '/api/team?action=notif-reply';

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
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'New message', body: event.data?.text() || '' }; }

  const convId      = data.data?.conversationId;
  const convTag     = convId ? `conv-${convId}` : 'nyasa-msg';
  const url         = data.data?.url || (convId ? `/?conv=${convId}` : '/');
  const unread      = typeof data.data?.unreadTotal === 'number' ? data.data.unreadTotal : 0;
  const unreadConvs = typeof data.data?.unreadConvs === 'number' ? data.data.unreadConvs : 1;
  const workspaceId = data.data?.workspaceId || '';
  const channel     = data.data?.channel || 'whatsapp';

  event.waitUntil((async () => {
    // 1. Update app badge
    if ('setAppBadge' in self.registration) {
      (unread > 0
        ? self.registration.setAppBadge(unread)
        : self.registration.clearAppBadge()
      ).catch(() => {});
    }

    // 2. Get current notifications
    const existing    = await self.registration.getNotifications();
    const convNotifs  = existing.filter(n => n.tag?.startsWith('conv-'));
    const prevNotif   = existing.find(n => n.tag === convTag);
    const prevCount   = prevNotif?.data?.msgCount || 0;
    const msgCount    = prevCount + 1;
    if (prevNotif) prevNotif.close();

    const sender  = data.title || 'New message';
    const msgBody = (data.body  || '').slice(0, 100) || '📎 Attachment';

    // 3. Per-conversation notification with inline Reply action
    const convOptions = {
      body:      msgCount > 1 ? `${msgCount} messages · ${msgBody}` : msgBody,
      icon:      '/icon-192.png',
      badge:     '/badge-n.png',
      tag:       convTag,
      renotify:  true,
      silent:    msgCount > 1,
      vibrate:   msgCount === 1 ? [200, 100, 200] : [],
      timestamp: Date.now(),
      data: {
        url, conversationId: convId, workspaceId, channel,
        msgCount, unreadTotal: unread,
      },
      // Android 7+ supports inline text reply via this action type
      actions: [
        { action: 'reply',   title: 'Reply', type: 'text', placeholder: 'Type a reply…' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    // 4. Multi-conversation summary
    const otherConvNotifs = convNotifs.filter(n => n.tag !== convTag);
    if (otherConvNotifs.length >= 1 || unreadConvs > 1) {
      for (const n of existing) { if (n.tag !== 'nyasa-summary') n.close(); }
      const totalConvs = Math.max(otherConvNotifs.length + 1, unreadConvs);
      const totalMsgs  = unread;
      await self.registration.showNotification('Nyasadesk', {
        body:      `${totalMsgs} new message${totalMsgs !== 1 ? 's' : ''} from ${totalConvs} conversation${totalConvs !== 1 ? 's' : ''}`,
        icon:      '/icon-192.png',
        badge:     '/badge-n.png',
        tag:       'nyasa-summary',
        renotify:  false,
        silent:    true,
        data:      { url: '/', isSummary: true, unreadTotal: unread },
        actions:   [{ action: 'open', title: 'Open inbox' }],
      });
    } else {
      const summary = existing.find(n => n.tag === 'nyasa-summary');
      if (summary) summary.close();
      await self.registration.showNotification(sender, convOptions);
    }
  })());
});

// ── Inline reply from notification bar ────────────────────────────────────
self.addEventListener('notificationreply', (event) => {
  event.notification.close();

  const replyText   = event.reply;
  const notifData   = event.notification.data || {};
  const { conversationId, workspaceId, channel } = notifData;

  if (!replyText?.trim() || !conversationId || !workspaceId) return;

  event.waitUntil((async () => {
    try {
      // Pull the NOTIF_REPLY_SECRET from SW's own scope (injected at registration time)
      // We store it in the SW cache under a special key so it survives SW restarts
      const secret = await getReplySecret();

      const res = await fetch(NOTIF_REPLY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          conversationId,
          workspaceId,
          channel: channel || 'whatsapp',
          text: replyText.trim(),
        }),
      });

      if (res.ok) {
        // Show a brief "Sent" confirmation notification — replaces the original
        await self.registration.showNotification('Message sent ✓', {
          body:    replyText.trim().slice(0, 80),
          icon:    '/icon-192.png',
          badge:   '/badge-n.png',
          tag:     notifData.conversationId ? `conv-${notifData.conversationId}` : 'nyasa-sent',
          silent:  true,
          vibrate: [100],
          data:    { url: notifData.url || '/', conversationId, msgCount: 0, unreadTotal: 0 },
          actions: [{ action: 'open', title: 'Open chat' }],
        });
      } else {
        const err = await res.json().catch(() => ({}));
        await self.registration.showNotification('Reply failed', {
          body:   err.error || 'Could not send. Tap to open.',
          icon:   '/icon-192.png',
          badge:  '/badge-n.png',
          tag:    'nyasa-reply-error',
          silent: true,
          data:   { url: notifData.url || '/' },
        });
      }
    } catch (e) {
      console.error('[SW] notifReply error:', e);
    }
  })());
});

// ── Secret management ──────────────────────────────────────────────────────
// The NOTIF_REPLY_SECRET is a string stored in the SW's IndexedDB-backed
// cache so the SW can authenticate inline replies to the backend without
// a user session. It's written once at PWA install time via a postMessage
// from main.jsx, then persisted across SW restarts.
const SECRET_CACHE = 'nyasa-sw-secrets-v1';
const SECRET_KEY   = 'notif-reply-secret';

async function getReplySecret() {
  try {
    const cache = await caches.open(SECRET_CACHE);
    const resp  = await cache.match(SECRET_KEY);
    if (resp) return await resp.text();
  } catch { /**/ }
  return '';
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_REPLY_SECRET' && event.data.secret) {
    caches.open(SECRET_CACHE).then(cache => {
      cache.put(SECRET_KEY, new Response(event.data.secret));
    });
  }
  // Force update signal from main.jsx
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
