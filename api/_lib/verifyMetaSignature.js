// ── Meta webhook signature verification (shared) ─────────────────────────────
// WhatsApp Cloud API, Instagram and Messenger webhooks are all signed by Meta
// with X-Hub-Signature-256: 'sha256=' + HMAC-SHA256(appSecret, rawPayload).
// SECURITY (2026-09-26 audit): none of the webhook routes verified this
// signature, so anyone could POST a forged "inbound message" to any
// workspace — poisoning inboxes, triggering AI auto-replies to arbitrary
// numbers at the business's expense, and driving push notifications.
//
// 2026-09-26 OUTAGE POSTMORTEM: this check shipped fail-closed while
// FACEBOOK_APP_SECRET was an EMPTY string on Vercel (it has been empty since
// the project migration — the real secret lives only in the Meta App
// dashboard and was never provided). Fail-closed + empty secret = every
// real Meta webhook rejected for ~24h: ALL inbound WhatsApp/Instagram/
// Messenger messages silently stopped arriving.
//
// Current behavior:
//   - Secret configured + signature present and valid  -> accept
//   - Secret configured + signature missing/mismatch   -> REJECT (fail closed)
//   - Secret NOT configured                            -> accept + loud warn
//     (fail-open: without the secret the payload cannot be verified at all;
//      rejecting everything is an outage, not security. The warn makes the
//      gap visible in logs. Set FACEBOOK_APP_SECRET to close the gap.)

import crypto from 'crypto';

let warnedNoSecret = false;

export function verifyMetaSignature(req, channelName = 'meta') {
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
  const sig = req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256'];

  if (!APP_SECRET) {
    if (!warnedNoSecret) {
      console.error(`[${channelName}] FACEBOOK_APP_SECRET not set — Meta webhooks are being accepted WITHOUT signature verification. Set the app secret (Meta App dashboard → App settings → Basic) to enable verification.`);
      warnedNoSecret = true;
    }
    return true;
  }
  if (!sig || typeof sig !== 'string' || !sig.startsWith('sha256=')) return false;

  // Vercel exposes the parsed JSON body; re-serialize byte-stable.
  // Prefer the exact raw request bytes when available (self-hosted server.js
  // attaches req.rawBody). Meta signs the RAW payload byte-for-byte; re-serializing
  // the parsed JSON is not byte-stable against Meta's wire format (key escaping,
  // unicode) and caused valid deliveries to be rejected. Fall back to the
  // re-serialization only on platforms that give us just the parsed body.
  const raw = (typeof req.rawBody === 'string' && req.rawBody.length)
    ? req.rawBody
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
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
