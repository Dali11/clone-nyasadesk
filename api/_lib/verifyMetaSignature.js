// ── Meta webhook signature verification (shared) ─────────────────────────────
// WhatsApp Cloud API, Instagram and Messenger webhooks are all signed by Meta
// with X-Hub-Signature-256: 'sha256=' + HMAC-SHA256(appSecret, rawPayload).
// SECURITY (2026-09-26 audit): none of the webhook routes verified this
// signature, so anyone could POST a forged "inbound message" to any
// workspace — poisoning inboxes, triggering AI auto-replies to arbitrary
// numbers at the business's expense, and driving push notifications.
//
// Fail-closed when FACEBOOK_APP_SECRET is configured; if the secret is
// missing we log loudly and reject (fail closed) so the misconfiguration is
// noticed instead of silently reopening the hole.

import crypto from 'crypto';

export function verifyMetaSignature(req, channelName = 'meta') {
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
  const sig = req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256'];

  if (!APP_SECRET) {
    console.error(`[${channelName}] FACEBOOK_APP_SECRET not set — rejecting webhook (fail closed)`);
    return false;
  }
  if (!sig || typeof sig !== 'string' || !sig.startsWith('sha256=')) return false;

  // Vercel exposes the parsed JSON body; re-serialize byte-stable.
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw, 'utf8').digest('hex');
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) console.warn(`[${channelName}] webhook signature mismatch — got ${sig}, expected ${expected}`);
    return ok;
  } catch {
    console.warn(`[${channelName}] webhook signature compare failed (length mismatch)`);
    return false;
  }
}
