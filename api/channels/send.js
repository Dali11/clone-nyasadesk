import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Maps our internal media kind to the WhatsApp Cloud API message "type" field
const WA_TYPE = { image: 'image', video: 'video', audio: 'audio' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { message_id, conversation_id, workspace_id, channel, body: text, attachments } = req.body || {};
    if (!conversation_id || !workspace_id || !channel) {
      return res.status(400).json({ error: 'Missing fields: conversation_id, workspace_id, channel' });
    }
    const media = Array.isArray(attachments) && attachments.length ? attachments[0] : null;
    if (!text && !media) return res.status(400).json({ error: 'Message must have text or an attachment' });

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', channel).single();
    if (!cfg?.enabled) return res.status(400).json({ error: 'Channel not configured' });

    const { data: conv } = await sb.from('conversations').select('external_id').eq('id', conversation_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    if (channel === 'whatsapp') {
      const { phone_number_id, access_token } = cfg.config;
      let payload;
      if (media && WA_TYPE[media.type]) {
        const waType = WA_TYPE[media.type];
        payload = {
          messaging_product: 'whatsapp', to: conv.external_id, type: waType,
          [waType]: { link: media.url, ...(waType !== 'audio' && text ? { caption: text } : {}) },
        };
      } else {
        payload = { messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text } };
      }
      const r = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'WhatsApp API error');
      if (message_id) await sb.from('messages').update({ external_id: json.messages?.[0]?.id, status: 'sent' }).eq('id', message_id);

    } else if (channel === 'messenger') {
      const { page_token } = cfg.config;
      let messagePayload;
      if (media && ['image', 'video', 'audio'].includes(media.type)) {
        messagePayload = { attachment: { type: media.type, payload: { url: media.url, is_reusable: true } } };
      } else {
        messagePayload = { text };
      }
      const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${page_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: conv.external_id }, message: messagePayload }),
      });
      if (!r.ok) throw new Error('Messenger send failed');
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);

    } else if (channel === 'instagram') {
      const { ig_user_id, page_access_token } = cfg.config;
      let messagePayload;
      if (media && ['image', 'video', 'audio'].includes(media.type)) {
        messagePayload = { attachment: { type: media.type, payload: { url: media.url, is_reusable: true } } };
      } else {
        messagePayload = { text };
      }
      const r = await fetch(`https://graph.facebook.com/v19.0/${ig_user_id}/messages?access_token=${page_access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: conv.external_id }, message: messagePayload }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error?.message || 'Instagram send failed');
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);

    } else if (channel === 'telegram') {
      const { bot_token } = cfg.config;
      let tgMethod = 'sendMessage';
      let tgBody = { chat_id: conv.external_id, text };
      if (media?.type === 'image') { tgMethod = 'sendPhoto'; tgBody = { chat_id: conv.external_id, photo: media.url, ...(text ? { caption: text } : {}) }; }
      else if (media?.type === 'video') { tgMethod = 'sendVideo'; tgBody = { chat_id: conv.external_id, video: media.url, ...(text ? { caption: text } : {}) }; }
      else if (media?.type === 'audio') { tgMethod = 'sendVoice'; tgBody = { chat_id: conv.external_id, voice: media.url }; }
      const r = await fetch(`https://api.telegram.org/bot${bot_token}/${tgMethod}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgBody),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) throw new Error(json.description || 'Telegram send failed');
      if (message_id) await sb.from('messages').update({ external_id: String(json.result?.message_id || ''), status: 'sent' }).eq('id', message_id);

    } else {
      if (message_id) await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);
    }

    await sb.from('conversations').update({
      last_message: text || (media ? `[${media.type}]` : ''), last_message_at: new Date().toISOString()
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
