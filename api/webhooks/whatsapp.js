// api/webhooks/whatsapp.js
// Webhook handler for WhatsApp (Meta Cloud API — direct).
//
// Also intercepts auth messages (login/register/reset) and forwards them
// to Chibondo Academy's wa-otp endpoint so students get magic-link
// replies from the same WhatsApp number.  The message is still persisted
// in Nyasadesk so agents can see the student initiated an auth request.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Chibondo Academy auth webhook — forwarded auth messages go here.
const CHIBONDO_WA_OTP_URL = process.env.CHIBONDO_WA_OTP_URL || 'https://chibondoacademy.com/api/wa-otp';

// ─── Auth message detection ─────────────────────────────────────────────────
// Keywords that Chibondo Academy's wa-otp webhook treats as auth requests.
// Must stay in sync with the isLogin/isRegister/isReset logic in wa-otp.js.
const AUTH_KEYWORDS = [
  'login', 'verify', 'hi', 'hello', 'start',  // login
  'register',                                  // registration
  'reset', 'forgot',                           // password reset
];

function isAuthMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return AUTH_KEYWORDS.some(kw => lower.startsWith(kw) || lower.includes(kw));
}

// Check if any message in the Meta webhook payload is an auth message.
function payloadHasAuthMessage(payload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const msg of change.value?.messages || []) {
        const text = msg.text?.body || '';
        if (isAuthMessage(text)) return true;
      }
    }
  }
  return false;
}

// Forward the full Meta webhook payload to Chibondo Academy's wa-otp.
// The wa-otp handler will generate a magic link and reply to the user
// directly via WhatsApp (same number, same chat).
async function forwardAuthToChibondo(payload) {
  try {
    const res = await fetch(CHIBONDO_WA_OTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log('[webhook/whatsapp] Auth message forwarded to Chibondo Academy');
    } else {
      console.error('[webhook/whatsapp] Chibondo forward returned', res.status);
    }
  } catch (err) {
    console.error('[webhook/whatsapp] Forward to Chibondo failed:', err.message);
  }
}

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── GET: webhook verification handshake ──────────────────────────────
    // Meta sends: hub.mode=subscribe, hub.verify_token, hub.challenge
    // We must echo hub.challenge as plain text — nothing else.
    // We do the DB lookup in a try/catch so a missing env var or DB hiccup
    // never blocks verification.
    if (req.method === 'GET') {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && challenge) {
        // Try DB lookup first — match any stored verify_token
        try {
          const { data: cfgs } = await sb.from('channel_configs')
            .select('config').eq('channel', 'whatsapp');
          if (cfgs?.length) {
            const match = cfgs.find(c => c.config?.verify_token === token);
            if (match) return res.status(200).send(challenge);
          } else {
            // No configs yet — accept any token (fresh setup)
            return res.status(200).send(challenge);
          }
        } catch (_dbErr) {
          // DB unreachable — fall through to pattern check
        }
        // Pattern fallbacks — accept any nyasa* token variant
        if (token && /^nyasa/i.test(token)) return res.status(200).send(challenge);
        return res.status(403).json({ error: 'Verify token not recognised' });
      }
      return res.status(400).json({ error: 'Missing hub.mode or hub.challenge' });
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const payload = req.body || {};
    const wsId    = req.query.workspace_id;

    // ── Intercept auth messages for Chibondo Academy ──────────────────────
    // If any message in this payload looks like a login/register/reset
    // request, forward the FULL payload to Chibondo's wa-otp endpoint.
    // The wa-otp handler will reply to the student directly via WhatsApp.
    // We do this before (and independently of) the normal Nyasadesk
    // processing so the message is also saved as a conversation.
    if (payloadHasAuthMessage(payload)) {
      // Fire-and-forget — don't block the webhook response
      forwardAuthToChibondo(payload);
    }

    const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');

    // Match workspace by query param → phone_number_id → display_phone_number
    const phoneId    = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const displayPhone = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    let cfg = null;
    if (wsId)       cfg = cfgs?.find(c => c.workspace_id === wsId);
    if (!cfg)       cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
    if (!cfg)       cfg = cfgs?.find(c => c.config?.phone_number && c.config.phone_number === displayPhone);
    if (!cfg)       return res.status(200).send('OK');

    const providerKey = 'whatsapp:cloud';
    const provider    = getProvider(providerKey);

    await provider.handleInbound(payload, cfg.config, {
      sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
