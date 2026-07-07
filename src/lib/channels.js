// channels.js — Supabase-backed channel configs + conversation/message helpers
import { supabase } from '@/lib/supabase';
import { applyAssignmentRules } from '../../api/_lib/assignRules.js';

// ── Channel Configs ──────────────────────────────────────────────────────────

export async function getChannelConfigs(workspaceId) {
  const { data, error } = await supabase
    .from('channel_configs')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return data || [];
}

export async function saveChannelConfig(workspaceId, channel, config, enabled = true) {
  const { data, error } = await supabase
    .from('channel_configs')
    .upsert(
      { workspace_id: workspaceId, channel, config, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,channel', returning: 'representation' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChannelConfig(workspaceId, channel) {
  const { error } = await supabase
    .from('channel_configs')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('channel', channel);
  if (error) throw error;
}

// ── Conversations ────────────────────────────────────────────────────────────

// Normalizes a raw Supabase row (with nested `contact:contacts(...)`) into the
// flat shape the UI components (ConvRow, ChatHeader, ContactPanel) expect.
// Keeping this in one place means every consumer sees consistent field names.
function normalizeConversation(row) {
  if (!row) return row;
  const c = row.contact || {};
  return {
    ...row,
    contact_name: c.full_name || 'Unknown Contact',
    contact_email: c.email || null,
    contact_phone: c.phone || null,
    contact_company: c.company || null,
    contact_avatar_url: c.avatar_url || null,
    last_message_preview: row.last_message || '',
    unread: (row.unread_count || 0) > 0,
  };
}

export async function getConversations(workspaceId, filters = {}) {
  let q = supabase
    .from('conversations')
    .select('*, contact:contacts(id,full_name,phone,email,company,avatar_url,deal_stage,tags,notes)')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'open')       q = q.in('status', ['open','unassigned']);
    else if (filters.status === 'unassigned') q = q.is('assigned_to', null).eq('status', 'open');
    else q = q.eq('status', filters.status);
  }
  if (filters.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeConversation);
}

export async function deleteConversation(id) {
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw error;
}

// Whitelist of real conversations columns — prevents UI-only/normalized
// fields (contact, unread, contact_name, contact_email, last_message_preview,
// etc.) from being sent to Supabase, which would reject the whole update
// and silently break manual assignment / deal-stage / tag / snooze saves.
const CONVERSATION_COLUMNS = new Set([
  'workspace_id','contact_id','channel','external_id','status','priority',
  'assigned_to','assigned_to_name','subject','last_message','last_message_at',
  'unread_count','sla_breach_at','deal_stage','tags','updated_at',
  'is_reminder_active','reminder_at','last_read_at',
]);

export async function updateConversation(id, updates) {
  const clean = {};
  for (const [k, v] of Object.entries(updates)) {
    if (CONVERSATION_COLUMNS.has(k)) clean[k] = v;
  }
  const { data, error } = await supabase
    .from('conversations')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, contact:contacts(id,full_name,phone,email,company,avatar_url,deal_stage,tags,notes)')
    .single();
  if (error) throw error;
  return normalizeConversation(data);
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function getContacts(workspaceId) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createContact(workspaceId, data) {
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({ workspace_id: workspaceId, channel: data.channel || 'manual', ...data })
    .select()
    .single();
  if (error) throw error;
  return contact;
}

export async function updateContact(contactId, updates) {
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(contactId) {
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) throw error;
}

// ── Messages ─────────────────────────────────────────────────────────────────

// Soft-delete — keeps the row (so pin history / ordering stays sane and a
// "This message was deleted" placeholder can render) but wipes the actual
// content, matching WhatsApp's real delete-for-everyone behavior.
export async function deleteMessage(messageId) {
  const { error } = await supabase.from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null, attachments: null })
    .eq('id', messageId);
  if (error) throw error;
}

export async function setMessagePinned(messageId, pinned) {
  const { error } = await supabase.from('messages').update({ pinned }).eq('id', messageId);
  if (error) throw error;
}

export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Uploads a File/Blob to the public 'chat-media' storage bucket and returns its
// public URL. Used for images, videos, and recorded voice notes.
export async function uploadChatMedia(workspaceId, file, kind) {
  const ext = (file.name?.split('.').pop() || (kind === 'audio' ? 'webm' : 'bin')).toLowerCase();
  const path = `${workspaceId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  return data.publicUrl;
}

// Sends a media message (image/video/audio/voice note). Uploads the file to
// storage first, then goes through the exact same sendMessage() pipeline so
// status handling / realtime / dedupe logic is identical to text messages.
export async function sendMediaMessage(workspaceId, conversationId, file, kind, senderName, caption = '', senderId = null, replyTo = null) {
  const url = await uploadChatMedia(workspaceId, file, kind);
  const attachments = [{ url, type: kind, mime: file.type, name: file.name || null }];
  const placeholderBody = caption || (kind === 'image' ? '📷 Photo' : kind === 'video' ? '🎥 Video' : '🎤 Voice message');
  return sendMessage(workspaceId, conversationId, placeholderBody, senderName, attachments, senderId, replyTo);
}

// Internal notes are NEVER dispatched to the external channel — just saved
// as a real message row (direction: 'note') so they persist across refreshes
// and sync live to every other team member viewing the conversation via the
// same realtime subscription used for normal messages. (Previously these
// were built as local-only React state in MessageThread.jsx and vanished on
// refresh — turns out the messages table's CHECK constraint only allowed
// 'inbound'/'outbound' anyway, so a real insert would have failed silently.)
export async function addNote(workspaceId, conversationId, body, senderName, senderId = null, replyTo = null) {
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: 'note',
      body,
      sender_name: senderName,
      sender_id: senderId,
      ...(replyTo ? { reply_to: replyTo } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return msg;
}

export async function sendMessage(workspaceId, conversationId, body, senderName, attachments = null, senderId = null, replyTo = null) {
  // 1. Insert message record — return as soon as this lands so the caller can
  // reconcile its optimistic bubble immediately. Everything below (steps 2 & 3)
  // used to be awaited before returning, which left a multi-hundred-ms window
  // where the realtime INSERT event for this same row could reach the client
  // and get appended as a second, duplicate bubble before the temp bubble was
  // reconciled. Returning early shrinks that window to near-zero.
  //
  // senderId (the replying agent's user id) is what powers auto-assignment:
  // a DB trigger (auto_assign_on_reply) claims any still-unassigned
  // conversation for whoever's id shows up here on the first real reply.
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: 'outbound',
      body,
      sender_name: senderName,
      sender_id: senderId,
      status: 'sending',
      ...(attachments ? { attachments } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    })
    .select()
    .single();
  if (error) throw error;

  // 2 & 3 run in the background — NOT awaited before returning.
  //
  // Status semantics (matches WhatsApp): 'sending' (optimistic, local only) ->
  // 'sent' (server/API accepted it — set by /api/channels/send itself once the
  // Graph API call succeeds) -> 'delivered' -> 'read' (both set later by the
  // WhatsApp/Messenger webhook handlers when Meta sends real delivery/read
  // receipts). This function must NOT stomp status to 'delivered' itself on a
  // successful fetch — that would fake a receipt we don't actually have yet.
  // It only ever forces 'failed', and only when the request truly never
  // reached the server (network/fetch-level failure) or the server reported
  // an error — send.js already marks 'failed' server-side on API errors, but
  // we back it up here in case the response itself was lost.
  (async () => {
    try {
      // Update conversation preview
      await supabase.from('conversations').update({
        last_message: body,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId);

      // Dispatch via edge function
      const { data: conv } = await supabase.from('conversations').select('channel,external_id,workspace_id').eq('id', conversationId).single();
      const res = await fetch('/api/channels?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: msg.id, conversation_id: conversationId, workspace_id: workspaceId,
          channel: conv.channel, body, attachments,
        }),
      });
      if (!res.ok) {
        await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
      }
      // On success: leave status alone. send.js already set it to 'sent' server-side.
    } catch (e) {
      await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
    }
  })();

  return msg;
}

// ── Realtime subscriptions ───────────────────────────────────────────────────

export function subscribeToConversations(workspaceId, callback) {
  return supabase
    .channel('conversations:' + workspaceId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conversations',
      filter: `workspace_id=eq.${workspaceId}`,
    }, callback)
    .subscribe();
}

export function subscribeToMessages(conversationId, callback) {
  return supabase
    .channel('messages:' + conversationId)
    .on('postgres_changes', {
      // '*' (not just INSERT) — a message's status flips from 'sending' to
      // 'delivered'/'failed' via a later UPDATE once dispatch completes, and
      // the UI needs that event too or the spinner never clears.
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, callback)
    .subscribe();
}

// ── Broadcasts ───────────────────────────────────────────────────────────────

export async function getBroadcasts(workspaceId) {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createBroadcast(workspaceId, { name, channel, message, audience, template_name, template_language }) {
  const { data, error } = await supabase
    .from('broadcasts')
    .insert({
      workspace_id: workspaceId, name, channel, message, audience, status: 'draft',
      ...(template_name ? { template_name, template_language: template_language || 'en_US' } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Fetch Meta-approved WhatsApp templates for this workspace (empty array for
// any other channel, or if WhatsApp isn't connected yet).
export async function getWhatsAppTemplates(workspaceId) {
  const res = await fetch(`/api/channels?action=templates&workspace_id=${encodeURIComponent(workspaceId)}`);
  const data = await res.json();
  return data.templates || [];
}

export async function deleteBroadcast(id) {
  const { error } = await supabase.from('broadcasts').delete().eq('id', id);
  if (error) throw error;
}

// Actually sends the broadcast: for each contact in the audience, find (or
// create) a conversation on the broadcast's channel and insert a real
// outbound message via sendMessage() — same dispatch pipeline a normal reply
// uses, so delivery status (delivered/failed) is genuine, not simulated.
export async function sendBroadcast(workspaceId, broadcastId) {
  const { data: bc, error: bcErr } = await supabase.from('broadcasts').select('*').eq('id', broadcastId).single();
  if (bcErr) throw bcErr;

  const contactIds = bc.audience || [];
  let sentCount = 0;
  let failedCount = 0;

  // WhatsApp broadcasts to contacts outside the 24h customer-service window
  // MUST use a Meta-approved template — free text is rejected by the Graph
  // API in that case. If this broadcast was composed with a template
  // selected, every send goes out as that template (Meta still delivers it
  // fine to contacts who ARE in-window). Free text is only safe when every
  // recipient messaged recently, which the UI now warns about explicitly.
  const usesTemplate = bc.channel === 'whatsapp' && !!bc.template_name;

  await Promise.all(contactIds.map(async (contactId) => {
    try {
      const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();
      if (!contact) { failedCount += 1; return; }

      const personalizedBody = (bc.message || '').replace(/\{\{\s*name\s*\}\}/gi, contact.full_name || 'there');

      // Find an existing conversation with this contact on this channel, else create one
      let { data: conv } = await supabase
        .from('conversations')
        .select('id, external_id')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .eq('channel', bc.channel)
        .maybeSingle();

      if (!conv) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({
            workspace_id: workspaceId, contact_id: contactId, channel: bc.channel,
            status: 'open', last_message: personalizedBody, last_message_at: new Date().toISOString(),
            external_id: contact.phone || contact.email || null,
          })
          .select('id, external_id')
          .single();
        if (convErr) throw convErr;
        conv = newConv;
      }

      // Insert the message row first (so it shows in the thread + gets a
      // real id to track status against), then dispatch synchronously and
      // WAIT for the real result -- unlike the optimistic single-message
      // send path, a broadcast's reported counts must reflect what Meta
      // actually accepted, not just what got queued locally.
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .insert({
          workspace_id: workspaceId, conversation_id: conv.id, direction: 'outbound',
          body: personalizedBody, sender_name: 'Broadcast', status: 'sending',
        })
        .select()
        .single();
      if (msgErr) throw msgErr;

      const res = await fetch('/api/channels?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: msg.id, conversation_id: conv.id, workspace_id: workspaceId,
          channel: bc.channel, body: personalizedBody,
          ...(usesTemplate ? {
            template: {
              name: bc.template_name,
              language: bc.template_language || 'en_US',
              // Only attach a body parameter if this template body actually has
              // a {{1}} variable (Meta rejects a components array whose length
              // doesn't match the approved template's variable count exactly).
              ...((bc.message || '').includes('{{')
                ? { components: [{ type: 'body', parameters: [{ type: 'text', text: contact.full_name || 'there' }] }] }
                : {}),
            },
          } : {}),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Send failed');

      await supabase.from('conversations').update({
        last_message: personalizedBody, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', conv.id);

      sentCount += 1;
    } catch (e) {
      console.error('[sendBroadcast] failed for contact', contactId, e);
      failedCount += 1;
    }
  }));

  const { data: updated, error: updateErr } = await supabase
    .from('broadcasts')
    .update({
      status: 'sent', sent_at: new Date().toISOString(),
      sent_count: sentCount, failed_count: failedCount, updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return updated;
}

// ── Manual conversations (New Conversation modal) ────────────────────────────

// Creates a manual contact + conversation (used by "New Conversation" in the
// inbox — e.g. logging an offline/phone lead by hand). Channel defaults to
// 'website' since that's the only channel that doesn't require a real
// external_id from a connected provider.
export async function createManualConversation(workspaceId, { contact_name, contact_email, subject, channel, priority, assigned_to, assigned_to_name }) {
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .insert({ workspace_id: workspaceId, channel: channel || 'website', full_name: contact_name, email: contact_email || null })
    .select('*')
    .single();
  if (contactErr) throw contactErr;

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId, contact_id: contact.id, channel: channel || 'website',
      // Always 'open' — "unassigned" is represented purely by assigned_to
      // being null, matching every other conversation-creation path (the
      // webhooks) and the Inbox's "Unassigned" tab filter, which looks for
      // status='open' AND assigned_to IS NULL. The old code set the literal
      // status string 'unassigned' here, which that tab filter never
      // actually matched — manually-created unassigned conversations would
      // silently never show up under "Unassigned".
      status: 'open', subject, priority: priority || 'normal',
      assigned_to: assigned_to || null, assigned_to_name: assigned_to_name || null,
      last_message: '', last_message_at: new Date().toISOString(),
    })
    .select('*, contact:contacts(id,full_name,phone,email,company,avatar_url,deal_stage,tags,notes)')
    .single();
  if (convErr) throw convErr;

  // If no assignee was explicitly picked, try the same auto-assignment rules
  // used for inbound WhatsApp/Messenger/email conversations, for consistency.
  if (!assigned_to) {
    try {
      const result = await applyAssignmentRules(supabase, {
        workspaceId, conversationId: conv.id, channel: channel || 'website', contact,
      });
      if (result) {
        conv.assigned_to = result.assignedId;
        conv.assigned_to_name = result.assignedName;
      }
    } catch (e) {
      console.error('[createManualConversation] rule application error:', e);
    }
  }

  return normalizeConversation(conv);
}

// ── Rules ────────────────────────────────────────────────────────────────────

export async function getRules(workspaceId) {
  const { data, error } = await supabase
    .from('rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createRule(workspaceId, rule) {
  const { data, error } = await supabase
    .from('rules')
    .insert({
      workspace_id: workspaceId, name: rule.name, type: rule.type, channel: rule.channel,
      condition_value: rule.condition_value || null, assigned_to_ids: rule.assigned_to_ids || [],
      assigned_to_names: rule.assigned_to_names || [], priority_order: rule.priority_order || 1,
      is_active: rule.is_active !== false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRule(id, updates) {
  const { data, error } = await supabase
    .from('rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRule(id) {
  const { error } = await supabase.from('rules').delete().eq('id', id);
  if (error) throw error;
}

// ── Canned responses ─────────────────────────────────────────────────────────

export async function getCannedResponses(workspaceId) {
  const { data, error } = await supabase
    .from('canned_responses')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCannedResponse(workspaceId, { title, shortcut, body }) {
  const { data, error } = await supabase
    .from('canned_responses')
    .insert({ workspace_id: workspaceId, title, shortcut, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCannedResponse(id, updates) {
  const { data, error } = await supabase
    .from('canned_responses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCannedResponse(id) {
  const { error } = await supabase.from('canned_responses').delete().eq('id', id);
  if (error) throw error;
}

// Per-agent chat background preference for their OWN inbox view only —
// stored on their own profiles row (never the shared workspace row), so
// it never affects what teammates see. `bg` is a preset key (see
// CHAT_BACKGROUNDS in MessageThread.jsx) or a custom image URL.
export async function setChatBackground(userId, bg) {
  const { error } = await supabase.from('profiles').update({ chat_background: bg }).eq('id', userId);
  if (error) throw error;
}
