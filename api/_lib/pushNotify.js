import webpush from 'web-push';

// Shared push-dispatch helper — called from persistInboundMessage() in base.js
// after every inbound message on every channel.
//
// WhatsApp-style behaviour:
//  - One notification per conversation, tagged conv-<id>
//  - Title  = contact name
//  - Body   = the actual message text (not a count prefix)
//  - Icon   = contact avatar (if stored) or app icon
//  - Sound + vibration on every message — never silent
//  - App badge = total unread conversations
//  - Inline Reply action on every notification

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub     = process.env.VAPID_PUBLIC_KEY;
  const priv    = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@nyasadesk.com';
  if (!pub || !priv) return;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export async function notifyNewMessage(sb, {
  ownerId, contactName, body, conversationId, channel,
  contactPhone, contactAvatar,
}) {
  try {
    ensureConfigured();
    if (!configured) return;

    // All agents/members of this workspace who have opted in
    const { data: subs, error } = await sb
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('owner_id', ownerId);
    if (error || !subs?.length) return;

    // Badge count = unread conversations (like WhatsApp home-screen badge)
    let unreadConvs = 0;
    let unreadTotal = 0;
    try {
      const { data: unreadRows } = await sb
        .from('conversations')
        .select('unread_count')
        .eq('workspace_id', ownerId)
        .gt('unread_count', 0);
      unreadConvs = unreadRows?.length || 0;
      unreadTotal = unreadRows?.reduce((sum, c) => sum + (c.unread_count || 0), 0) || 0;
    } catch { /* badge is best-effort */ }

    // Resolve sender icon: prefer stored contact avatar, fall back to app icon
    const senderIcon = contactAvatar || '/icon-192.png';

    // Deep link directly into this conversation
    const convUrl = conversationId ? `/inbox?conv=${conversationId}` : '/inbox';

    // Format body exactly like WhatsApp:
    //   text messages  → the message text (truncated at 200 chars)
    //   attachments    → emoji prefix ("📷 Photo", "🎵 Audio", etc.) — set upstream
    const notifBody = (body || '').slice(0, 200) || '📎 Attachment';

    const payload = JSON.stringify({
      // Title = contact name, sub = channel hint (optional)
      title: contactName || 'New message',
      body:  notifBody,
      data: {
        url:            convUrl,
        conversationId,
        channel,
        workspaceId:    ownerId,
        contactPhone:   contactPhone || '',
        contactAvatar:  senderIcon,
        unreadConvs,
        unreadTotal,
      },
    });

    // Filter out known dead endpoint patterns before attempting delivery
    const isDeadEndpoint = (ep) => !ep || ep.includes('fcm.googleapis.com/fcm/send/');

    await Promise.all(subs.map(async (row) => {
      const endpoint = row.subscription?.endpoint || '';
      if (isDeadEndpoint(endpoint)) {
        // Auto-clean legacy FCM endpoints — they never deliver but return 200
        await sb.from('push_subscriptions').delete().eq('id', row.id);
        return;
      }
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch (e) {
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
