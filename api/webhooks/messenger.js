import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe') {
        const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'messenger');
        const match = cfgs?.find(c => c.config?.verify_token === token);
        if (match || !cfgs?.length) return res.status(200).send(challenge);
        return res.status(403).send('Forbidden');
      }
      return res.status(400).send('Bad Request');
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      for (const entry of payload.entry || []) {
        const pageId = entry.id;
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'messenger');
        const cfg = cfgs?.find(c => c.config?.page_id === pageId);
        if (!cfg) continue;
        const workspaceId = cfg.workspace_id;

        for (const event of entry.messaging || []) {
          if (!event.message) continue;
          const senderId = event.sender?.id;
          const msgId    = event.message?.mid;
          const body     = event.message?.text || '[attachment]';
          const ts       = new Date(event.timestamp || Date.now()).toISOString();

          const { data: contact } = await sb.from('contacts')
            .upsert({ workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
              full_name: `Messenger User ${senderId?.slice(-4)}`, lead_source: 'messenger' },
              { onConflict: 'workspace_id,channel,external_id' }).select('id').single();

          const { data: conv } = await sb.from('conversations')
            .upsert({ workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
              contact_id: contact?.id, status: 'open', subject: `Messenger: ${senderId?.slice(-6)}`,
              last_message: body, last_message_at: ts },
              { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count').single();

          if (conv?.id) {
            await sb.from('conversations').update({
              unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
            }).eq('id', conv.id);
            await sb.from('messages').upsert({
              conversation_id: conv.id, workspace_id: workspaceId,
              direction: 'inbound', body, channel: 'messenger',
              external_id: msgId, sender_id: senderId, status: 'delivered', created_at: ts,
            }, { onConflict: 'conversation_id,external_id' });
          }
        }
      }
      return res.status(200).send('OK');
    }
    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    console.error('Messenger webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
