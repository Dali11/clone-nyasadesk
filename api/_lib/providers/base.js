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
    timestamp, leadSource, adAttribution, avatarUrl,
    replyTo,  // optional { id, sender_name, body } — set when customer quoted a message
  } = params;

  const { data: contact } = await sb.from('contacts')
    .upsert({
      workspace_id: workspaceId, channel, external_id: externalId,
      full_name: contactName,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(leadSource ? { lead_source: leadSource } : {}),
      ...(adAttribution ? { ad_attribution: adAttribution } : {}),
      // Only set avatar_url when we actually have one this round — never
      // overwrite a previously-captured photo with null on a later message
      // that didn't carry one (mirrors the phone/email/leadSource pattern
      // above).
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    }, { onConflict: 'workspace_id,channel,external_id' })
    .select('*').single();

  // Check if a conversation already exists so we can handle re-open correctly:
  //  - Closed conv: re-open it AND preserve the previously assigned agent.
  //    The agent who closed it is the most context-aware person to continue.
  //    Only truly NEW convs should fall into unassigned/auto-assign flow.
  //  - Open/snoozed conv: just update last_message etc. (upsert as before).
  const { data: existingConv } = await sb.from('conversations')
    .select('id,unread_count,assigned_to,assigned_to_name,status')
    .eq('workspace_id', workspaceId).eq('channel', channel).eq('external_id', externalId)
    .maybeSingle();

  const upsertPayload = {
    workspace_id: workspaceId, channel, external_id: externalId,
    contact_id: contact?.id, subject: contactName,
    last_message: body, last_message_at: timestamp,
    // Always set status open — if was closed, re-open it
    status: 'open',
    // For a previously-closed (or existing) conv: preserve the assigned agent.
    // For a brand-new conv: assigned_to stays null (unassigned flow / auto-assign).
    ...(existingConv?.assigned_to ? {
      assigned_to: existingConv.assigned_to,
      assigned_to_name: existingConv.assigned_to_name,
    } : {}),
  };

  const { data: conv } = await sb.from('conversations')
    .upsert(upsertPayload, { onConflict: 'workspace_id,channel,external_id' })
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
      // Quoted/tagged message context — stored so the UI renders the reply preview
      ...(replyTo ? { reply_to: replyTo } : {}),
    }, { onConflict: 'conversation_id,external_id' });

    // IMPORTANT: must be awaited. On Vercel's serverless runtime, once the
    // webhook response is sent the function execution is frozen/torn down --
    // an un-awaited "fire and forget" call here gets silently killed before
    // it ever reaches FCM/APNs. notifyNewMessage() already swallows its own
    // errors internally, so awaiting it can't make this handler fail; it
    // just guarantees the push actually gets sent before we return.
    await notifyNewMessage(sb, { ownerId: workspaceId, contactName: contact?.full_name || contactName, body, conversationId: conv.id, channel });

    // AI Agents Phase 3b: auto-reply. Only fires while the conversation is
    // still unclaimed by a human (assigned_to IS NULL) -- the existing
    // auto_assign_on_reply() DB trigger sets assigned_to the moment a real
    // staff member sends a manual reply (sender_id = their uuid), which
    // doubles perfectly as the "human took over, stop auto-replying" signal.
    // No schema change needed. Dynamic imports here (not static) deliberately
    // avoid a circular import: providers/index.js imports this same base.js.
    // Must be awaited for the same Vercel-freezes-on-response reason as push
    // above; autoReplyIfEnabled swallows its own errors so this can't throw.
    if (!conv.assigned_to) {
      const { autoReplyIfEnabled } = await import('../aiAutoReply.js');
      await autoReplyIfEnabled(sb, { workspaceId, conversationId: conv.id, channel, externalId, contact });
    }
  }

  return { contact, conversation: conv };
}
