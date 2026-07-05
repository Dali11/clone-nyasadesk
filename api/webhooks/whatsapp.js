// api/webhooks/whatsapp.js
// Webhook handler — routes to the correct WhatsApp provider.
// Auto-detects WasapFlow vs Bird vs Meta Cloud API vs 360dialog based on
// payload shape and ?source= query param.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Baileys (Linked Devices) webhook handler ──────────────────────────────
async function handleBaileysWebhook(req, res, sb, workspaceId) {
  const payload = req.body || {};

  // Connection status update (not a message)
  if (payload.type === 'connection') {
    // Update channel_configs status
    if (payload.status === 'connected') {
      await sb.from('channel_configs').upsert({
        workspace_id: workspaceId,
        channel: 'whatsapp',
        enabled: true,
        config: { provider: 'baileys', connected_at: new Date().toISOString(), linked_device: true },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,channel' });
    }
    return res.status(200).send('OK');
  }

  // Message receipt (delivered/read)
  if (payload.type === 'receipt') {
    const statusMap = { sent: 'sent', delivered: 'delivered', read: 'read' };
    const status = statusMap[payload.status];
    if (status && payload.messageId) {
      await sb.from('messages').update({ status, updated_at: new Date().toISOString() })
        .eq('external_id', payload.messageId);
    }
    return res.status(200).send('OK');
  }

  // Incoming or outgoing message
  if (payload.type === 'message') {
    try {
      const phone = payload.from;
      if (!phone) return res.status(200).send('OK');

      // Format phone for contact (remove @s.whatsapp.net if present)
      const cleanPhone = phone.replace(/@.*$/, '');

      // 1. Find or create contact
      let { data: contact } = await sb.from('contacts')
        .select('id').eq('workspace_id', workspaceId).eq('phone', cleanPhone).maybeSingle();

      if (!contact) {
        const name = payload.senderName || cleanPhone;
        const { data: newContact } = await sb.from('contacts').insert({
          workspace_id: workspaceId,
          name,
          phone: cleanPhone,
          lead_source: 'whatsapp',
        }).select('id').single();
        contact = newContact;
      }

      // 2. Find or create conversation
      let { data: conv } = await sb.from('conversations')
        .select('id').eq('workspace_id', workspaceId)
        .eq('contact_id', contact.id).eq('channel', 'whatsapp').maybeSingle();

      if (!conv) {
        const { data: newConv } = await sb.from('conversations').insert({
          workspace_id: workspaceId,
          contact_id: contact.id,
          channel: 'whatsapp',
          external_id: payload.jid || cleanPhone,
          status: 'open',
          subject: 'WhatsApp chat',
        }).select('id').single();
        conv = newConv;
      }

      // 3. Handle media (upload to Supabase Storage if present)
      let attachments = null;
      if (payload.mediaBase64) {
        try {
          const buffer = Buffer.from(payload.mediaBase64, 'base64');
          const ext = payload.messageType === 'image' ? 'jpg'
            : payload.messageType === 'video' ? 'mp4'
            : payload.messageType === 'audio' ? 'ogg'
            : payload.mediaFilename?.split('.').pop() || 'bin';
          const fileName = `baileys/${workspaceId}/${Date.now()}.${ext}`;
          const { data: upload, error: uploadErr } = await sb.storage
            .from('chat-media').upload(fileName, buffer, {
              contentType: payload.mediaMimeType || 'application/octet-stream',
              upsert: false,
            });
          if (!uploadErr && upload) {
            const { data: urlData } = sb.storage.from('chat-media').getPublicUrl(fileName);
            attachments = [{
              type: payload.messageType,
              url: urlData?.publicUrl || upload.path,
              mime_type: payload.mediaMimeType,
              filename: payload.mediaFilename,
            }];
          }
        } catch (e) {
          console.error('[baileys] Media upload failed:', e.message);
        }
      }

      // 4. Save message
      // Skip if we already have this message (dedup by external_id)
      const { data: existing } = await sb.from('messages')
        .select('id').eq('external_id', payload.messageId).maybeSingle();
      if (existing) return res.status(200).send('OK');

      const direction = payload.fromMe ? 'outbound' : 'inbound';

      await sb.from('messages').insert({
        workspace_id: workspaceId,
        conversation_id: conv.id,
        contact_id: contact.id,
        channel: 'whatsapp',
        direction,
        body: payload.text || '',
        status: direction === 'outbound' ? 'sent' : 'delivered',
        external_id: payload.messageId,
        attachments,
        created_at: new Date((payload.timestamp || 0) * 1000).toISOString(),
      });

      // 5. Update conversation last_message_at
      await sb.from('conversations').update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', conv.id);

      // 6. Apply assignment rules for inbound messages
      if (direction === 'inbound') {
        try {
          const { data: rules } = await sb.from('rules')
            .select('*').eq('workspace_id', workspaceId).eq('is_active', true)
            .order('priority_order', { ascending: true });
          if (rules && rules.length > 0) {
            const { applyAssignmentRules } = await import('../_lib/assignRules.js');
            await applyAssignmentRules(sb, workspaceId, conv.id, {
              channel: 'whatsapp',
              lead_source: 'whatsapp',
              contact_id: contact.id,
            }, rules);
          }
        } catch (e) {
          console.error('[baileys] Assignment rules failed:', e.message);
        }
      }

      return res.status(200).send('OK');
    } catch (e) {
      console.error('[baileys] Message handler failed:', e.message, e.stack);
      return res.status(200).send('OK'); // Always return 200 to prevent retries
    }
  }

  return res.status(200).send('OK');
}

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── GET: webhook verification handshake ──────────────────────────────
    if (req.method === 'GET') {
      const source = req.query.source;
      // WasapFlow verification
      if (source === 'wasapflow') {
        const provider = getProvider('whatsapp:wasapflow');
        const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
        const result = await provider.verifyWebhook(req, cfgs);
        if (result) return res.status(200).send(result.challenge);
        return res.status(403).send('Forbidden');
      }
      // Meta Cloud API / 360dialog verification
      const provider = getProvider('whatsapp:cloud');
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const payload = req.body || {};
    const wsId = req.query.workspace_id;
    const source = req.query.source;

    // ── Baileys (Linked Devices) webhook ────────────────────────────────
    // Custom format from our Railway-hosted Baileys service.
    // Payload: { type: 'message'|'receipt'|'connection', ... }
    if (source === 'baileys') {
      return handleBaileysWebhook(req, res, sb, wsId);
    }

    // ── Detect payload format ────────────────────────────────────────────
    // WasapFlow: { event: 'message.received'|'message.status', waba_id, data: {...} }
    //   or source === 'wasapflow'
    // Bird: {service, event, payload: {id, channelId, sender, body, ...}}
    // Meta/360dialog: {object: "whatsapp_business_account", entry: [...]}

    const isWasapFlow = source === 'wasapflow'
      || payload.event === 'message.received'
      || payload.event === 'message.status'
      || payload.event === 'message.delivery';

    if (isWasapFlow) {
      // ── WasapFlow webhook ───────────────────────────────────────────────
      // Find workspace by waba_id in the payload, or by workspace_id query param
      let cfg = null;
      const wabaId = payload.waba_id;

      if (wsId) {
        const { data } = await sb.from('channel_configs').select('*')
          .eq('workspace_id', wsId).eq('channel', 'whatsapp').maybeSingle();
        cfg = data;
      }
      if (!cfg && wabaId) {
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        cfg = cfgs?.find(c => c.config?.waba_id === wabaId);
      }
      if (!cfg) {
        // Last resort: check all wasapflow configs
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        cfg = cfgs?.find(c => c.config?.provider === 'wasapflow');
      }
      if (!cfg) return res.status(200).send('OK');

      const provider = getProvider('whatsapp:wasapflow');
      await provider.handleInbound(payload, cfg.config, {
        sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      });
      return res.status(200).send('OK');
    }

    const isBird = source === 'bird'
      || payload.service === 'channels'
      || (payload.channelId && payload.sender && !payload.object)
      || (payload.payload?.channelId && payload.payload?.sender);

    if (isBird) {
      // ── Bird webhook ───────────────────────────────────────────────────
      let cfg = null;
      if (wsId) {
        const { data } = await sb.from('channel_configs').select('*')
          .eq('workspace_id', wsId).eq('channel', 'whatsapp').maybeSingle();
        cfg = data;
      }
      if (!cfg) {
        const channelId = payload.payload?.channelId || payload.channelId;
        if (channelId) {
          const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
          cfg = cfgs?.find(c => c.config?.bird_channel_id === channelId);
        }
      }
      if (!cfg) return res.status(200).send('OK');

      const provider = getProvider('whatsapp:bird');
      await provider.handleInbound(payload, cfg.config, {
        sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      });
      return res.status(200).send('OK');
    }

    // ── Meta / 360dialog webhook (original format) ───────────────────────
    const phoneId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const displayPhone = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');

    let cfg = null;
    if (wsId) {
      cfg = cfgs?.find(c => c.workspace_id === wsId);
    }
    if (!cfg) {
      cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
    }
    if (!cfg) {
      cfg = cfgs?.find(c => c.config?.phone_number && c.config.phone_number === displayPhone);
    }
    if (!cfg) return res.status(200).send('OK');

    // Pick the right provider based on the stored config
    const providerKey = cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
      : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud';
    const provider = getProvider(providerKey);

    await provider.handleInbound(payload, cfg.config, {
      sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
