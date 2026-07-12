// channels.js — Supabase-backed channel configs + conversation/message helpers
import { supabase } from '@/lib/supabase';
import {
  cacheConversations, getCachedConversations,
  cacheMessages, getCachedMessages,
  upsertCachedConversation, upsertCachedMessage,
  enqueueOutbox,
} from '@/lib/offlineDb';
import { applyAssignmentRules } from '../../api/_lib/assignRules.js';

// ── Phone number utilities ────────────────────────────────────────────────────
// Strips all non-digit characters, removes leading zeros, normalises to E.164-ish
export function normalisePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^0-9+]/g, '');
  // Remove leading + if present for digit comparison
  const stripped = digits.replace(/^\+/, '');
  return stripped;
}

export function phonesMatch(a, b) {
  if (!a || !b) return false;
  const na = normalisePhone(a);
  const nb = normalisePhone(b);
  // Direct match
  if (na === nb) return true;
  // Country code prefix match: 0999... == 265999... (Malawi +265)
  // Generic: check if one ends with the other (last 9 digits)
  const short = Math.min(na.length, nb.length);
  if (short >= 9) {
    return na.slice(-9) === nb.slice(-9);
  }
  return false;
}

// Import contacts from the browser Contact Picker API (Android Chrome)
export async function pickPhoneContacts() {
  if (!navigator.contacts?.select) {
    throw new Error('Contact Picker API not available on this browser/device');
  }

  // Request supported properties — 'icon' (contact photo) is available on
  // Android Chrome 80+ and some other browsers. We ask for it but fall back
  // gracefully if the browser doesn't support it.
  const supportedProps = navigator.contacts.getProperties
    ? await navigator.contacts.getProperties()
    : ['name', 'tel'];
  const props = ['name', 'tel', ...(supportedProps.includes('icon') ? ['icon'] : [])];
  const opts  = { multiple: true };
  const raw = await navigator.contacts.select(props, opts);

  // Helper: convert first icon blob to a data URL string
  async function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  const contacts = [];
  for (const entry of raw) {
    const name = (entry.name || [])[0] || '';
    const tels = entry.tel || [];
    // Try to get contact photo as data URL
    let avatar_url = null;
    if (entry.icon?.length) {
      try { avatar_url = await blobToDataURL(entry.icon[0]); } catch { /* ignore */ }
    }
    if (tels.length === 0) {
      contacts.push({ full_name: name, phone: '', avatar_url });
    } else {
      tels.forEach((tel, i) =>
        contacts.push({ full_name: name, phone: tel, avatar_url: i === 0 ? avatar_url : null })
      );
    }
  }
  return contacts.filter(c => c.full_name || c.phone);
}

// Sync a list of phone contacts into Nyasadesk — insert new, skip existing
export async function syncPhoneContacts(workspaceId, phoneContacts) {
  const { data: existing, error } = await supabase
    .from('contacts')
    .select('phone, full_name')
    .eq('workspace_id', workspaceId);
  if (error) throw error;

  const toAdd = [];
  for (const pc of phoneContacts) {
    if (!pc.phone) continue;
    const alreadyExists = (existing || []).some(e => phonesMatch(e.phone, pc.phone));
    if (!alreadyExists) {
      toAdd.push({
        workspace_id: workspaceId,
        full_name: pc.full_name || pc.phone,
        phone: pc.phone,
        channel: 'manual',
        lead_source: 'phone',
        ...(pc.avatar_url ? { avatar_url: pc.avatar_url } : {}),
      });
    }
  }

  if (toAdd.length === 0) return { added: 0, skipped: phoneContacts.length };

  const { error: insErr } = await supabase.from('contacts').insert(toAdd);
  if (insErr) throw insErr;
  return { added: toAdd.length, skipped: phoneContacts.length - toAdd.length };
}

// Resolve an unknown phone number to a saved contact (used in inbox)
export async function resolvePhoneToContact(workspaceId, phone) {
  if (!phone) return null;
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (error || !data) return null;
  return data.find(c => phonesMatch(c.phone, phone)) || null;
}

// Auto-link a conversation to a contact by phone number match
export async function autoLinkConversationContact(workspaceId, conversationId, contactPhone) {
  const contact = await resolvePhoneToContact(workspaceId, contactPhone);
  if (!contact) return null;
  // Update conversation with the found contact_id and correct contact_name
  const { error } = await supabase
    .from('conversations')
    .update({
      contact_id: contact.id,
      contact_name: contact.full_name,
    })
    .eq('id', conversationId)
    .is('contact_id', null); // only if not already linked
  if (error) console.warn('[autoLink] could not update conversation:', error.message);
  return contact;
}


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
    contact_name: c.full_name || row.contact_name || row.contact_phone || 'Unknown Contact',
    contact_email: c.email || null,
    contact_phone: c.phone || null,
    contact_company: c.company || null,
    contact_avatar_url: c.avatar_url || null,
    // BUG FIX: ad_attribution/lead_source were captured on inbound Click-to-WhatsApp
    // ad messages and stored on the contact, but this select() never fetched those
    // columns -- ContactPanel's "From an ad" block was fully built and wired up, it
    // just always received `undefined` and silently never rendered. Now included.
    contact_ad_attribution: c.ad_attribution || null,
    contact_lead_source: c.lead_source || null,
    last_message_preview: row.last_message || '',
    unread: (row.unread_count || 0) > 0,
  };
}

export async function getConversations(workspaceId, filters = {}) {
  // If offline, fall back to cached conversations immediately
  if (!navigator.onLine) {
    const cached = await getCachedConversations(workspaceId).catch(() => []);
    return cached;
  }

  let q = supabase
    .from('conversations')
    .select('*, contact:contacts(id,full_name,phone,email,company,avatar_url,deal_stage,tags,notes,ad_attribution,lead_source)')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false });

  // ── Role-based visibility ────────────────────────────────────────────────
  // Agents (role='user') only see conversations assigned to them.
  // Admins and Sales Managers see everything.
  // filters.agentId is passed only when the caller is an agent.
  if (filters.agentId) {
    q = q.eq('assigned_to', filters.agentId);
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'open')       q = q.in('status', ['open','unassigned']);
    else if (filters.status === 'unassigned') q = q.is('assigned_to', null).eq('status', 'open');
    else q = q.eq('status', filters.status);
  }
  if (filters.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);

  let data, error;
  try {
    ({ data, error } = await q);
  } catch (netErr) {
    // Network completely unavailable — serve from cache
    const cached = await getCachedConversations(workspaceId).catch(() => []);
    return cached;
  }

  if (error) throw error;
  const result = (data || []).map(normalizeConversation);

  // Write-through: cache the fresh list for offline use
  cacheConversations(result).catch(() => {});

  return result;
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
  // Offline: return cached messages
  if (!navigator.onLine) {
    const cached = await getCachedMessages(conversationId).catch(() => []);
    return cached;
  }

  let data, error;
  try {
    ({ data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }));
  } catch (netErr) {
    const cached = await getCachedMessages(conversationId).catch(() => []);
    return cached;
  }

  if (error) throw error;
  const msgs = data || [];

  // Write-through: keep IndexedDB current for offline reads
  cacheMessages(conversationId, msgs).catch(() => {});

  return msgs;
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
  // ── Offline guard: enqueue and return a fake optimistic message ──────────
  if (!navigator.onLine) {
    await enqueueOutbox({ workspaceId, conversationId, body, senderName, senderId,
                          replyTo, attachments, createdAt: new Date().toISOString() });
    // Return a fake msg object so optimistic UI still works
    return {
      id: 'offline-' + Date.now(),
      conversation_id: conversationId,
      workspace_id: workspaceId,
      body,
      direction: 'outbound',
      sender_name: senderName,
      status: 'queued',
      created_at: new Date().toISOString(),
      attachments,
      reply_to: replyTo,
    };
  }

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
        // Try to extract the server's error message so the UI can show it
        let errReason = 'Send failed';
        try {
          const errJson = await res.json();
          errReason = errJson?.error || errJson?.message || `HTTP ${res.status}`;
        } catch (_) { errReason = `HTTP ${res.status}`; }
        await supabase.from('messages').update({
          status: 'failed',
          error_reason: errReason.slice(0, 500),
        }).eq('id', msg.id);
      }
      // On success: leave status alone. server already set it to 'sent'.
    } catch (e) {
      // Network-level failure (no response at all)
      await supabase.from('messages').update({
        status: 'failed',
        error_reason: (e?.message || 'Network error — could not reach server').slice(0, 500),
      }).eq('id', msg.id);
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
    }, (payload) => {
      // Cache live conversation changes to IDB for offline reading
      if (payload?.new?.id) {
        upsertCachedConversation(payload.new).catch(() => {});
      }
      callback(payload);
    })
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
    }, (payload) => {
      // Cache every live message update to IDB so it's available offline
      if (payload?.new?.id) {
        upsertCachedMessage(payload.new).catch(() => {});
      }
      callback(payload);
    })
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

// ── AI Agents ────────────────────────────────────────────────────────────
// Agent CRUD goes straight to Supabase (RLS: is_workspace_member for read,
// is_workspace_admin for write) — same convention as rules/canned_responses.
// Only draft generation needs the backend, since that's the one operation
// that touches the server-side OpenAI key.

// Usage/cost summary for the last 30 days, grouped by agent -- powers the
// small "$X.XX · N replies" line on each agent card. RLS on ai_usage_logs
// only allows workspace admins to read it (only service-role backend code
// writes rows), matching who's allowed to see billing-relevant AI spend.
export async function getAiUsageSummary(workspaceId) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('agent_id, estimated_cost_usd')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);
  if (error) { console.error('Failed to load AI usage summary:', error); return {}; }
  const byAgent = {};
  for (const row of data || []) {
    if (!row.agent_id) continue;
    if (!byAgent[row.agent_id]) byAgent[row.agent_id] = { cost: 0, count: 0 };
    byAgent[row.agent_id].cost += Number(row.estimated_cost_usd) || 0;
    byAgent[row.agent_id].count += 1;
  }
  return byAgent;
}

// ── Quotation & Invoice Builder ──────────────────────────────────────────
export async function getDocSettings(workspaceId) {
  const res = await fetch(`/api/channels?action=doc-settings-get&workspace_id=${encodeURIComponent(workspaceId)}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load document settings');
  return json.settings;
}

export async function saveDocSettings(workspaceId, patch) {
  const res = await fetch('/api/channels?action=doc-settings-save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, ...patch }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to save document settings');
  return json.settings;
}

export async function listQuotations(workspaceId, status) {
  const q = new URLSearchParams({ workspace_id: workspaceId, ...(status ? { status } : {}) });
  const res = await fetch(`/api/channels?action=quotation-list&${q}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load quotations');
  return json.quotations;
}

export async function getQuotation(workspaceId, id) {
  const q = new URLSearchParams({ workspace_id: workspaceId, id });
  const res = await fetch(`/api/channels?action=quotation-get&${q}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load quotation');
  return json;
}

export async function createQuotation(workspaceId, input) {
  const res = await fetch('/api/channels?action=quotation-create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, ...input }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to create quotation');
  return json.quotation;
}

export async function updateQuotation(workspaceId, id, patch) {
  const res = await fetch('/api/channels?action=quotation-update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, id, ...patch }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to update quotation');
  return json.quotation;
}

export async function convertQuotationToInvoice(workspaceId, id, overrides = {}) {
  const res = await fetch('/api/channels?action=quotation-convert', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, id, ...overrides }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to convert quotation');
  return json.invoice;
}

export async function listInvoices(workspaceId, status) {
  const q = new URLSearchParams({ workspace_id: workspaceId, ...(status ? { status } : {}) });
  const res = await fetch(`/api/channels?action=invoice-list&${q}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load invoices');
  return json.invoices;
}

export async function getInvoice(workspaceId, id) {
  const q = new URLSearchParams({ workspace_id: workspaceId, id });
  const res = await fetch(`/api/channels?action=invoice-get&${q}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load invoice');
  return json;
}

export async function createInvoice(workspaceId, input) {
  const res = await fetch('/api/channels?action=invoice-create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, ...input }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to create invoice');
  return json.invoice;
}

export async function updateInvoice(workspaceId, id, patch) {
  const res = await fetch('/api/channels?action=invoice-update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, id, ...patch }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to update invoice');
  return json.invoice;
}

export async function recordInvoicePayment(workspaceId, id, payment) {
  const res = await fetch('/api/channels?action=invoice-record-payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, id, ...payment }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to record payment');
  return json.invoice;
}

export async function sendDocument(workspaceId, { doc_type, id, conversation_id, via }) {
  const res = await fetch('/api/channels?action=document-send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, doc_type, id, conversation_id, via }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to send document');
  return json;
}

export async function getAiAgents(workspaceId) {
  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Retries transient network failures (mobile connections drop fetch calls
// mid-flight -- shows up as a bare "TypeError: Failed to fetch" with no
// Supabase error body). Real errors (RLS, validation) come back as proper
// Postgrest error objects and are NOT retried, they just throw immediately.
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const isNetworkErr = e instanceof TypeError || /failed to fetch|network/i.test(e?.message || '');
      if (!isNetworkErr || i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function saveAiAgent(workspaceId, agent) {
  const { id, ...fields } = agent;
  return withRetry(async () => {
    if (id) {
      const { data, error } = await supabase.from('ai_agents')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id).eq('workspace_id', workspaceId).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase.from('ai_agents')
      .insert({ workspace_id: workspaceId, ...fields }).select().single();
    if (error) throw error;
    return data;
  });
}

export async function deleteAiAgent(id) {
  const { error } = await supabase.from('ai_agents').delete().eq('id', id);
  if (error) throw error;
}

export async function getAiAgentTemplates() {
  const res = await fetch('/api/channels?action=ai-templates');
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load templates');
  return data.templates || [];
}

// Generates a draft reply for a conversation using the given agent. Always
// returns text for a human to review in the composer — never auto-sends
// (Phase 1: automation_mode is stored on the agent for future phases, not
// acted on yet).
export async function generateAiDraft(workspaceId, agentId, conversationId) {
  const res = await fetch('/api/channels?action=ai-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, agent_id: agentId, conversation_id: conversationId }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to generate draft');
  return data.draft;
}

// ── AI Agents: knowledge base (Phase 2) ────────────────────────────────────
// Plain text / FAQ snippets. agent_id null = shared across all agents in the
// workspace; agent_id set = specific to that one agent.

export async function getAiKnowledge(workspaceId, agentId) {
  let q = supabase.from('ai_knowledge').select('*').eq('workspace_id', workspaceId);
  q = agentId ? q.or(`agent_id.eq.${agentId},agent_id.is.null`) : q.is('agent_id', null);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveAiKnowledge(workspaceId, snippet) {
  const { id, ...fields } = snippet;
  return withRetry(async () => {
    if (id) {
      const { data, error } = await supabase.from('ai_knowledge')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id).eq('workspace_id', workspaceId).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase.from('ai_knowledge')
      .insert({ workspace_id: workspaceId, ...fields }).select().single();
    if (error) throw error;
    return data;
  });
}

export async function deleteAiKnowledge(id) {
  const { error } = await supabase.from('ai_knowledge').delete().eq('id', id);
  if (error) throw error;
}

// ── AI Agents: knowledge ingestion from URL / file (Phase 3) ──────────────

export async function addKnowledgeFromUrl(workspaceId, agentId, url) {
  const res = await fetch('/api/channels?action=ai-knowledge-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, agent_id: agentId, url }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to add knowledge from URL');
  return data.knowledge;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function addKnowledgeFromFile(workspaceId, agentId, file) {
  const content_base64 = await fileToBase64(file);
  const res = await fetch('/api/channels?action=ai-knowledge-from-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, agent_id: agentId, filename: file.name, mime_type: file.type, content_base64 }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to add knowledge from file');
  return data.knowledge;
}


// ── Internal agent messaging + pinned conversations ──────────────────────────

export async function getTeamMembers(workspaceId, accessToken) {
  const res = await fetch(`/api/team?action=team-members&workspace_id=${encodeURIComponent(workspaceId)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load team members');
  return json.members || [];
}

export async function createInternalConv(workspaceId, recipientId, message, accessToken) {
  const res = await fetch('/api/team?action=create-internal-conv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ workspace_id: workspaceId, recipient_id: recipientId, message }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create internal conversation');
  return json;
}

export async function getPinnedConvs(workspaceId, accessToken) {
  const res = await fetch(`/api/team?action=get-pins&workspace_id=${encodeURIComponent(workspaceId)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load pinned conversations');
  return json.pins || [];
}

export async function pinConversation(workspaceId, convId, pinnedFor, accessToken) {
  const res = await fetch('/api/team?action=pin-conv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ workspace_id: workspaceId, conversation_id: convId, pinned_for: pinnedFor }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to pin conversation');
  return json;
}

export async function unpinConversation(workspaceId, convId, pinnedFor, accessToken) {
  const res = await fetch('/api/team?action=unpin-conv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ workspace_id: workspaceId, conversation_id: convId, pinned_for: pinnedFor }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to unpin conversation');
  return json;
}

// ── Contacts Extended ─────────────────────────────────────────────────────

export async function importContactsCSV(workspaceId, contacts) {
  // contacts = array of {full_name, phone, email, company, ...}
  const rows = contacts.map(c => ({ workspace_id: workspaceId, channel: 'manual', ...c }));
  const { data, error } = await supabase.from('contacts').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function blockContact(contactId, blocked) {
  const { data, error } = await supabase
    .from('contacts')
    .update({ blocked })
    .eq('id', contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadContactAvatar(workspaceId, contactId, file) {
  const ext = file.name.split('.').pop();
  const path = `${workspaceId}/avatars/${contactId}.${ext}`;
  const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
  await updateContact(contactId, { avatar_url: publicUrl });
  return publicUrl;
}

// ── Auto-resolve unknown conversation contacts by phone ───────────────────────
// Call this after loading conversations. It checks any conversation that has
// a phone number but no linked contact, finds a matching contact by phone,
// updates the DB row, and returns the enriched conversation list.
export async function resolveUnknownContacts(workspaceId, conversations) {
  if (!workspaceId || !conversations?.length) return conversations;
  try {
    // Fetch all contacts once for efficiency
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, full_name, phone, avatar_url')
      .eq('workspace_id', workspaceId);

    if (!allContacts?.length) return conversations;

    const updates = [];
    const resolved = conversations.map(conv => {
      // Already has a linked contact with a name — skip
      if (conv.contact_id && conv.contact_name !== 'Unknown Contact') return conv;

      const phone = conv.contact_phone || conv.contact_phone;
      if (!phone) return conv;

      // Find matching contact
      const match = allContacts.find(c => phonesMatch(c.phone, phone));
      if (!match) return conv;

      // Queue a DB update (non-blocking)
      if (!conv.contact_id) {
        updates.push(
          supabase.from('conversations')
            .update({ contact_id: match.id, contact_name: match.full_name })
            .eq('id', conv.id)
            .is('contact_id', null)
        );
      }

      return {
        ...conv,
        contact_id: match.id,
        contact_name: match.full_name,
        contact_avatar_url: match.avatar_url || conv.contact_avatar_url,
      };
    });

    // Fire updates in background — don't await
    if (updates.length) Promise.all(updates).catch(e => console.warn('[resolveUnknown] update err:', e));

    return resolved;
  } catch (e) {
    console.warn('[resolveUnknownContacts] error:', e);
    return conversations;
  }
}


export async function getContactByPhone(workspaceId, phone) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startConversationWithContact(workspaceId, contact) {
  // Check if conversation already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .eq('channel', 'whatsapp')
    .maybeSingle();
  if (existing) return existing.id;
  // Create a new conversation
  const { data, error } = await supabase.from('conversations').insert({
    workspace_id: workspaceId,
    contact_id: contact.id,
    contact_name: contact.full_name,
    contact_phone: contact.phone,
    channel: 'whatsapp',
    status: 'open',
    last_message_preview: '',
  }).select('id').single();
  if (error) throw error;
  return data.id;
}
