// api/_lib/providers/instagram.js
// Instagram Messaging provider — uses Meta Graph API (same shape as Messenger
// but keyed by Instagram Business Account ID instead of Page ID).

import { MessagingProvider, persistInboundMessage } from './base.js';

const GRAPH_VERSION = 'v19.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class InstagramProvider extends MessagingProvider {
  get channelType() { return 'instagram'; }
  get providerName() { return 'Instagram Messaging'; }

  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { ig_user_id, page_access_token, verify_token } = authData;

    if (!ig_user_id || !page_access_token) throw new Error('Missing ig_user_id or page_access_token');

    const config = {
      ig_user_id, page_access_token,
      verify_token: verify_token || `nyasa_ig_${workspaceId.slice(-8)}`,
      connected_via: 'manual',
      connected_at: new Date().toISOString(),
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId, channel: 'instagram', enabled: true, config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data };
  }

  async sendMessage(config, message, ctx) {
    const { ig_user_id, page_access_token } = config;
    const { to, text, media } = message;

    let messagePayload;
    if (media && ['image', 'video', 'audio'].includes(media.type)) {
      messagePayload = { attachment: { type: media.type, payload: { url: media.url, is_reusable: true } } };
    } else {
      messagePayload = { text };
    }

    const r = await fetch(`${GRAPH}/${ig_user_id}/messages?access_token=${page_access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: to }, message: messagePayload }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error?.message || 'Instagram send failed');
    return { ok: true };
  }

  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;

    for (const entry of payload.entry || []) {
      for (const messaging of entry.messaging || []) {
        const senderId = messaging.sender?.id;
        const msgId = messaging.message?.mid;
        const ts = new Date(parseInt(messaging.timestamp || Date.now())).toISOString();

        if (!messaging.message) continue;

        let body = messaging.message.text || '[message]';
        let attachments = null;

        if (messaging.message.attachments) {
          const att = messaging.message.attachments[0];
          if (att?.type && ['image', 'video', 'audio', 'file'].includes(att.type)) {
            attachments = [{ url: att.payload?.url, type: att.type, mime: null }];
            body = att.type === 'image' ? '📷 Photo' : att.type === 'video' ? '🎥 Video' :
                   att.type === 'audio' ? '🎤 Voice message' : '📎 File';
          }
        }

        const contactName = messaging.sender?.id || 'Instagram User';

        const { conversation: conv } = await persistInboundMessage(sb, workspaceId, {
          channel: 'instagram', externalId: senderId, contactName,
          body, attachments, externalMsgId: msgId, senderId, senderName: contactName,
          timestamp: ts, leadSource: 'instagram',
        });

        if (conv?.id && !conv.assigned_to) {
          await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'instagram' });
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
    // Instagram attachments come with CDN URLs — no re-hosting needed
    return null;
  }
}
