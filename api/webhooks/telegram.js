// api/webhooks/telegram.js
// Thin webhook handler — delegates to the Telegram provider.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).send('Missing workspace_id');

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs')
      .select('*').eq('workspace_id', workspaceId).eq('channel', 'telegram').single();
    if (!cfg?.enabled) return res.status(200).send('OK');

    const provider = getProvider('telegram');
    await provider.handleInbound(req.body || {}, cfg, {
      sb, workspaceId, applyAssignmentRules,
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
