// api/_lib/providers/whatsapp-360dialog.js
// WhatsApp via 360dialog BSP — implements the MessagingProvider interface.
//
// 360dialog is an official Meta BSP. Their API uses the same JSON shape as
// the WhatsApp Cloud API, but with simpler auth (D360-API-KEY header) and
// a different base URL. Because 360dialog is already Meta-approved, customers
// who connect through Nyasadesk do NOT need Meta App Review or Business
// Verification — 360dialog handles all of that.
//
// Connection modes:
//   1. 'partner' — Nyasadesk is a 360dialog Partner; the Embedded Signup
//      launches from Nyasadesk's app using a Partner config_id. The
//      D360-API-KEY is returned automatically. (Requires Partner credentials.)
//   2. 'manual' — customer pastes their D360-API-KEY + phone number from
//      the 360dialog Hub. Works immediately, no Partner setup needed.
//
// Part of NyasaDesk's provider abstraction layer.

import { MessagingProvider, persistInboundMessage } from './base.js';

const D360_BASE = 'https://waba-v2.360dialog.io';

export class WhatsApp360DialogProvider extends MessagingProvider {
  get channelType() { return 'whatsapp'; }
  get providerName() { return '360dialog (WhatsApp BSP)'; }

  /**
   * Connect WhatsApp via 360dialog.
   * authData can be:
   *   { mode: 'manual', d360_api_key, phone_number, workspace_id }
   *   { mode: 'partner', partner_config_id, ...embedded_signup_result }
   */
  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;

    if (authData.mode === 'manual') {
      return await this._connectManual(workspaceId, authData, ctx);
    } else if (authData.mode === 'partner') {
      return await this._connectPartner(workspaceId, authData, ctx);
    }
    throw new Error('Unknown connection mode: ' + authData.mode);
  }

  // ── Manual: customer pastes D360-API-KEY from 360dialog Hub ───────────
  async _connectManual(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { d360_api_key, phone_number } = authData;

    if (!d360_api_key) {
      throw new Error('Missing 360dialog API key');
    }

    // Verify the API key works by fetching the phone number details
    let phoneNumber = phone_number || null;
    let businessName = null;
    let wabaId = null;

    try {
      const verifyRes = await fetch(`${D360_BASE}/whatsapp_business_account`, {
        headers: { 'D360-API-KEY': d360_api_key },
      });
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        wabaId = verifyData.id || verifyData.waba_id || null;
        if (verifyData.display_phone_number) phoneNumber = verifyData.display_phone_number;
        if (verifyData.name) businessName = verifyData.name;
      }
    } catch (e) {
      // Non-fatal — the key may still work for sending/receiving
      console.error('[360dialog] verify warning:', e.message);
    }

    const config = {
      d360_api_key,
      phone_number: phoneNumber,
      business_name: businessName,
      waba_id: wabaId,
      provider: '360dialog',
      connected_via: 'manual',
      connected_at: new Date().toISOString(),
      webhook_configured: false,
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return {
      config: data,
      phone_number: phoneNumber,
      business_name: businessName,
      webhook_url: `https://nyasadesk1.vercel.app/api/webhooks/whatsapp?workspace_id=${workspaceId}`,
      webhook_instructions: 'Set this URL as your webhook in 360dialog Hub -> Webhook URL',
    };
  }

  // ── Partner: 360dialog Embedded Signup via Nyasadesk's Partner account ─
  async _connectPartner(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { d360_api_key, phone_number, business_name, waba_id } = authData;

    if (!d360_api_key) {
      throw new Error('No D360-API-KEY returned from Embedded Signup');
    }

    const config = {
      d360_api_key,
      phone_number: phone_number || null,
      business_name: business_name || null,
      waba_id: waba_id || null,
      provider: '360dialog',
      connected_via: 'partner_embedded_signup',
      connected_at: new Date().toISOString(),
      webhook_configured: true,
    };

    // Auto-set the webhook URL via 360dialog's API
    const webhookUrl = `https://nyasadesk1.vercel.app/api/webhooks/whatsapp?workspace_id=${workspaceId}`;
    try {
      await fetch(`${D360_BASE}/webhooks`, {
        method: 'POST',
        headers: { 'D360-API-KEY': d360_api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
    } catch (e) {
      console.error('[360dialog] webhook setup warning:', e.message);
      config.webhook_configured = false;
    }

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data, phone_number, business_name: business_name };
  }

  // ── Send an outbound message ───────────────────────────────────────────
  async sendMessage(config, message, ctx) {
    const { d360_api_key } = config;
    const { to, text, media } = message;

    if (!d360_api_key) {
      throw new Error('WhatsApp channel not configured — missing 360dialog API key');
    }

    const WA_TYPE = { image: 'image', video: 'video', audio: 'audio' };
    let payload;

    if (media && WA_TYPE[media.type]) {
      const waType = WA_TYPE[media.type];
      payload = {
        messaging_product: 'whatsapp', recipient_type: 'individual', to, type: waType,
        [waType]: { link: media.url, ...(waType !== 'audio' && text ? { caption: text } : {}) },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to, type: 'text', text: { body: text },
      };
    }

    const r = await fetch(`${D360_BASE}/messages`, {
      method: 'POST',
      headers: { 'D360-API-KEY': d360_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || '360dialog API error');

    return { ok: true, external_id: json.messages?.[0]?.id };
  }

  // ── Process inbound webhook ────────────────────────────────────────────
  // 360dialog uses the SAME webhook payload shape as the WhatsApp Cloud API.
  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // ── Inbound messages ────────────────────────────────────────────
        for (const msg of value.messages || []) {
          const from = msg.from;
          const msgId = msg.id;
          const contactName = value.contacts?.find(c => c.wa_id === from)?.profile?.name || from;
          const ts = new Date(parseInt(msg.timestamp || Date.now() / 1000) * 1000).toISOString();

          let body = msg.text?.body || `[${msg.type}]`;
          let attachments = null;
          const mediaKindMap = { image: 'image', video: 'video', audio: 'audio' };
          const mediaKind = mediaKindMap[msg.type];

          if (mediaKind && msg[msg.type]?.id) {
            try {
              const mediaResult = await this.fetchMedia(msg[msg.type].id, config, ctx);
              if (mediaResult?.url) {
                attachments = [mediaResult];
                body = msg[msg.type]?.caption
                  || (mediaKind === 'image' ? '📷 Photo' : mediaKind === 'video' ? '🎥 Video' : '🎤 Voice message');
              }
            } catch (mediaErr) {
              console.error('[360dialog] media fetch error:', mediaErr);
            }
          }

          // Click-to-WhatsApp ad attribution (first-touch)
          const { data: existingContact } = await sb.from('contacts')
            .select('lead_source, ad_attribution')
            .eq('workspace_id', workspaceId).eq('channel', 'whatsapp').eq('external_id', from)
            .maybeSingle();

          const adReferral = msg.referral || null;
          const leadSource = existingContact?.lead_source === 'whatsapp_ad'
            ? 'whatsapp_ad' : (adReferral ? 'whatsapp_ad' : 'whatsapp');
          let adAttribution = existingContact?.ad_attribution || null;
          if (adReferral && !adAttribution) {
            adAttribution = {
              source_type: adReferral.source_type || 'ad',
              source_id: adReferral.source_id || null,
              source_url: adReferral.source_url || null,
              headline: adReferral.headline || null,
              body: adReferral.body || null,
              media_type: adReferral.media_type || null,
              // The actual ad creative -- Meta sends whichever of these applies
              // (image ads carry image_url, video ads carry video_url + a still
              // thumbnail_url). This is what lets us actually SHOW the specific ad,
              // not just its text.
              image_url: adReferral.image_url || null,
              video_url: adReferral.video_url || null,
              thumbnail_url: adReferral.thumbnail_url || null,
              ctwa_clid: adReferral.ctwa_clid || null,
              captured_at: ts,
            };
          }

          const { conversation: conv } = await persistInboundMessage(sb, workspaceId, {
            channel: 'whatsapp', externalId: from, contactName, phone: '+' + from,
            body, attachments, externalMsgId: msgId, senderId: from, senderName: contactName,
            timestamp: ts, leadSource, adAttribution,
          });

          if (conv?.id && !conv.assigned_to) {
            await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'whatsapp',
              contact: { lead_source: leadSource } });
          }
        }

        // ── Delivery/read status updates ────────────────────────────────
        for (const status of value.statuses || []) {
          await sb.from('messages').update({ status: status.status })
            .eq('external_id', status.id).eq('workspace_id', workspaceId);
        }
      }
    }
  }

  // ── Webhook verification (GET handshake) ───────────────────────────────
  async verifyWebhook(req, configs) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
      const match = configs?.find(c => c.config?.verify_token === token);
      if (match || !configs?.length) return { challenge };
    }
    return null;
  }

  // ── Fetch and re-host media from 360dialog's CDN ───────────────────────
  async fetchMedia(mediaId, config, ctx) {
    const { sb, workspaceId } = ctx;
    const apiKey = config.d360_api_key;

    // 1. Get the media URL from 360dialog
    const metaRes = await fetch(`${D360_BASE}/media/${mediaId}`, {
      headers: { 'D360-API-KEY': apiKey },
    });
    const metaJson = await metaRes.json();
    if (!metaJson.url) return null;

    // 2. Download the media
    const fileRes = await fetch(metaJson.url, {
      headers: { 'D360-API-KEY': apiKey },
    });
    const buf = await fileRes.arrayBuffer();

    // 3. Re-host in our own Supabase bucket
    const ext = (metaJson.mime_type || '').split('/')[1]?.split(';')[0] || 'bin';
    const path = `${workspaceId}/inbound/${Date.now()}-${mediaId}.${ext}`;
    await sb.storage.from('chat-media').upload(path, Buffer.from(buf), {
      contentType: metaJson.mime_type || undefined, upsert: false,
    });
    const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);

    const mimeToType = { image: 'image', video: 'video', audio: 'audio' };
    const type = mimeToType[metaJson.mime_type?.split('/')[0]] || 'file';

    return { url: pub.publicUrl, type, mime: metaJson.mime_type };
  }

  async disconnect(config) {
    // Just clear the config — webhook can remain in 360dialog Hub.
  }
}
