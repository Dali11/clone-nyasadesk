import { createClient } from '@supabase/supabase-js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

// Merged from the old separate api/webhooks/whatsapp.js, messenger.js,
// instagram.js, telegram.js, email.js files into ONE dynamic route
// (api/webhooks/[channel].js). This is purely to reduce the project's
// serverless function count under Vercel Hobby's 12-function-per-deployment
// cap — behavior for each channel is completely unchanged, and every
// external URL stays exactly the same:
//   /api/webhooks/whatsapp   /api/webhooks/messenger   /api/webhooks/instagram
//   /api/webhooks/telegram   /api/webhooks/email
// (Vercel's [channel] dynamic segment matches each of these and populates
// req.query.channel accordingly — nothing to reconfigure in Meta/Telegram/
// email provider dashboards.)

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─────────────────────────── WhatsApp ───────────────────────────
async function whatsappHandler(req, res, sb) {
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe') {
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const match = cfgs?.find(c => c.config?.verify_token === token);
      if (match || !cfgs?.length) return res.status(200).send(challenge);
      return res.status(403).send('Forbidden');
    }
    return res.status(400).send('Bad Request');
  }

  if (req.method === 'POST') {
    const payload = req.body || {};
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value   = change.value || {};
        const phoneId = value.metadata?.phone_number_id;
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        const cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
        if (!cfg) continue;
        const workspaceId = cfg.workspace_id;

        for (const msg of value.messages || []) {
          const from        = msg.from;
          const msgId       = msg.id;
          const contactName = value.contacts?.find(c => c.wa_id === from)?.profile?.name || from;
          const ts          = new Date(parseInt(msg.timestamp || Date.now()/1000) * 1000).toISOString();

          let body = msg.text?.body || `[${msg.type}]`;
          let attachments = null;
          const mediaKindMap = { image: 'image', video: 'video', audio: 'audio' };
          const mediaKind = mediaKindMap[msg.type];
          if (mediaKind && msg[msg.type]?.id) {
            try {
              const accessToken = cfg.config?.access_token;
              const mediaId = msg[msg.type].id;
              const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const metaJson = await metaRes.json();
              if (metaJson.url) {
                const fileRes = await fetch(metaJson.url, { headers: { Authorization: `Bearer ${accessToken}` } });
                const buf = await fileRes.arrayBuffer();
                const ext = (metaJson.mime_type || '').split('/')[1]?.split(';')[0] || 'bin';
                const path = `${workspaceId}/inbound/${Date.now()}-${mediaId}.${ext}`;
                await sb.storage.from('chat-media').upload(path, Buffer.from(buf), {
                  contentType: metaJson.mime_type || undefined, upsert: false,
                });
                const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
                attachments = [{ url: pub.publicUrl, type: mediaKind, mime: metaJson.mime_type }];
                body = msg[msg.type]?.caption || (mediaKind === 'image' ? '📷 Photo' : mediaKind === 'video' ? '🎥 Video' : '🎤 Voice message');
              }
            } catch (mediaErr) {
              console.error('WhatsApp media fetch error:', mediaErr);
            }
          }

          const { data: contact } = await sb.from('contacts')
            .upsert({ workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
              full_name: contactName, phone: '+' + from, lead_source: 'whatsapp' },
              { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

          const { data: conv } = await sb.from('conversations')
            .upsert({ workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
              contact_id: contact?.id, status: 'open', subject: contactName,
              last_message: body, last_message_at: ts },
              { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

          if (conv?.id) {
            await sb.from('conversations').update({
              unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
            }).eq('id', conv.id);
            await sb.from('messages').upsert({
              conversation_id: conv.id, workspace_id: workspaceId,
              direction: 'inbound', body, channel: 'whatsapp',
              external_id: msgId, sender_name: contactName, sender_id: from,
              status: 'delivered', created_at: ts,
              ...(attachments ? { attachments } : {}),
            }, { onConflict: 'conversation_id,external_id' });

            if (!conv.assigned_to) {
              await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'whatsapp', contact });
            }
          }
        }

        for (const status of value.statuses || []) {
          await sb.from('messages').update({ status: status.status })
            .eq('external_id', status.id).eq('workspace_id', workspaceId);
        }
      }
    }
    return res.status(200).send('OK');
  }
  return res.status(405).send('Method Not Allowed');
}

// ─────────────────────────── Messenger & Instagram (shared Meta shape) ───────────────────────────
async function metaMessagingHandler(req, res, sb, channel, { idField, verifyChannel }) {
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe') {
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', verifyChannel);
      const match = cfgs?.find(c => c.config?.verify_token === token);
      if (match || !cfgs?.length) return res.status(200).send(challenge);
      return res.status(403).send('Forbidden');
    }
    return res.status(400).send('Bad Request');
  }

  if (req.method === 'POST') {
    const payload = req.body || {};
    for (const entry of payload.entry || []) {
      const acctId = entry.id;
      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', channel);
      const cfg = cfgs?.find(c => c.config?.[idField] === acctId);
      if (!cfg) continue;
      const workspaceId = cfg.workspace_id;

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;

        if (event.delivery) {
          const mids = event.delivery.mids || [];
          if (mids.length) {
            await sb.from('messages').update({ status: 'delivered' })
              .in('external_id', mids).eq('workspace_id', workspaceId).neq('status', 'read');
          }
          continue;
        }

        if (event.read) {
          const watermarkTs = new Date(event.read.watermark).toISOString();
          const { data: conv } = await sb.from('conversations')
            .select('id').eq('workspace_id', workspaceId).eq('channel', channel)
            .eq('external_id', senderId).maybeSingle();
          if (conv?.id) {
            await sb.from('messages').update({ status: 'read' })
              .eq('conversation_id', conv.id).eq('direction', 'outbound')
              .lte('created_at', watermarkTs);
          }
          continue;
        }

        if (!event.message) continue;
        const msgId = event.message?.mid;
        const ts    = new Date(event.timestamp || Date.now()).toISOString();

        const metaAttachment = event.message?.attachments?.[0];
        const attachTypeMap = { image: 'image', video: 'video', audio: 'audio' };
        let body = event.message?.text || '[attachment]';
        let attachments = null;
        if (metaAttachment && attachTypeMap[metaAttachment.type] && metaAttachment.payload?.url) {
          attachments = [{ url: metaAttachment.payload.url, type: attachTypeMap[metaAttachment.type] }];
          body = metaAttachment.type === 'image' ? '📷 Photo' : metaAttachment.type === 'video' ? '🎥 Video' : '🎤 Voice message';
        }

        const labelPrefix = channel === 'messenger' ? 'Messenger' : 'Instagram';
        const { data: contact } = await sb.from('contacts')
          .upsert({ workspace_id: workspaceId, channel, external_id: senderId,
            full_name: `${labelPrefix} User ${senderId?.slice(-4)}`, lead_source: channel },
            { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

        const { data: conv } = await sb.from('conversations')
          .upsert({ workspace_id: workspaceId, channel, external_id: senderId,
            contact_id: contact?.id, status: 'open', subject: `${labelPrefix}: ${senderId?.slice(-6)}`,
            last_message: body, last_message_at: ts },
            { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

        if (conv?.id) {
          await sb.from('conversations').update({
            unread_count: (conv.unread_count || 0) + 1, last_message: body, last_message_at: ts
          }).eq('id', conv.id);
          await sb.from('messages').upsert({
            conversation_id: conv.id, workspace_id: workspaceId,
            direction: 'inbound', body, channel,
            external_id: msgId, sender_id: senderId, status: 'delivered', created_at: ts,
            ...(attachments ? { attachments } : {}),
          }, { onConflict: 'conversation_id,external_id' });

          if (!conv.assigned_to) {
            await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel, contact });
          }
        }
      }
    }
    return res.status(200).send('OK');
  }
  return res.status(405).send('Method Not Allowed');
}

const messengerHandler = (req, res, sb) => metaMessagingHandler(req, res, sb, 'messenger', { idField: 'page_id', verifyChannel: 'messenger' });
const instagramHandler = (req, res, sb) => metaMessagingHandler(req, res, sb, 'instagram', { idField: 'ig_user_id', verifyChannel: 'instagram' });

// ─────────────────────────── Telegram ───────────────────────────
async function telegramHandler(req, res, sb) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const workspaceId = req.query.workspace_id;
  if (!workspaceId) return res.status(400).send('Missing workspace_id');

  const { data: cfg } = await sb.from('channel_configs').select('*')
    .eq('workspace_id', workspaceId).eq('channel', 'telegram').maybeSingle();
  if (!cfg?.config?.bot_token) return res.status(200).send('No bot configured');
  const botToken = cfg.config.bot_token;

  const update = req.body || {};
  const msg = update.message || update.edited_message;
  if (!msg) return res.status(200).send('OK');

  const chatId = msg.chat?.id;
  const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
    || msg.from?.username || `Telegram User ${chatId}`;
  const ts = new Date((msg.date || Date.now() / 1000) * 1000).toISOString();

  let body = msg.text || msg.caption || '';
  let attachments = null;

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
}

// ─────────────────────────── Email ───────────────────────────
async function emailHandler(req, res, sb) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const body = req.body || {};

  const from    = body.sender || body.from || body['envelope-from'] || '';
  const subject = body.subject || body.Subject || '(no subject)';
  const text    = body['body-plain'] || body.text || body.plain || (typeof body.html === 'string' ? body.html.replace(/<[^>]+>/g,'') : '') || '';
  const msgId   = body['Message-Id'] || body.message_id || `email-${Date.now()}`;
  const to      = body.recipient || body.to || '';

  if (!from) return res.status(400).json({ error: 'No sender' });

  const fromEmail = from.match(/<(.+)>/)?.[1] || from.trim();
  const fromName  = from.replace(/<.+>/, '').replace(/"/g,'').trim() || fromEmail;

  const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'email');
  const cfg = cfgs?.find(c => to.includes(c.config?.email)) || cfgs?.[0];
  if (!cfg) return res.status(200).send('No matching workspace');

  const workspaceId = cfg.workspace_id;

  const { data: contact } = await sb.from('contacts')
    .upsert({ workspace_id: workspaceId, channel: 'email', external_id: fromEmail,
      full_name: fromName, email: fromEmail, lead_source: 'email' },
      { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

  const { data: conv } = await sb.from('conversations')
    .upsert({ workspace_id: workspaceId, channel: 'email', external_id: fromEmail,
      contact_id: contact?.id, status: 'open', subject,
      last_message: text.slice(0, 200), last_message_at: new Date().toISOString() },
      { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

  if (conv?.id) {
    await sb.from('conversations').update({
      unread_count: (conv.unread_count || 0) + 1, subject,
      last_message: text.slice(0, 200), last_message_at: new Date().toISOString(),
    }).eq('id', conv.id);
    await sb.from('messages').upsert({
      conversation_id: conv.id, workspace_id: workspaceId,
      direction: 'inbound', body: text, channel: 'email',
      external_id: msgId, sender_name: fromName, sender_id: fromEmail, status: 'delivered',
    }, { onConflict: 'conversation_id,external_id' });

    if (!conv.assigned_to) {
      await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'email', contact });
    }
  }
  return res.status(200).send('OK');
}

// ─────────────────────────── Dispatcher ───────────────────────────
export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { channel } = req.query;

    switch (channel) {
      case 'whatsapp':  return await whatsappHandler(req, res, sb);
      case 'messenger': return await messengerHandler(req, res, sb);
      case 'instagram': return await instagramHandler(req, res, sb);
      case 'telegram':  return await telegramHandler(req, res, sb);
      case 'email':     return await emailHandler(req, res, sb);
      default: return res.status(404).json({ error: `Unknown webhook channel: ${channel}` });
    }
  } catch (err) {
    console.error(`[webhooks/${req.query?.channel}] error:`, err);
    return res.status(500).json({ error: err.message });
  }
}
