// src/lib/messageSearch.js
// Message Search feature — full-text search across conversations
// Provides search API and indexing utilities

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Search messages across all conversations in a workspace
export async function searchMessages(workspaceId, query, limit = 50) {
  if (!query || query.trim().length < 2) {
    return { results: [], total: 0 };
  }

  try {
    const { data, error, count } = await supabase
      .from('messages')
      .select('id, conversation_id, body, created_at, sender_name, direction, attachments', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .neq('direction', 'note')
      .ilike('body', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      results: data || [],
      total: count || 0,
      query,
    };
  } catch (e) {
    console.error('[messageSearch] error:', e);
    throw new Error('Search failed: ' + e.message);
  }
}

// Get rich context around a message hit
export async function getMessageContext(conversationId, messageId, contextLines = 2) {
  try {
    const { data: targetMsg, error: targetError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (targetError) throw targetError;

    const { data: context } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(contextLines * 2 + 1);

    return {
      target: targetMsg,
      context: context || [],
    };
  } catch (e) {
    console.error('[getMessageContext] error:', e);
    return { target: null, context: [] };
  }
}

// Log search result clicks for analytics
export async function logSearchClick(workspaceId, messageId, query) {
  try {
    console.debug(`[Search] clicked message ${messageId} for query "${query}"`);
  } catch (e) {
    console.warn('[logSearchClick] failed:', e);
  }
}
