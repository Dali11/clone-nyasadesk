import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { workspace_id } = req.body || req.query || {};

    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    // Get website channel config (agent name, prefill, position, etc.)
    const { data: cfg } = await sb.from('channel_configs').select('config')
      .eq('workspace_id', workspace_id).eq('channel', 'website').maybeSingle();

    // Get WhatsApp channel config (phone number for the wa.me link)
    let wa_number = '';
    try {
      const { data: waConfig } = await sb.from('channel_configs').select('config')
        .eq('workspace_id', workspace_id).eq('channel', 'whatsapp').maybeSingle();
      wa_number = waConfig?.config?.phone_number || '';
    } catch (_) {}

    const config = cfg?.config || {};
    const prefill_message = config.prefill_message || config.greeting || "Hi! I found you on your website and would like to chat.";
    const agent_name = config.agent_name || 'Support Team';
    const label       = config.label || 'Chat with us';
    const position    = config.widget_position || 'bottom-right';

    return res.status(200).json({
      wa_number,
      prefill_message,
      greeting: prefill_message, // backward compat for old widgets
      label,
      agent_name,
      position,
    });
  } catch (err) {
    console.error('Widget config error:', err);
    return res.status(500).json({ error: err.message });
  }
}
