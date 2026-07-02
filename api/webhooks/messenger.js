import { createClient } from '@supabase/supabase-js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

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
          const senderId = event.sender?.id;

          // Delivery receipt — Meta gives us the specific message ids delivered
          if (event.delivery) {
            const mids = event.delivery.mids || [];
            if (mids.length) {
              await sb.from('messages').update({ status: 'delivered' })
                .in('external_id', mids).eq('workspace_id', workspaceId).neq('status', 'read');
            }
            continue;
          }

          // Read receipt — Meta gives a watermark; everything we sent up to that
          // timestamp in this conversation has been read
          if (event.read) {
            const watermarkTs = new Date(event.read.watermark).toISOString();
            const { data: conv } = await sb.from('conversations')
              .select('id').eq('workspace_id', workspaceId).eq('channel', 'messenger')
              .eq('external_id', senderId).maybeSingle();
            if (conv?.id) {
              await sb.from('messages').update({ status: 'read' })
                .eq('conversation_id', conv.id).eq('direction', 'outbound')
                .lte('created_at', watermarkTs);
            }
            continue;
          }

          if (!event.message) continue;
          const msgId    = event.message?.mid;
          const ts       = new Date(event.timestamp || Date.now()).toISOString();

          // Messenger attachments arrive with a direct Meta CDN URL — no need to
          // re-fetch/re-host like WhatsApp (whose media URLs require an access token).
          const metaAttachment = event.message?.attachments?.[0];
          const attachTypeMap = { image: 'image', video: 'video', audio: 'audio' };
          let body = event.message?.text || '[attachment]';
          let attachments = null;
          if (metaAttachment && attachTypeMap[metaAttachment.type] && metaAttachment.payload?.url) {
            attachments = [{ url: metaAttachment.payload.url, type: attachTypeMap[metaAttachment.type] }];
            body = metaAttachment.type === 'image' ? '📷 Photo' : metaAttachment.type === 'video' ? '🎥 Video' : '🎤 Voice message';
          }

          const { data: contact } = await sb.from('contacts')
            .upsert({ workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
              full_name: `Messenger User ${senderId?.slice(-4)}`, lead_source: 'messenger' },
              { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

          const { data: conv } = await sb.from('conversations')
            .upsert({ workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
              contact_id: contact?.id, status: 'open', subject: `Messenger: ${senderId?.slice(-6)}`,
              last_message: body, last_message_at: ts },
              { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

          if (conv?.id) {
            await sb.from('conversations').update({
              unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
            }).eq('id', conv.id);
            await sb.from('messages').upsert({
              conversation_id: conv.id, workspace_id: workspaceId,
              direction: 'inbound', body, channel: 'messenger',
              external_id: msgId, sender_id: senderId, status: 'delivered', created_at: ts,
              ...(attachments ? { attachments } : {}),
            }, { onConflict: 'conversation_id,external_id' });

            if (!conv.assigned_to) {
              await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'messenger', contact });
            }
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
