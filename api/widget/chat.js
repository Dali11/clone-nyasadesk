import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD = 'https://nyasadesk.com';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }; // allow base64 image uploads

// ── WhatsApp forwarding ────────────────────────────────────────────────────
// When a website visitor sends a message through the widget, we forward it
// to the business owner's WhatsApp number so they get an instant
// notification on their phone — just like WhatsApp's own "click to chat".
//
// Flow: visitor sends message → stored in DB (website channel) → forwarded
// to business owner via WhatsApp Cloud API → business owner opens NyasaDesk
// inbox and replies → reply shows in widget.
//
// The WhatsApp send is best-effort: if the 24-hour window has expired, the
// config is missing, or the business owner hasn't linked their WhatsApp
// number, it silently fails. The message is already in the inbox either way.
const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function forwardToWhatsApp(sb, { workspace_id, visitorName, messageText, pageUrl, sessionId }) {
  try {
    // 1. Get the workspace's WhatsApp channel config (the business number to send FROM)
    const { data: waConfig } = await sb.from('channel_configs')
      .select('config').eq('workspace_id', workspace_id).eq('channel', 'whatsapp').maybeSingle();
    if (!waConfig?.config?.phone_number_id || !waConfig?.config?.access_token) return;

    const { phone_number_id, access_token } = waConfig.config;

    // 2. Get the business owner's WhatsApp number (to send TO)
    const { data: members } = await sb.from('business_members')
      .select('whatsapp_number').eq('business_id', workspace_id)
      .not('whatsapp_number', 'is', null).limit(1);
    if (!members?.length || !members[0].whatsapp_number) return;

    const toNumber = members[0].whatsapp_number;

    // 3. Format the notification message
    const preview = messageText.length > 200 ? messageText.slice(0, 200) + '…' : messageText;
    const text = `💬 *New website chat*\n\nFrom: ${visitorName}\n${pageUrl ? `Page: ${pageUrl}\n` : ''}\n"${preview}"\n\n_Reply in your NyasaDesk inbox_`;

    // 4. Send via WhatsApp Cloud API
    const res = await fetch(`${GRAPH}/${phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[widget] WhatsApp forward failed:', err?.error?.message || res.status);
    }
  } catch (e) {
    console.error('[widget] WhatsApp forward error:', e?.message || e);
  }
}

export default async function handler(req, res) {
  // Allow widget to call from any domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { action, workspace_id, session_id, name, email, body, page_url,
             file_base64, file_name, file_type, kind } = req.body || req.query || {};

    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    // Verify workspace exists and has website channel enabled
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', 'website').single();

    // ── START SESSION: visitor opens the widget ──────────────────────────────
    if (action === 'start' || req.method === 'GET') {
      const visitorId = session_id || `visitor-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const greeting   = cfg?.config?.greeting || "Hi there! 👋 How can we help you today?";
      const color      = cfg?.config?.widget_color || '#25D366';
      const label      = cfg?.config?.label || 'Chat with us';
      const agent_name = cfg?.config?.agent_name || 'Support Team';
      const position    = cfg?.config?.widget_position || 'bottom-right';

      // Look up the workspace's WhatsApp number for the "Continue on WhatsApp" link
      let wa_number = '';
      try {
        const { data: waConfig } = await sb.from('channel_configs')
          .select('config').eq('workspace_id', workspace_id).eq('channel', 'whatsapp').maybeSingle();
        wa_number = waConfig?.config?.phone_number || '';
      } catch (_) {}

      // Look up any existing conversation so we can hand back last_read_at
      // right away — lets the widget render correct tick marks on first paint
      // for a returning visitor, before the first poll cycle even runs.
      let last_read_at = null;
      if (session_id) {
        const { data: conv } = await sb.from('conversations').select('last_read_at')
          .eq('workspace_id', workspace_id).eq('channel', 'website').eq('external_id', session_id).maybeSingle();
        last_read_at = conv?.last_read_at || null;
      }

      return res.status(200).json({ session_id: visitorId, greeting, color, label, agent_name, position, last_read_at, wa_number });
    }

    // ── HISTORY: returning visitor reopens the widget — replay their full
    // past conversation (both directions) instead of a fresh empty thread.
    // Chat history is fully persistent on both ends — nothing here ever
    // expires or auto-purges; it only goes away if the business explicitly
    // deletes the conversation/messages.
    if (action === 'history' && (req.method === 'POST' || req.method === 'GET')) {
      if (!session_id) return res.status(400).json({ error: 'session_id required' });

      const { data: conv } = await sb.from('conversations').select('id,last_read_at')
        .eq('workspace_id', workspace_id).eq('channel', 'website').eq('external_id', session_id).single();

      if (!conv) return res.status(200).json({ messages: [], last_read_at: null });

      const { data: msgs } = await sb.from('messages').select('id,body,direction,sender_name,created_at,status,attachments')
        .eq('conversation_id', conv.id).is('deleted_at', null)
        .order('created_at', { ascending: true }).limit(200);

      return res.status(200).json({ messages: msgs || [], last_read_at: conv.last_read_at || null });
    }

    // ── SEND: visitor sends a message ────────────────────────────────────────
    if (action === 'send' && req.method === 'POST') {
      if (!session_id || !body?.trim()) return res.status(400).json({ error: 'session_id and body required' });

      const { conv, error } = await upsertVisitorThread(sb, { workspace_id, session_id, name, email, page_url, lastMessage: body.trim() });
      if (error || !conv?.id) return res.status(500).json({ error: 'Failed to create conversation' });

      // Real tick semantics: 'sent' the moment we've durably stored it — there's
      // no separate "delivered to device" concept for a website chat (unlike
      // WhatsApp/Messenger), so we go straight to 'sent' and only flip to
      // 'read' once an agent actually opens the conversation (see Inbox.jsx).
      const { data: msg } = await sb.from('messages').insert({
        conversation_id: conv.id, workspace_id,
        direction: 'inbound', body: body.trim(), channel: 'website',
        external_id: `widget-${Date.now()}`,
        sender_name: name || 'Website Visitor', sender_id: session_id, status: 'sent',
      }).select('id').single();

      // Forward to business owner's WhatsApp (best-effort, non-blocking)
      forwardToWhatsApp(sb, {
        workspace_id, visitorName: name || 'Website Visitor',
        messageText: body.trim(), pageUrl: page_url || '',
        sessionId,
      }).catch(() => {}); // never block the response on WhatsApp delivery

      // Also trigger web push notifications for all team members
      try {
        const { notifyNewMessage } = await import('../_lib/pushNotify.js');
        await notifyNewMessage(sb, {
          ownerId: workspace_id,
          contactName: name || 'Website Visitor',
          body: body.trim(),
          conversationId: conv.id,
          channel: 'website',
          contactPhone: '',
          contactAvatar: '',
        });
      } catch (e) { /* push is best-effort */ }

      return res.status(200).json({ ok: true, message_id: msg?.id, conversation_id: conv.id });
    }

    // ── UPLOAD: visitor sends an image/video attachment ──────────────────────
    if (action === 'upload' && req.method === 'POST') {
      if (!session_id || !file_base64) return res.status(400).json({ error: 'session_id and file_base64 required' });

      // Use caption (passed as body) if provided, otherwise fall back to a
      // placeholder emoji string — same pattern the team inbox uses.
      const fallbackBody = kind === 'video' ? '🎥 Video' : kind === 'audio' ? '🎤 Voice message' : '📷 Photo';
      const msgBody = (body && body.trim()) ? body.trim() : fallbackBody;
      const { conv, error } = await upsertVisitorThread(sb, { workspace_id, session_id, name, email, page_url, lastMessage: msgBody });
      if (error || !conv?.id) return res.status(500).json({ error: 'Failed to create conversation' });

      const buffer = Buffer.from(file_base64, 'base64');
      if (buffer.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'File too large (max 6MB)' });

      const ext = (file_name?.split('.').pop() || (kind === 'audio' ? 'webm' : 'bin')).toLowerCase();
      const path = `${workspace_id}/${kind || 'image'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await sb.storage.from('chat-media').upload(path, buffer, {
        contentType: file_type || 'application/octet-stream', upsert: false,
      });
      if (upErr) return res.status(500).json({ error: upErr.message });
      const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);

      const attType = kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'image';
      const { data: msg } = await sb.from('messages').insert({
        conversation_id: conv.id, workspace_id,
        direction: 'inbound', body: msgBody, channel: 'website',
        external_id: `widget-${Date.now()}`,
        sender_name: name || 'Website Visitor', sender_id: session_id, status: 'sent',
        attachments: [{ url: pub.publicUrl, type: attType }],
      }).select('id').single();

      // Forward media notification to business owner's WhatsApp
      forwardToWhatsApp(sb, {
        workspace_id, visitorName: name || 'Website Visitor',
        messageText: `[${attType === 'video' ? 'Video' : 'Photo'}] ${caption || msgBody}`,
        pageUrl: page_url || '',
        sessionId,
      }).catch(() => {});

      return res.status(200).json({ ok: true, message_id: msg?.id, conversation_id: conv.id, url: pub.publicUrl });
    }

    // ── POLL: visitor polls for agent replies + read-receipt updates ─────────
    if (action === 'poll' && (req.method === 'POST' || req.method === 'GET')) {
      if (!session_id) return res.status(400).json({ error: 'session_id required' });
      const since = req.body?.since || req.query?.since || new Date(Date.now() - 60000).toISOString();

      const { data: conv } = await sb.from('conversations').select('id,last_read_at')
        .eq('workspace_id', workspace_id).eq('channel', 'website').eq('external_id', session_id).single();

      if (!conv) return res.status(200).json({ messages: [], last_read_at: null });

      const { data: msgs } = await sb.from('messages').select('id,body,direction,sender_name,created_at,status,attachments')
        .eq('conversation_id', conv.id).eq('direction', 'outbound').is('deleted_at', null)
        .gt('created_at', since).order('created_at', { ascending: true });

      // last_read_at rides along on every poll tick so the widget can keep
      // flipping the visitor's own sent-message ticks from single-grey
      // ("sent") to double-blue ("read") the moment an agent opens the chat —
      // same semantics as the real inbox's StatusIcon.
      return res.status(200).json({ messages: msgs || [], last_read_at: conv.last_read_at || null });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Widget API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Shared upsert-contact + upsert-conversation logic for both text sends and
// media uploads, so both paths create/attach to the exact same thread.
async function upsertVisitorThread(sb, { workspace_id, session_id, name, email, page_url, lastMessage }) {
  const visitorName  = name || 'Website Visitor';
  const visitorEmail = email || null;

  const { data: contact } = await sb.from('contacts').upsert({
    workspace_id, channel: 'website', external_id: session_id,
    full_name: visitorName, email: visitorEmail, lead_source: 'website',
  }, { onConflict: 'workspace_id,channel,external_id' }).select('id').single();

  const { data: conv } = await sb.from('conversations').upsert({
    workspace_id, channel: 'website', external_id: session_id,
    contact_id: contact?.id, status: 'open',
    subject: visitorName + (page_url ? ' — ' + page_url : ''),
    last_message: lastMessage, last_message_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count').single();

  if (conv?.id) {
    await sb.from('conversations').update({
      unread_count: (conv.unread_count || 0) + 1,
      last_message: lastMessage, last_message_at: new Date().toISOString(),
    }).eq('id', conv.id);
  }

  return { conv, error: !conv?.id };
}
