// api/webhooks/messenger.js
// Thin webhook handler — delegates to the Messenger provider.

import { createClient } from '../dbFactory.js';
import { getProvider } from '../providers/index.js';
import { applyAssignmentRules } from '../assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const provider = getProvider('messenger');

    if (req.method === 'GET') {
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'messenger');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const pageId = payload.entry?.[0]?.id;
      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'messenger');
      const cfg = cfgs?.find(c => c.config?.page_id === pageId);
      if (!cfg) return res.status(200).send('OK');

      await provider.handleInbound(payload, cfg, {
        sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      });

      return res.status(200).send('OK');
    }

    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    console.error('Messenger webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
