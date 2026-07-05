// api/_lib/providers/whatsapp-wasapflow.js
// WhatsApp via WasapFlow Bridge BSP — seamless white-label integration.
//
// WasapFlow Bridge is a Meta-Verified Tech Provider. Nyasadesk connects as a
// partner — no Meta App Review, no Business Verification, no Tech Provider
// application. Customers click "Connect WhatsApp" → WasapFlow's Embedded Signup
// (powered by THEIR Meta app) → pick number → done. Everything routes through
// WasapFlow's REST API:
//   1. Embedded Signup config fetched from WasapFlow at runtime (not our Meta app)
//   2. OAuth code sent to WasapFlow for server-side token exchange
//   3. Messages sent/received through WasapFlow's Bridge API
//   4. Webhooks from WasapFlow deliver inbound messages + status updates
//
// The customer NEVER sees WasapFlow, never creates a WasapFlow account, never
// pastes any API key. Fully white-labeled through Nyasadesk.
//
// Required env vars (set once by Nyasadesk admin):
//   WASAPFLOW_PARTNER_KEY   — Partner API key (wf_live_...)
//   WASAPFLOW_WEBHOOK_SECRET — Webhook signing secret (whsec_...) for HMAC verification

import { MessagingProvider, persistInboundMessage } from './base.js';

const BRIDGE_API = 'https://officialapi.wasapflow.com/bridge/v1';

export class WhatsAppWasapFlowProvider extends MessagingProvider {
  get channelType() { return 'whatsapp'; }
  get providerName() { return 'WasapFlow Bridge'; }

  // ── Headers for every Bridge API call ──────────────────────────────────
  _headers(wabaId) {
    const h = {
      'Content-Type': 'application/json',
      'x-partner-key': process.env.WASAPFLOW_PARTNER_KEY,
    };
    if (wabaId) h['x-waba-id'] = wabaId;
    return h;
  }

  // ── Connect: exchange Embedded Signup code for WABA registration ───────
  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;

    if (authData.mode === 'embedded_signup') {
      return await this._connectEmbeddedSignup(workspaceId, authData, ctx);
    } else if (authData.mode === 'manual') {
      return await this._connectManual(workspaceId, authData, ctx);
    }
    throw new Error('Unknown connection mode: ' + authData.mode);
  }

  // ── Embedded Signup: exchange code → register WABA via WasapFlow ───────
  async _connectEmbeddedSignup(workspaceId, { code, phone_number_id }, ctx) {
    const { sb } = ctx;
    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey) throw new Error('WASAPFLOW_PARTNER_KEY not configured');

    // 1. Send the OAuth code (from FB.login's JS SDK callback — see Settings.jsx)
    //    to WasapFlow for server-side exchange + WABA registration.
    //    connection_mode: 'coexistence' matches the Embedded Signup config we
    //    request in /api/channels?action=signup-config — must match or WasapFlow
    //    rejects the code exchange.
    const regRes = await fetch(`${BRIDGE_API}/clients/register-from-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-partner-key': partnerKey },
      body: JSON.stringify({ code, connection_mode: 'coexistence', display_name: 'Nyasadesk' }),
    });
    const regData = await regRes.json();
    if (!regRes.ok || !regData.success) {
      throw new Error(regData.error?.message || regData.message || regData.error || 'WasapFlow registration failed');
    }

    // Real response shape is { success, client: { waba_id, phone_number_id, display_name, ... } }
    // (previously read regData.waba_id directly — always undefined, silently saved a broken config)
    const client = regData.client || {};
    const wabaId = client.waba_id;
    const phoneNumberId = phone_number_id || client.phone_number_id;
    const phoneNumber = client.phone_number || null;
    const businessName = client.display_name || null;

    // 2. Fetch phone numbers if not auto-selected
    let finalPhoneId = phoneNumberId;
    let finalPhoneNumber = phoneNumber;
    let finalBusinessName = businessName;

    if (!finalPhoneId && wabaId) {
      try {
        const phonesRes = await fetch(`${BRIDGE_API}/wabas/${wabaId}/phone-numbers`, {
          headers: this._headers(wabaId),
        });
        const phonesData = await phonesRes.json();
        if (phonesData.data?.length) {
          finalPhoneId = phonesData.data[0].id;
          finalPhoneNumber = phonesData.data[0].display_phone_number;
          finalBusinessName = phonesData.data[0].verified_name;
        }
      } catch (e) { /* non-fatal */ }
    }

    // 3. Persist the config
    const config = {
      provider: 'wasapflow',
      waba_id: wabaId,
      phone_number_id: finalPhoneId,
      phone_number: finalPhoneNumber,
      business_name: finalBusinessName,
      connected_via: 'embedded_signup',
      connected_at: new Date().toISOString(),
      wasapflow_client_id: wabaId || null,
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data, phone_number: finalPhoneNumber, business_name: finalBusinessName };
  }

  // ── Manual: register an existing WABA by ID (for migrations) ───────────
  async _connectManual(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { waba_id, phone_number_id } = authData;
    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;

    if (!waba_id) throw new Error('waba_id is required for WasapFlow manual connection');

    // Register the existing WABA with WasapFlow
    const regRes = await fetch(`${BRIDGE_API}/clients/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-partner-key': partnerKey },
      body: JSON.stringify({ waba_id, phone_number_id, access_token: authData.access_token, display_name: 'Nyasadesk' }),
    });
    const regData = await regRes.json();
    if (!regRes.ok || !regData.success) {
      throw new Error(regData.error?.message || regData.message || regData.error || 'WasapFlow registration failed');
    }

    // Fetch phone number details
    let phoneNumber = null, businessName = null;
    if (phone_number_id) {
      try {
        const phoneRes = await fetch(`${BRIDGE_API}/wabas/${waba_id}/phone-numbers`, {
          headers: this._headers(waba_id),
        });
        const phoneData = await phoneRes.json();
        const match = phoneData.data?.find(p => p.id === phone_number_id);
        if (match) {
          phoneNumber = match.display_phone_number;
          businessName = match.verified_name;
        }
      } catch (e) { /* non-fatal */ }
    }

    const config = {
      provider: 'wasapflow',
      waba_id,
      phone_number_id: phone_number_id || regData.phone_number_id,
      phone_number: phoneNumber,
      business_name: businessName,
      connected_via: 'manual',
      connected_at: new Date().toISOString(),
      wasapflow_client_id: waba_id || null,
    };

    const { data, error } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' }).select('*').single();

    if (error) throw new Error(error.message);
    return { config: data, phone_number: phoneNumber, business_name: businessName };
  }

  // ── Send an outbound message via WasapFlow Bridge API ──────────────────
  async sendMessage(config, message, ctx) {
    const { waba_id } = config;
    const { to, text, media } = message;

    if (!waba_id) throw new Error('WasapFlow WhatsApp not configured — missing waba_id');

    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey) throw new Error('WASAPFLOW_PARTNER_KEY not configured');

    // WasapFlow Bridge API: POST /messages/send
    const body = { to };

    if (media) {
      const typeMap = { image: 'image', video: 'video', audio: 'audio', document: 'document' };
      const wfType = typeMap[media.type] || 'document';
      body.type = wfType;
      body[wfType] = {
        link: media.url,
        ...(wfType !== 'audio' && text ? { caption: text } : {}),
      };
    } else {
      body.type = 'text';
      body.text = { body: text };
    }

    const r = await fetch(`${BRIDGE_API}/messages/send`, {
      method: 'POST',
      headers: this._headers(waba_id),
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok || !json.success) {
      throw new Error(json.message || json.error?.message || json.error || 'WasapFlow send failed');
    }

    return { ok: true, external_id: json.message_id || json.id };
  }

  // ── Process inbound webhook from WasapFlow ─────────────────────────────
  // WasapFlow sends normalized webhook events:
  //   { event: 'message.received', waba_id, data: { from, to, message_id, type, text, ... } }
  //   { event: 'message.status', waba_id, data: { message_id, status, ... } }
  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;
    const event = payload.event;

    // ── Inbound message ──────────────────────────────────────────────────
    if (event === 'message.received') {
      const data = payload.data || payload;
      const from = data.from || data.sender;
      const msgId = data.message_id || data.id;
      const ts = data.timestamp
        ? new Date(typeof data.timestamp === 'number' ? data.timestamp * 1000 : data.timestamp).toISOString()
        : new Date().toISOString();
      const contactName = data.contact_name || data.sender_name || from;

      let body = data.text?.body || data.text || '';
      let attachments = null;

      // Handle media types
      const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
      for (const mt of mediaTypes) {
        if (data[mt] || data.type === mt) {
          const mediaData = data[mt] || {};
          if (mediaData.url || mediaData.link) {
            attachments = [{
              url: mediaData.url || mediaData.link,
              type: mt === 'sticker' ? 'image' : mt,
              mime: mediaData.mime_type || mediaData.mime,
            }];
            body = mediaData.caption
              || (mt === 'image' ? '📷 Photo' : mt === 'video' ? '🎥 Video' : mt === 'audio' ? '🎤 Voice message' : '📎 File');
          }
          break;
        }
      }

      // Ad attribution (Click-to-WhatsApp ads)
      const { data: existingContact } = await sb.from('contacts')
        .select('lead_source, ad_attribution')
        .eq('workspace_id', workspaceId).eq('channel', 'whatsapp').eq('external_id', from)
        .maybeSingle();

      const adReferral = data.referral || data.context || null;
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

    // ── Status updates (delivered, read, sent, failed) ──────────────────
    if (event === 'message.status' || event === 'message.delivery') {
      const data = payload.data || payload;
      const msgId = data.message_id || data.id;
      const status = data.status || data.delivery_status;

      if (msgId && status) {
        const statusMap = {
          sent: 'sent', delivered: 'delivered', read: 'read',
          failed: 'failed', pending: 'sent',
        };
        const internalStatus = statusMap[status] || status;
        await sb.from('messages').update({ status: internalStatus })
          .eq('external_id', msgId).eq('workspace_id', workspaceId);
      }
    }
  }

  // ── Webhook verification (GET handshake) ───────────────────────────────
  async verifyWebhook(req, configs) {
    const mode = req.query['hub.mode'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' || challenge) {
      return { challenge: challenge || '' };
    }
    return null;
  }

  // ── Verify webhook HMAC signature ──────────────────────────────────────
  verifySignature(rawBody, signatureHeader) {
    const secret = process.env.WASAPFLOW_WEBHOOK_SECRET;
    if (!secret) return true; // skip if not configured (dev mode)
    if (!signatureHeader) return false;

    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signatureHeader;
  }

  // ── Fetch and re-host media from WasapFlow ─────────────────────────────
  async fetchMedia(mediaId, config, ctx) {
    const { sb, workspaceId } = ctx;
    const wabaId = config.waba_id;

    const res = await fetch(`${BRIDGE_API}/media/${mediaId}`, {
      headers: this._headers(wabaId),
    });
    const json = await res.json();
    if (!json.url && !json.link) return null;

    const mediaUrl = json.url || json.link;
    const fileRes = await fetch(mediaUrl);
    const buf = await fileRes.arrayBuffer();

    const ext = (json.mime_type || '').split('/')[1]?.split(';')[0] || 'bin';
    const path = `${workspaceId}/inbound/${Date.now()}-${mediaId}.${ext}`;
    await sb.storage.from('chat-media').upload(path, Buffer.from(buf), {
      contentType: json.mime_type || undefined, upsert: false,
    });
    const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);

    const mimeToType = { image: 'image', video: 'video', audio: 'audio' };
    const type = mimeToType[json.mime_type?.split('/')[0]] || 'file';
    return { url: pub.publicUrl, type, mime: json.mime_type };
  }

  // ── Get Embedded Signup config (called by frontend to launch FB.login) ─
  static async getEmbeddedSignupConfig() {
    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey) throw new Error('WASAPFLOW_PARTNER_KEY not configured');

    const res = await fetch(`${BRIDGE_API}/embedded-signup/config`, {
      headers: { 'x-partner-key': partnerKey },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to get Embedded Signup config');
    }
    return {
      app_id: data.app_id,
      config_id: data.config_id,
      connection_mode: data.connection_mode,
      extras: data.extras,
    };
  }

  // ── Disconnect: unregister the WABA from WasapFlow ─────────────────────
  async disconnect(config) {
    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey || !config.waba_id) return;

    try {
      await fetch(`${BRIDGE_API}/clients/${config.wasapflow_client_id || config.waba_id}`, {
        method: 'DELETE',
        headers: { 'x-partner-key': partnerKey },
      });
    } catch (e) { /* non-fatal */ }
  }
}
