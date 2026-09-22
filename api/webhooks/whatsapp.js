// api/webhooks/whatsapp.js
// Webhook handler for WhatsApp (Meta Cloud API — direct).
//
// All inbound messages are persisted in Nyasadesk and processed by the
// AI agent, which determines intent from context and calls the appropriate
// tools (generate_login_link, register_student) as needed. No keyword-based
// interception is performed — the AI is the single point of intelligence.

import { createClient } from '../_lib/dbFactory.js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Default auth-forward URL (used when a workspace config has
// `auth_forward: true` but no explicit URL).  Set per-workspace via
// channel_configs.config.auth_forward_url to override.

// ─── Auth forwarding (LEGACY — disabled) ──────────────────────────────────────
// Previously, this webhook intercepted auth-keyword messages (login/register/
// reset) and forwarded the full Meta payload to an external wa-otp endpoint,
// suppressing the AI agent's auto-reply. This has been replaced by a better
// approach: ALL messages now flow through the AI agent, which determines
// intent from context and calls the generate_login_link / register_student
// tools as needed. The auth_forward_url field is no longer set in any
// channel_configs — but the per-workspace opt-in check below is kept as a
// safety net in case someone re-enables it (see standing instructions).
const DEFAULT_AUTH_FORWARD_URL = process.env.CHIBONDO_WA_OTP_URL || 'https://chibondoacademy.com/api/wa-otp';

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

    const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');

    // Match workspace by query param → phone_number_id → display_phone_number
    const phoneId    = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const displayPhone = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    let cfg = null;
    if (wsId)       cfg = cfgs?.find(c => c.workspace_id === wsId);
    if (!cfg)       cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
    if (!cfg)       cfg = cfgs?.find(c => c.config?.phone_number && c.config.phone_number === displayPhone);
    if (!cfg)       return res.status(200).send('OK');

    // ── Auth forwarding (LEGACY — see note above) ─────────────────────────
    // All messages now flow through the AI agent, which determines intent
    // and calls generate_login_link / register_student tools as needed.
    // This per-workspace opt-in check is kept as a safety net only.
    const authForwardUrl = cfg.config?.auth_forward_url
      || (cfg.config?.auth_forward ? DEFAULT_AUTH_FORWARD_URL : null);

    const providerKey = 'whatsapp:cloud';
    const provider    = getProvider(providerKey);

    await provider.handleInbound(payload, cfg.config, {
      sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      // skipAutoReply is no longer set — the AI agent handles everything.
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
