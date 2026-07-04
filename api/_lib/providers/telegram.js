// api/_lib/providers/telegram.js
// Telegram Bot API provider — implements MessagingProvider interface.

import { MessagingProvider, persistInboundMessage } from './base.js';

const TG_API = 'https://api.telegram.org/bot';

export class TelegramProvider extends MessagingProvider {
  get channelType() { return 'telegram'; }
  get providerName() { return 'Telegram Bot API'; }

  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { bot_token } = authData;

    if (!bot_token) throw new Error('Missing bot_token');

    // Verify the token
    const meRes = await fetch(`${TG_API}${bot_token}/getMe`);
    const meJson = await meRes.json();
    if (!meJson.ok) throw new Error('Invalid bot token — check it was copied from @BotFather');

    // Register webhook
    const webhookUrl = `https://nyasadesk1.vercel.app/api/webhooks/telegram?workspace_id=${encodeURIComponent(workspaceId)}`;
    const hookRes = await fetch(`${TG_API}${bot_token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] }),
    });
    const hookJson = await hookRes.json();
    if (!hookJson.ok) throw new Error(hookJson.description || 'Telegram rejected webhook registration');

    const config = {
      bot_token,
      bot_username: meJson.result?.username || null,
      bot_name: meJson.result?.first_name || null,
      connected_via: 'bot_token',
      connected_at: new Date().toISOString(),
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId, channel: 'telegram', enabled: true, config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data, bot_username: meJson.result?.username };
  }

  async sendMessage(config, message, ctx) {
    const { bot_token } = config;
    const { to, text, media } = message;

    let method = 'sendMessage';
    let body = { chat_id: to, text };

    if (media?.type === 'image') { method = 'sendPhoto'; body = { chat_id: to, photo: media.url, ...(text ? { caption: text } : {}) }; }
    else if (media?.type === 'video') { method = 'sendVideo'; body = { chat_id: to, video: media.url, ...(text ? { caption: text } : {}) }; }
    else if (media?.type === 'audio') { method = 'sendVoice'; body = { chat_id: to, voice: media.url }; }

    const r = await fetch(`${TG_API}${bot_token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.ok) throw new Error(json.description || 'Telegram send failed');

    return { ok: true, external_id: String(json.result?.message_id || '') };
  }

  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;
    const msg = payload.message || payload.edited_message;
    if (!msg) return;

    const chatId = String(msg.chat?.id);
    const fromId = String(msg.from?.id);
    const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || 'Telegram User';
    const msgId = String(msg.message_id);
    const ts = new Date((msg.date || Date.now() / 1000) * 1000).toISOString();

    let body = msg.text || '';
    let attachments = null;

    if (msg.photo) {
      // Telegram sends photo as array of sizes — get the largest
      const photo = msg.photo[msg.photo.length - 1];
      const mediaResult = await this.fetchMedia(photo.file_id, config, ctx);
      if (mediaResult) {
        attachments = [mediaResult];
        body = msg.caption || '📷 Photo';
      }
    } else if (msg.video) {
      const mediaResult = await this.fetchMedia(msg.video.file_id, config, ctx);
      if (mediaResult) {
        attachments = [mediaResult];
        body = msg.caption || '🎥 Video';
      }
    } else if (msg.voice) {
      const mediaResult = await this.fetchMedia(msg.voice.file_id, config, ctx);
      if (mediaResult) {
        attachments = [mediaResult];
        body = '🎤 Voice message';
      }
    } else if (msg.document) {
      const mediaResult = await this.fetchMedia(msg.document.file_id, config, ctx);
      if (mediaResult) {
        attachments = [mediaResult];
        body = msg.caption || `📎 ${msg.document.file_name || 'File'}`;
      }
    }

    if (!body && !attachments) body = '[message]';

    const { conversation: conv } = await persistInboundMessage(sb, workspaceId, {
      channel: 'telegram', externalId: chatId, contactName: fromName,
      body, attachments, externalMsgId: msgId, senderId: fromId, senderName: fromName,
      timestamp: ts, leadSource: 'telegram',
    });

    if (conv?.id && !conv.assigned_to) {
      await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'telegram' });
    }
  }

  async verifyWebhook(req, configs) {
    // Telegram doesn't use a GET handshake — it uses the setWebhook API call
    return null;
  }

  async fetchMedia(fileId, config, ctx) {
    const { sb, workspaceId } = ctx;
    const botToken = config.bot_token;

    // 1. Get file path from Telegram
    const fileRes = await fetch(`${TG_API}${botToken}/getFile?file_id=${fileId}`);
    const fileJson = await fileRes.json();
    if (!fileJson.ok) return null;

    // 2. Download the file (Telegram URLs embed the bot token, so must re-host)
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`;
    const downloadRes = await fetch(fileUrl);
    const buf = await downloadRes.arrayBuffer();

    // 3. Re-host in our Supabase bucket
    const ext = fileJson.result.file_path?.split('.').pop() || 'bin';
    const path = `${workspaceId}/inbound/${Date.now()}-${fileId}.${ext}`;
    await sb.storage.from('chat-media').upload(path, Buffer.from(buf), {
      contentType: downloadRes.headers.get('content-type') || undefined, upsert: false,
    });
    const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);

    const mimeToType = { image: 'image', video: 'video', audio: 'audio' };
    const type = mimeToType[downloadRes.headers.get('content-type')?.split('/')[0]] || 'file';

    return { url: pub.publicUrl, type, mime: downloadRes.headers.get('content-type') };
  }

  async disconnect(config) {
    if (config.bot_token) {
      try {
        await fetch(`${TG_API}${config.bot_token}/deleteWebhook`, { method: 'POST' });
      } catch (e) { /* non-fatal */ }
    }
  }
}
