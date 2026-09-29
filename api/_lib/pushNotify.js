import webpush from 'web-push';
import crypto from 'crypto';

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

// (2026-09-29) VAPID_PRIVATE_KEY must be the 32-byte P-256 scalar in base64url
// (web-push generate-vapid-keys output). Production had it as a base64'd
// PKCS8 certificate blob instead — setVapidDetails() threw on EVERY boot,
// and the silent early-return below disabled push with no log line. Accept
// every common format (raw scalar, PKCS8/SEC1 DER in base64, PEM, JWK, hex)
// and extract the scalar.
function extractVapidScalar(value) {
  if (!value) return null;
  const v = String(value).trim();
  try {
    if (v.startsWith('{')) {
      const d = JSON.parse(v)?.d;
      if (d) return Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    }
    const buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, ''), 'base64');
    if (buf.length === 32) return buf;
    if (/-----BEGIN/.test(v)) {
      const b64 = v.replace(/-----BEGIN[\s\S]*?-----/, '').replace(/-----END[\s\S]*?-----/, '').replace(/\s+/g, '');
      const der = Buffer.from(b64, 'base64');
      for (const type of ['pkcs8', 'sec1']) {
        try {
          const jwk = crypto.createPrivateKey({ key: der, format: 'der', type }).export({ format: 'jwk' });
          if (jwk?.d) return Buffer.from(jwk.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        } catch {}
      }
      return null;
    }
    for (const type of ['pkcs8', 'sec1']) {
      try {
        const jwk = crypto.createPrivateKey({ key: buf, format: 'der', type }).export({ format: 'jwk' });
        if (jwk?.d) return Buffer.from(jwk.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      } catch {}
    }
    if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  } catch { return null; }
  return null;
}

function ensureConfigured() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@nyasadesk.com';
  const scalar  = extractVapidScalar(process.env.VAPID_PRIVATE_KEY);
  if (!scalar || scalar.length !== 32) {
    console.error('[pushNotify] VAPID_PRIVATE_KEY missing or unparseable — push notifications DISABLED. Expected the base64url 32-byte scalar from `web-push generate-vapid-keys`.');
    return;
  }
  try {
    // Derive the PUBLIC half from the private scalar — the pair can never
    // mismatch. Production's VAPID_PUBLIC_KEY belongs to a DIFFERENT pair
    // than VAPID_PRIVATE_KEY; trusting it meant every push 403s even with a
    // valid scalar.
    const pkcs8 = crypto.createPrivateKey({
      key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), scalar]),
      format: 'der', type: 'pkcs8',
    });
    const spki = crypto.createPublicKey(pkcs8).export({ type: 'spki', format: 'der' });
    const pub = spki.subarray(spki.length - 65).toString('base64url');
    webpush.setVapidDetails(subject, pub, scalar.toString('base64url'));
  } catch (e) {
    console.error('[pushNotify] VAPID setup failed — push DISABLED:', e?.message || e);
    return;
  }
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
        if (e?.statusCode === 410 || e?.statusCode === 404 || e?.statusCode === 403) {
          // 403 = the subscription was created with a different VAPID key
          // (or is otherwise permanently rejected) — delete it; the frontend
          // auto-resubscribes with the current key on next app open.
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
