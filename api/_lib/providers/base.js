// api/_lib/providers/base.js
import { notifyNewMessage } from '../pushNotify.js';
// Provider abstraction layer — defines the interface that all messaging
// providers implement. This keeps the rest of NyasaDesk (inbox, CRM,
// automations, AI, reporting) completely independent of the underlying
// channel provider (Meta Cloud API, 360dialog, Twilio, Telegram Bot API, etc.)

export class MessagingProvider {
  constructor() {
    if (this.constructor === MessagingProvider) {
      throw new Error('MessagingProvider is abstract — use a concrete implementation');
    }
  }

  get channelType() { throw new Error('Not implemented'); }
  get providerName() { throw new Error('Not implemented'); }

  async connect(workspaceId, authData, ctx) { throw new Error('Not implemented'); }
  async sendMessage(config, message, ctx) { throw new Error('Not implemented'); }
  async handleInbound(payload, config, ctx) { throw new Error('Not implemented'); }
  async verifyWebhook(req, configs) { throw new Error('Not implemented'); }
  async fetchMedia(mediaId, config, ctx) { throw new Error('Not implemented'); }
  async disconnect(config) { /* default: no-op, providers override */ }
}

// Shared helper: upsert contact + conversation + insert inbound message
export async function persistInboundMessage(sb, workspaceId, params) {
  const {
    channel, externalId, contactName, phone, email,
    body, attachments, externalMsgId, senderId, senderName,
    timestamp, leadSource, adAttribution,
  } = params;

  const { data: contact } = await sb.from('contacts')
    .upsert({
      workspace_id: workspaceId, channel, external_id: externalId,
      full_name: contactName,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(leadSource ? { lead_source: leadSource } : {}),
      ...(adAttribution ? { ad_attribution: adAttribution } : {}),
    }, { onConflict: 'workspace_id,channel,external_id' })
    .select('*').single();

  const { data: conv } = await sb.from('conversations')
    .upsert({
      workspace_id: workspaceId, channel, external_id: externalId,
      contact_id: contact?.id, status: 'open', subject: contactName,
      last_message: body, last_message_at: timestamp,
    }, { onConflict: 'workspace_id,channel,external_id' })
    .select('id,unread_count,assigned_to').single();

  if (conv?.id) {
    await sb.from('conversations').update({
      unread_count: (conv.unread_count || 0) + 1,
      last_message: body, last_message_at: timestamp,
    }).eq('id', conv.id);

    await sb.from('messages').upsert({
      conversation_id: conv.id, workspace_id: workspaceId,
      direction: 'inbound', body, channel,
      external_id: externalMsgId,
      sender_name: senderName || contactName,
      sender_id: senderId || externalId,
      status: 'delivered', created_at: timestamp,
      ...(attachments ? { attachments } : {}),
    }, { onConflict: 'conversation_id,external_id' });

    // IMPORTANT: must be awaited. On Vercel's serverless runtime, once the
    // webhook response is sent the function execution is frozen/torn down --
    // an un-awaited "fire and forget" call here gets silently killed before
    // it ever reaches FCM/APNs. notifyNewMessage() already swallows its own
    // errors internally, so awaiting it can't make this handler fail; it
    // just guarantees the push actually gets sent before we return.
    await notifyNewMessage(sb, { ownerId: workspaceId, contactName: contact?.full_name || contactName, body, conversationId: conv.id, channel });
  }

  return { contact, conversation: conv };
}
