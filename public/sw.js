// ── Nyasadesk Service Worker v6 ────────────────────────────────────────────
// Full offline-first PWA:
//  - Pre-caches ALL Vite build chunks at install (app shell + all routes)
//  - Cache-first for assets, network-first for navigation
//  - Offline: serves cached HTML shell for any navigation
//  - Grouped/stacked push notifications (WhatsApp-style)
//  - Inline reply from notification bar
//  - Badge icon support

const STATIC_CACHE  = 'nyasadesk-static-v6';   // versioned static assets
const DYNAMIC_CACHE = 'nyasadesk-dynamic-v6';   // runtime HTML pages
const SECRET_CACHE  = 'nyasa-sw-secrets-v1';    // inline reply secret
const NOTIF_REPLY_ENDPOINT = '/api/team?action=notif-reply';

// Core shell files — always precached
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/badge-n.png',
];

// ── Install: cache shell + all Vite build assets ───────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);

    // 1. Cache the core shell
    await cache.addAll(SHELL_URLS).catch(e => console.warn('[SW] shell precache:', e));

    // 2. Discover and cache ALL Vite output chunks via the asset manifest
    //    Vite writes /.vite/manifest.json at build time listing every chunk.
    try {
      const manifestRes = await fetch('/.vite/manifest.json', { cache: 'no-store' });
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        const assetUrls = Object.values(manifest).flatMap(entry => {
          const files = [entry.file];
          if (entry.css) files.push(...entry.css);
          if (entry.assets) files.push(...entry.assets);
          return files;
        }).filter(Boolean).map(f => '/' + f.replace(/^\//, ''));

        // Batch into groups of 20 to avoid fetch storms
        for (let i = 0; i < assetUrls.length; i += 20) {
          const batch = assetUrls.slice(i, i + 20);
          await Promise.allSettled(batch.map(url => cache.add(url)));
        }
        console.log(`[SW] Precached ${assetUrls.length} Vite chunks`);
      }
    } catch (e) {
      console.warn('[SW] Manifest precache failed (dev mode?):', e.message);
    }

    await self.skipWaiting();
  })());
});

// ── Activate: purge old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const KEEP = [STATIC_CACHE, DYNAMIC_CACHE, SECRET_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: offline-first strategy ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET: pass through (POST, etc.)
  if (request.method !== 'GET') return;

  // Cross-origin API calls: pass through
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googletagmanager') ||
      url.hostname.includes('analytics')) return;

  // Our own API endpoints: network-only (never cache)
  if (url.pathname.startsWith('/api/')) return;

  // ── Navigation (HTML pages) ─────────────────────────────────────────────
  // Strategy: Network-first, fall back to shell
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        // Offline: serve root shell so React Router can still render the page
        const cached = await caches.match(request) ||
                       await caches.match('/') ||
                       new Response('<html><body>Offline</body></html>',
                         { headers: { 'Content-Type': 'text/html' } });
        return cached;
      }
    })());
    return;
  }

  // ── Static assets (/assets/, fonts, icons, images) ─────────────────────
  // Strategy: Cache-first → network fallback → cache miss = graceful fail
  const isAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ico|mp4|wav|mp3)$/);

  if (isAsset || url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const res = await fetch(request);
        if (res.ok && isAsset) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        // Asset not cached and offline — return empty 404
        return new Response('', { status: 404 });
      }
    })());
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
    if ('setAppBadge' in self.registration) {
      (unread > 0
        ? self.registration.setAppBadge(unread)
        : self.registration.clearAppBadge()
      ).catch(() => {});
    }

    const existing   = await self.registration.getNotifications();
    const convNotifs = existing.filter(n => n.tag?.startsWith('conv-'));
    const prevNotif  = existing.find(n => n.tag === convTag);
    const prevCount  = prevNotif?.data?.msgCount || 0;
    const msgCount   = prevCount + 1;
    if (prevNotif) prevNotif.close();

    const sender  = data.title || 'New message';
    const msgBody = (data.body  || '').slice(0, 100) || '📎 Attachment';

    const convOptions = {
      body:      msgCount > 1 ? `${msgCount} messages · ${msgBody}` : msgBody,
      icon:      '/icon-192.png',
      badge:     '/badge-n.png',
      tag:       convTag,
      renotify:  true,
      silent:    msgCount > 1,
      vibrate:   msgCount === 1 ? [200, 100, 200] : [],
      timestamp: Date.now(),
      data: { url, conversationId: convId, workspaceId, channel, msgCount, unreadTotal: unread },
      actions: [
        { action: 'reply',   title: 'Reply', type: 'text', placeholder: 'Type a reply…' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    const otherConvNotifs = convNotifs.filter(n => n.tag !== convTag);
    if (otherConvNotifs.length >= 1 || unreadConvs > 1) {
      for (const n of existing) { if (n.tag !== 'nyasa-summary') n.close(); }
      const totalConvs = Math.max(otherConvNotifs.length + 1, unreadConvs);
      const totalMsgs  = unread;
      await self.registration.showNotification('Nyasadesk', {
        body:    `${totalMsgs} new message${totalMsgs !== 1 ? 's' : ''} from ${totalConvs} conversation${totalConvs !== 1 ? 's' : ''}`,
        icon:    '/icon-192.png',
        badge:   '/badge-n.png',
        tag:     'nyasa-summary',
        renotify: false,
        silent:  true,
        data:    { url: '/', isSummary: true, unreadTotal: unread },
        actions: [{ action: 'open', title: 'Open inbox' }],
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
      const secret = await getReplySecret();
      const res = await fetch(NOTIF_REPLY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, conversationId, workspaceId, channel: channel || 'whatsapp', text: replyText.trim() }),
      });

      if (res.ok) {
        await self.registration.showNotification('Message sent ✓', {
          body:    replyText.trim().slice(0, 80),
          icon:    '/icon-192.png',
          badge:   '/badge-n.png',
          tag:     `conv-${conversationId}`,
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
async function getReplySecret() {
  try {
    const cache = await caches.open(SECRET_CACHE);
    const resp  = await cache.match('notif-reply-secret');
    if (resp) return await resp.text();
  } catch { /**/ }
  return '';
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_REPLY_SECRET' && event.data.secret) {
    caches.open(SECRET_CACHE).then(cache => {
      cache.put('notif-reply-secret', new Response(event.data.secret));
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
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
  // Background sync for outbox is handled by the app via useOutboxSync hook
  // when the online event fires. SW sync is a belt-and-suspenders backup.
  if (event.tag === 'nyasa-outbox-sync') event.waitUntil(Promise.resolve());
});
