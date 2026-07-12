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
