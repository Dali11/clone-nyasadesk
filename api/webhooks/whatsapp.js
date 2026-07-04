// api/webhooks/whatsapp.js
// Thin webhook handler — delegates to the correct WhatsApp provider.
// Detects whether the workspace uses 360dialog (BSP) or direct Cloud API
// based on the stored config, and routes accordingly.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
      // Webhook verification handshake — works for both Cloud API and 360dialog
      const provider = getProvider('whatsapp');
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
    }

    if (req.method === 'POST') {
      const payload = req.body || {};

      // ── Find the matching workspace config ───────────────────────────
      // Strategy:
      //   1. If workspace_id is in the query string (360dialog webhook URL
      //      includes it), match directly.
      //   2. Otherwise, match by phone_number_id from the payload metadata
      //      (Cloud API style).
      const wsId = req.query.workspace_id;
      const phoneId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      const displayPhone = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');

      let cfg = null;
      if (wsId) {
        cfg = cfgs?.find(c => c.workspace_id === wsId);
      }
      if (!cfg) {
        // Match by phone_number_id (Cloud API configs store this)
        cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
      }
      if (!cfg) {
        // Match by display_phone_number (360dialog configs may only have this)
        cfg = cfgs?.find(c => c.config?.phone_number && c.config.phone_number === displayPhone);
      }
      if (!cfg) return res.status(200).send('OK'); // no matching workspace

      // ── Pick the right provider based on the config ───────────────────
      const providerKey = cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud';
      const provider = getProvider(providerKey);

      await provider.handleInbound(payload, cfg.config, {
        sb,
        workspaceId: cfg.workspace_id,
        applyAssignmentRules,
      });

      return res.status(200).send('OK');
    }

    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
