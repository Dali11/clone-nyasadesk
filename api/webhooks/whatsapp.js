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
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const match = cfgs?.find(c => c.config?.verify_token === token);
      if (match || !cfgs?.length) return res.status(200).send(challenge);
      return res.status(403).send('Forbidden');
    }
    return res.status(400).send('Bad Request');
  }

  if (req.method === 'POST') {
    const payload = req.body || {};
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value   = change.value || {};
        const phoneId = value.metadata?.phone_number_id;
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        const cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
        if (!cfg) continue;
        const workspaceId = cfg.workspace_id;

        for (const msg of value.messages || []) {
          const from        = msg.from;
          const msgId       = msg.id;
          const contactName = value.contacts?.find(c => c.wa_id === from)?.profile?.name || from;
          const ts          = new Date(parseInt(msg.timestamp || Date.now()/1000) * 1000).toISOString();

          let body = msg.text?.body || `[${msg.type}]`;
          let attachments = null;
          const mediaKindMap = { image: 'image', video: 'video', audio: 'audio' };
          const mediaKind = mediaKindMap[msg.type];
          if (mediaKind && msg[msg.type]?.id) {
            try {
              const accessToken = cfg.config?.access_token;
              const mediaId = msg[msg.type].id;
              const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const metaJson = await metaRes.json();
              if (metaJson.url) {
                const fileRes = await fetch(metaJson.url, { headers: { Authorization: `Bearer ${accessToken}` } });
                const buf = await fileRes.arrayBuffer();
                const ext = (metaJson.mime_type || '').split('/')[1]?.split(';')[0] || 'bin';
                const path = `${workspaceId}/inbound/${Date.now()}-${mediaId}.${ext}`;
                await sb.storage.from('chat-media').upload(path, Buffer.from(buf), {
                  contentType: metaJson.mime_type || undefined, upsert: false,
                });
                const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
                attachments = [{ url: pub.publicUrl, type: mediaKind, mime: metaJson.mime_type }];
                body = msg[msg.type]?.caption || (mediaKind === 'image' ? '📷 Photo' : mediaKind === 'video' ? '🎥 Video' : '🎤 Voice message');
              }
            } catch (mediaErr) {
              console.error('WhatsApp media fetch error:', mediaErr);
            }
          }

          // Click-to-WhatsApp ads: Meta attaches a `referral` object to the FIRST
          // inbound message when the chat originated from an ad tap (source_type
          // 'ad', headline/body of the ad, and a ctwa_clid click id used to
          // correlate with Ads Manager). We do a first-touch capture: once a
          // contact is tagged whatsapp_ad with attribution, later ordinary
          // messages (which won't carry a referral) must NOT downgrade it back
          // to plain 'whatsapp' — hence the existing-row lookup below instead of
          // blindly overwriting lead_source/ad_attribution on every message.
          const { data: existingContact } = await sb.from('contacts')
            .select('lead_source, ad_attribution')
            .eq('workspace_id', workspaceId).eq('channel', 'whatsapp').eq('external_id', from)
            .maybeSingle();

          const adReferral = msg.referral || null;
          const leadSource = existingContact?.lead_source === 'whatsapp_ad'
            ? 'whatsapp_ad' : (adReferral ? 'whatsapp_ad' : 'whatsapp');
          let adAttribution = existingContact?.ad_attribution || null;
          if (adReferral && !adAttribution) {
            adAttribution = {
              source_type: adReferral.source_type || 'ad',
              source_id: adReferral.source_id || null,
              source_url: adReferral.source_url || null,
              headline: adReferral.headline || null,
              body: adReferral.body || null,
              media_type: adReferral.media_type || null,
              ctwa_clid: adReferral.ctwa_clid || null,
              captured_at: ts,
            };
          }

          const { data: contact } = await sb.from('contacts')
            .upsert({ workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
              full_name: contactName, phone: '+' + from, lead_source: leadSource,
              ...(adAttribution ? { ad_attribution: adAttribution } : {}) },
              { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

          const { data: conv } = await sb.from('conversations')
            .upsert({ workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
              contact_id: contact?.id, status: 'open', subject: contactName,
              last_message: body, last_message_at: ts },
              { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

          if (conv?.id) {
            await sb.from('conversations').update({
              unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
            }).eq('id', conv.id);
            await sb.from('messages').upsert({
              conversation_id: conv.id, workspace_id: workspaceId,
              direction: 'inbound', body, channel: 'whatsapp',
              external_id: msgId, sender_name: contactName, sender_id: from,
              status: 'delivered', created_at: ts,
              ...(attachments ? { attachments } : {}),
            }, { onConflict: 'conversation_id,external_id' });

            if (!conv.assigned_to) {
              await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'whatsapp', contact });
            }
          }
        }

        for (const status of value.statuses || []) {
          await sb.from('messages').update({ status: status.status })
            .eq('external_id', status.id).eq('workspace_id', workspaceId);
        }
      }
    }
    return res.status(200).send('OK');
  }
  return res.status(405).send('Method Not Allowed');

  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
