import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { message_id, conversation_id, workspace_id, channel, body: text } = req.body || {};
    if (!conversation_id || !workspace_id || !channel || !text) {
      return res.status(400).json({ error: 'Missing fields: conversation_id, workspace_id, channel, body' });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', channel).single();
    if (!cfg?.enabled) return res.status(400).json({ error: 'Channel not configured' });

    const { data: conv } = await sb.from('conversations').select('external_id').eq('id', conversation_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    if (channel === 'whatsapp') {
      const { phone_number_id, access_token } = cfg.config;
      const r = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text } }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'WhatsApp API error');
      if (message_id) await sb.from('messages').update({ external_id: json.messages?.[0]?.id, status: 'sent' }).eq('id', message_id);

    } else if (channel === 'messenger') {
      const { page_token } = cfg.config;
      const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${page_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: conv.external_id }, message: { text } }),
      });
      if (!r.ok) throw new Error('Messenger send failed');
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);
    } else {
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);
    }

    await sb.from('conversations').update({
      last_message: text, last_message_at: new Date().toISOString()
    }).eq('id', conversation_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    if (req.body?.message_id) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_KEY);
      await sb2.from('messages').update({ status: 'failed' }).eq('id', req.body.message_id);
    }
    return res.status(500).json({ error: err.message });
  }
}
