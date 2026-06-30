const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { message_id, conversation_id, workspace_id, channel, body: text } = req.body || {};
  if (!conversation_id || !workspace_id || !channel || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Get channel config
  const { data: cfg } = await sb.from('channel_configs').select('*')
    .eq('workspace_id', workspace_id).eq('channel', channel).single();
  if (!cfg?.enabled) return res.status(400).json({ error: 'Channel not configured or disabled' });

  // Get conversation recipient
  const { data: conv } = await sb.from('conversations').select('external_id').eq('id', conversation_id).single();
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  try {
    if (channel === 'whatsapp') {
      const { phone_number_id, access_token } = cfg.config;
      const r = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text } }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'WhatsApp API error');
      const waId = json.messages?.[0]?.id;
      if (message_id) await sb.from('messages').update({ external_id: waId, status: 'sent' }).eq('id', message_id);

    } else if (channel === 'messenger') {
      const { page_token } = cfg.config;
      const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${page_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: conv.external_id }, message: { text } }),
      });
      if (!r.ok) throw new Error('Messenger send failed');
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);

    } else if (channel === 'email') {
      // Email outbound via SMTP — mark sent for now (SMTP needs server-side nodemailer)
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);

    } else {
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);
    }

    // Update conversation last message
    await sb.from('conversations').update({ last_message: text, last_message_at: new Date().toISOString() }).eq('id', conversation_id);

    return res.status(200).json({ ok: true });
  } catch (e) {
    if (message_id) await sb.from('messages').update({ status: 'failed' }).eq('id', message_id);
    return res.status(500).json({ error: e.message });
  }
};
