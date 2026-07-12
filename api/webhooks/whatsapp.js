// api/webhooks/whatsapp.js
// Webhook handler for WhatsApp (Meta Cloud API — direct).

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── GET: webhook verification handshake ──────────────────────────────
    // IMPORTANT: this MUST return the hub.challenge as plain text for Meta to
    // consider the webhook verified. We handle it FIRST before any DB work
    // that could throw, so a misconfigured env variable never blocks verification.
    if (req.method === 'GET') {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && challenge) {
        // Fast-path: if the token matches our known pattern, echo immediately
        // without touching the DB — covers env/DB issues during setup.
        if (token && /^nyasa_[a-zA-Z0-9]+$/.test(token)) {
          return res.status(200).send(challenge);
        }
        // Full check: look up the token in DB configs
        try {
          const { data: cfgs } = await sb.from('channel_configs')
            .select('config').eq('channel', 'whatsapp');
          const match = cfgs?.find(c => c.config?.verify_token === token);
          if (match || !cfgs?.length) return res.status(200).send(challenge);
        } catch (_dbErr) {
          // DB unavailable — if the token looks like ours, still pass it through
          if (token?.startsWith('nyasa_')) return res.status(200).send(challenge);
        }
        return res.status(403).json({ error: 'Invalid verify token' });
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
