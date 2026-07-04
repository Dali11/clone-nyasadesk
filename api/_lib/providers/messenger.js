// api/_lib/providers/messenger.js
// Facebook Messenger provider — implements MessagingProvider interface.

import { MessagingProvider, persistInboundMessage } from './base.js';

const GRAPH_VERSION = 'v19.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MessengerProvider extends MessagingProvider {
  get channelType() { return 'messenger'; }
  get providerName() { return 'Facebook Messenger'; }

  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { page_id, page_name, page_token, fb_user_name } = authData;

    if (!page_id || !page_token) throw new Error('Missing page_id or page_token');

    const config = {
      page_id, page_name, page_token,
      connected_via: authData.mode || 'oauth',
      fb_user_name: fb_user_name || null,
      connected_at: new Date().toISOString(),
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId, channel: 'messenger', enabled: true, config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data };
  }

  async sendMessage(config, message, ctx) {
    const { page_token } = config;
    const { to, text, media } = message;

    let messagePayload;
    if (media && ['image', 'video', 'audio'].includes(media.type)) {
      messagePayload = { attachment: { type: media.type, payload: { url: media.url, is_reusable: true } } };
    } else {
      messagePayload = { text };
    }

    const r = await fetch(`${GRAPH}/me/messages?access_token=${page_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: to }, message: messagePayload }),
    });
    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      throw new Error(json.error?.message || 'Messenger send failed');
    }
    return { ok: true };
  }

  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;

    for (const entry of payload.entry || []) {
      for (const messaging of entry.messaging || []) {
        const senderId = messaging.sender?.id;
        const recipientId = messaging.recipient?.id;
        const msgId = messaging.message?.mid;
        const ts = new Date(parseInt(messaging.timestamp || Date.now())).toISOString();

        if (!messaging.message) continue;

        let body = messaging.message.text || '[message]';
        let attachments = null;

        if (messaging.message.attachments) {
          const att = messaging.message.attachments[0];
          if (att?.type && ['image', 'video', 'audio', 'file'].includes(att.type)) {
            const mediaType = att.type === 'file' ? 'file' : att.type;
            attachments = [{ url: att.payload?.url, type: mediaType, mime: att.payload?.mime_type || null }];
            body = att.type === 'image' ? '📷 Photo' : att.type === 'video' ? '🎥 Video' :
                   att.type === 'audio' ? '🎤 Voice message' : '📎 File';
          }
        }

        const contactName = messaging.sender?.id || 'Messenger User';

        const { conversation: conv } = await persistInboundMessage(sb, workspaceId, {
          channel: 'messenger', externalId: senderId, contactName,
          body, attachments, externalMsgId: msgId, senderId, senderName: contactName,
          timestamp: ts,
        });

        if (conv?.id && !conv.assigned_to) {
          await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'messenger' });
        }
      }

      // Delivery/read status
      for (const messaging of entry.messaging || []) {
        if (messaging.delivery) {
          for (const mid of messaging.delivery.mids || []) {
            await sb.from('messages').update({ status: 'delivered' })
              .eq('external_id', mid).eq('workspace_id', workspaceId);
          }
        }
        if (messaging.read) {
          for (const mid of (messaging.read?.watermark ? [] : [])) {
            // Messenger read receipts use watermark, not individual mids
          }
          // Mark all messages before the watermark as read
          if (messaging.read?.watermark) {
            await sb.from('messages').update({ status: 'read' })
              .eq('workspace_id', workspaceId).eq('direction', 'outbound')
              .eq('channel', 'messenger')
              .lt('created_at', new Date(parseInt(messaging.read.watermark)).toISOString());
          }
        }
      }
    }
  }

  async verifyWebhook(req, configs) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
      const match = configs?.find(c => c.config?.verify_token === token);
      if (match || token === 'nyasadesk_verify') return { challenge };
    }
    return null;
  }

  async fetchMedia(mediaId, config, ctx) {
    // Messenger attachments come with direct CDN URLs — no re-hosting needed
    return null;
  }
}
