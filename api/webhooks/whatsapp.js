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
    if (req.method === 'GET') {
      const provider = getProvider('whatsapp:cloud');
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
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
