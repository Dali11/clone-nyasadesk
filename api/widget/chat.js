import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD = 'https://nyasadesk1.vercel.app';

export default async function handler(req, res) {
  // Allow widget to call from any domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { action, workspace_id, session_id, name, email, body, page_url } = req.body || req.query || {};

    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    // Verify workspace exists and has website channel enabled
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', 'website').single();

    // ── START SESSION: visitor opens the widget ──────────────────────────────
    if (action === 'start' || req.method === 'GET') {
      const visitorId = session_id || `visitor-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const greeting  = cfg?.config?.greeting || "Hi there! 👋 How can we help you today?";
      const color     = cfg?.config?.widget_color || '#25D366';
      const label     = cfg?.config?.label || 'Chat with us';
      return res.status(200).json({ session_id: visitorId, greeting, color, label });
    }

    // ── SEND: visitor sends a message ────────────────────────────────────────
    if (action === 'send' && req.method === 'POST') {
      if (!session_id || !body?.trim()) return res.status(400).json({ error: 'session_id and body required' });

      const visitorName  = name || 'Website Visitor';
      const visitorEmail = email || null;
      const externalId   = session_id;

      // Upsert contact
      const { data: contact } = await sb.from('contacts').upsert({
        workspace_id, channel: 'website', external_id: externalId,
        full_name: visitorName, email: visitorEmail, lead_source: 'website',
      }, { onConflict: 'workspace_id,channel,external_id' }).select('id').single();

      // Upsert conversation
      const { data: conv } = await sb.from('conversations').upsert({
        workspace_id, channel: 'website', external_id: externalId,
        contact_id: contact?.id, status: 'open',
        subject: visitorName + (page_url ? ' — ' + page_url : ''),
        last_message: body.trim(), last_message_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count').single();

      if (conv?.id) {
        // Increment unread for the agent
        await sb.from('conversations').update({
          unread_count: (conv.unread_count || 0) + 1,
          last_message: body.trim(), last_message_at: new Date().toISOString(),
        }).eq('id', conv.id);

        // Insert visitor message
        const { data: msg } = await sb.from('messages').insert({
          conversation_id: conv.id, workspace_id,
          direction: 'inbound', body: body.trim(), channel: 'website',
          external_id: `widget-${Date.now()}`,
          sender_name: visitorName, sender_id: externalId, status: 'delivered',
        }).select('id').single();

        return res.status(200).json({ ok: true, message_id: msg?.id, conversation_id: conv.id });
      }
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    // ── POLL: visitor polls for agent replies ────────────────────────────────
    if (action === 'poll' && (req.method === 'POST' || req.method === 'GET')) {
      if (!session_id) return res.status(400).json({ error: 'session_id required' });
      const since = req.body?.since || req.query?.since || new Date(Date.now() - 60000).toISOString();

      const { data: conv } = await sb.from('conversations').select('id')
        .eq('workspace_id', workspace_id).eq('channel', 'website').eq('external_id', session_id).single();

      if (!conv) return res.status(200).json({ messages: [] });

      const { data: msgs } = await sb.from('messages').select('id,body,direction,sender_name,created_at')
        .eq('conversation_id', conv.id).eq('direction', 'outbound')
        .gt('created_at', since).order('created_at', { ascending: true });

      return res.status(200).json({ messages: msgs || [] });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Widget API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
