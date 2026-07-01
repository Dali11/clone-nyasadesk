import { createClient } from '@supabase/supabase-js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Telegram, unlike WhatsApp/Messenger/Instagram, doesn't share one Meta app
// across every customer — each workspace creates its OWN bot via @BotFather
// and gets its own token. So instead of matching an incoming webhook to a
// workspace by page/account id, /api/channels/telegram-setup.js registers
// each workspace's webhook URL with a ?workspace_id=... baked in when it
// calls Telegram's setWebhook — we just read it straight back here.
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).send('Missing workspace_id');

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspaceId).eq('channel', 'telegram').maybeSingle();
    if (!cfg?.config?.bot_token) return res.status(200).send('No bot configured');
    const botToken = cfg.config.bot_token;

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg) return res.status(200).send('OK'); // ignore non-message update types for now

    const chatId = msg.chat?.id;
    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
      || msg.from?.username || `Telegram User ${chatId}`;
    const ts = new Date((msg.date || Date.now() / 1000) * 1000).toISOString();

    let body = msg.text || msg.caption || '';
    let attachments = null;

    // Media: fetch the file path via getFile, then re-host in our own
    // chat-media bucket — Telegram's direct file URL embeds the bot token in
    // its path, so we never want that stored in a message row or shown to
    // the client.
    const mediaRef = msg.photo?.length ? msg.photo[msg.photo.length - 1]
      : msg.voice ? msg.voice
      : msg.video ? msg.video
      : null;
    const kind = msg.photo ? 'image' : msg.voice ? 'audio' : msg.video ? 'video' : null;

    if (mediaRef && kind) {
      try {
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${mediaRef.file_id}`);
        const fileJson = await fileRes.json();
        const filePath = fileJson.result?.file_path;
        if (filePath) {
          const tgUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
          const fileFetch = await fetch(tgUrl);
          const buf = Buffer.from(await fileFetch.arrayBuffer());
          const ext = filePath.split('.').pop() || (kind === 'audio' ? 'ogg' : 'bin');
          const path = `${workspaceId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await sb.storage.from('chat-media').upload(path, buf, {
            contentType: fileFetch.headers.get('content-type') || undefined, upsert: false,
          });
          if (!upErr) {
            const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
            attachments = [{ url: pub.publicUrl, type: kind }];
            if (!body) body = kind === 'image' ? '📷 Photo' : kind === 'video' ? '🎥 Video' : '🎤 Voice message';
          }
        }
      } catch (e) {
        console.error('[telegram webhook] media fetch/re-host error:', e);
      }
    }

    if (!body && !attachments) return res.status(200).send('OK');

    const { data: contact } = await sb.from('contacts')
      .upsert({ workspace_id: workspaceId, channel: 'telegram', external_id: String(chatId),
        full_name: fromName, lead_source: 'telegram' },
        { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

    const { data: conv } = await sb.from('conversations')
      .upsert({ workspace_id: workspaceId, channel: 'telegram', external_id: String(chatId),
        contact_id: contact?.id, status: 'open', subject: fromName,
        last_message: body, last_message_at: ts },
        { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

    if (conv?.id) {
      await sb.from('conversations').update({
        unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
      }).eq('id', conv.id);
      await sb.from('messages').upsert({
        conversation_id: conv.id, workspace_id: workspaceId,
        direction: 'inbound', body, channel: 'telegram',
        external_id: String(msg.message_id), sender_name: fromName, sender_id: String(chatId),
        status: 'delivered', created_at: ts,
        ...(attachments ? { attachments } : {}),
      }, { onConflict: 'conversation_id,external_id' });

      if (!conv.assigned_to) {
        await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'telegram', contact });
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
