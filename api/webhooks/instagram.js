// api/webhooks/instagram.js
// Thin webhook handler — delegates to the Instagram provider.

import { createClient } from '../_lib/dbFactory.js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const provider = getProvider('instagram');

    if (req.method === 'GET') {
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'instagram');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'instagram');
      // Instagram webhooks don't include a clear workspace identifier in the payload
      // — process against all enabled Instagram configs (typically only one)
      for (const cfg of cfgs?.filter(c => c.enabled) || []) {
        await provider.handleInbound(payload, cfg, {
          sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
        });
      }
      return res.status(200).send('OK');
    }

    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    console.error('Instagram webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
