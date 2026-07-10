import webpush from 'web-push';

// Shared push-dispatch helper used by every inbound webhook (WhatsApp,
// Messenger, Instagram, Telegram, Email) right after a new message is
// inserted. Lives under _lib/ so it's NOT counted as its own serverless
// function against Vercel Hobby's 12-function cap.
//
// Notifies every team member of the workspace who has an active push
// subscription (own device that opted in) — mirrors how WhatsApp itself
// pushes to every logged-in device, not just "the assigned agent".
let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@nyasadesk.com';
  if (!pub || !priv) return; // not configured yet — no-op rather than throw
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export async function notifyNewMessage(sb, { ownerId, contactName, body, conversationId, channel }) {
  try {
    ensureConfigured();
    if (!configured) return;

    const { data: subs, error } = await sb
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('owner_id', ownerId);
    if (error || !subs?.length) return;

    // Total unread conversations for this workspace -- closest real
    // equivalent to WhatsApp's home-screen icon badge count. Native Android
    // apps can render a custom grouped notification summary ("N messages
    // from M chats"); the standard Web Notifications API used by every
    // website/PWA (including us) has no equivalent hook for that -- but the
    // Badging API (navigator.setAppBadge, called from the service worker)
    // DOES let us put a real number on the installed PWA's home-screen icon.
    let unreadTotal = 0;
    let unreadConvs = 0;
    try {
      const { count } = await sb
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ownerId)
        .gt('unread_count', 0);
      unreadTotal = count || 0;
      unreadConvs = count || 0;
    } catch { /* badge is best-effort, never block the actual notification */ }

    // Deep-link URL: open directly to this conversation
    const convUrl = conversationId ? `/?conv=${conversationId}` : '/';

    const payload = JSON.stringify({
      title: contactName || 'New message',
      body: (body || '').slice(0, 140) || '📎 Attachment',
      icon: '/icon-192.png',
      badge: '/badge-n.png',
      data: {
        url: convUrl,
        conversationId,
        channel,
        workspaceId: ownerId,   // needed by SW inline-reply handler
        unreadTotal,
        unreadConvs,
      },
    });

    await Promise.all(subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch (e) {
        // 410/404 = subscription is dead (browser unsubscribed / uninstalled) — clean it up.
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await sb.from('push_subscriptions').delete().eq('id', row.id);
        } else {
          console.error('[pushNotify] send failed:', e?.message || e);
        }
      }
    }));
  } catch (e) {
    console.error('[pushNotify] unexpected error:', e?.message || e);
  }
}
