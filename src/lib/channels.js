// channels.js — Supabase-backed channel configs + conversation/message helpers
import { supabase } from '@/lib/supabase';

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

export async function getConversations(workspaceId, filters = {}) {
  let q = supabase
    .from('conversations')
    .select('*, contact:contacts(full_name,phone,email,company,avatar_url)')
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
  return data || [];
}

export async function updateConversation(id, updates) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sendMessage(workspaceId, conversationId, body, senderName) {
  // 1. Insert message record
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: 'outbound',
      body,
      sender_name: senderName,
      status: 'sending',
    })
    .select()
    .single();
  if (error) throw error;

  // 2. Update conversation last_message
  await supabase.from('conversations').update({
    last_message: body,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);

  // 3. Dispatch via edge function
  try {
    const { data: conv } = await supabase.from('conversations').select('channel,external_id,workspace_id').eq('id', conversationId).single();
    const res = await fetch('/api/channels/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: msg.id, conversation_id: conversationId, workspace_id: workspaceId, channel: conv.channel, body }),
    });
    if (res.ok) {
      await supabase.from('messages').update({ status: 'delivered' }).eq('id', msg.id);
    } else {
      await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
    }
  } catch (e) {
    await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
  }

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
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, callback)
    .subscribe();
}
