// api/_lib/providers/whatsapp.js
// WhatsApp Cloud API provider — implements the MessagingProvider interface.
// Supports two connection modes:
//   1. 'embedded_signup' — one-click via Meta's Embedded Signup (FB.login)
//   2. 'manual' — user pastes access_token + phone_number_id directly
//
// Part of NyasaDesk's provider abstraction layer. The rest of the app
// never touches the Meta Graph API directly — it goes through this provider.

import { MessagingProvider, persistInboundMessage } from './base.js';

const GRAPH_VERSION = 'v19.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class WhatsAppCloudProvider extends MessagingProvider {
  get channelType() { return 'whatsapp'; }
  get providerName() { return 'WhatsApp Cloud API'; }

  /**
   * Connect WhatsApp for a workspace.
   * authData can be:
   *   { mode: 'embedded_signup', code, workspace_id } — exchange FB OAuth code
   *   { mode: 'manual', access_token, phone_number_id, verify_token, waba_id, workspace_id }
   */
  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;

    if (authData.mode === 'embedded_signup') {
      return await this._connectEmbeddedSignup(workspaceId, authData, ctx);
    } else if (authData.mode === 'manual') {
      return await this._connectManual(workspaceId, authData, ctx);
    }
    throw new Error('Unknown connection mode: ' + authData.mode);
  }

  // ── Embedded Signup: exchange FB OAuth code for WhatsApp access ────────
  // phone_number_id/waba_id, when supplied, come from the WA_EMBEDDED_SIGNUP
  // postMessage event the frontend listens for during FB.login — that's
  // Meta's own recommended, reliable source. Falls back to deriving the
  // WABA from debug_token if the frontend didn't capture it (e.g. an older
  // SDK version or the message arrived after code exchange already ran).
  async _connectEmbeddedSignup(workspaceId, { code, phone_number_id, waba_id }, ctx) {
    const { sb } = ctx;
    const APP_ID = process.env.FACEBOOK_APP_ID;
    const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

    if (!APP_ID || !APP_SECRET) throw new Error('Facebook App credentials not configured');

    // 1. Exchange code for user access token
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    const userToken = tokenData.access_token;

    // 2. Get WABA (WhatsApp Business Account) — prefer the ID the frontend
    // captured from the WA_EMBEDDED_SIGNUP postMessage, fall back to
    // deriving it from debug_token's granular scopes.
    let wabaId = waba_id || null;
    if (!wabaId) {
      const debugRes = await fetch(
        `${GRAPH}/debug_token?input_token=${userToken}&access_token=${APP_ID}|${APP_SECRET}`
      );
      const debugData = await debugRes.json();
      wabaId = debugData?.data?.granular_scopes?.find(s => s.scope === 'whatsapp_business_management')?.target?.[0]
               || debugData?.data?.profile_id;
    }

    // 3. Get phone numbers from WABA (or use the frontend-captured phone_number_id directly)
    let phoneNumberId = phone_number_id || null;
    let phoneNumber = null;
    let businessName = null;
    if (phoneNumberId) {
      try {
        const phoneRes = await fetch(
          `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${userToken}`
        );
        const phoneData = await phoneRes.json();
        if (!phoneData.error) {
          phoneNumber = phoneData.display_phone_number;
          businessName = phoneData.verified_name;
        }
      } catch (e) { /* non-fatal */ }
    }
    if (wabaId && !phoneNumberId) {
      const phonesRes = await fetch(
        `${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${userToken}`
      );
      const phonesData = await phonesRes.json();
      if (phonesData.data?.length) {
        const phone = phonesData.data[0]; // auto-select first number
        phoneNumberId = phone.id;
        phoneNumber = phone.display_phone_number;
        businessName = phone.verified_name;
      }
    }

    // 4. Register webhook subscription for the WABA
    if (wabaId) {
      try {
        await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
        });
      } catch (e) { /* non-fatal — webhook may already be registered */ }
    }

    // 5. Generate a verify token for this workspace
    const verifyToken = `nyasa_wa_${workspaceId.slice(-8)}_${Date.now().toString(36)}`;

    // 6. Persist the config
    const config = {
      access_token: userToken,
      phone_number_id: phoneNumberId,
      phone_number: phoneNumber,
      business_name: businessName,
      waba_id: wabaId,
      verify_token: verifyToken,
      connected_via: 'embedded_signup',
      connected_at: new Date().toISOString(),
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

  // ── Manual: user pastes credentials directly ──────────────────────────
  async _connectManual(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { access_token, phone_number_id, verify_token, waba_id } = authData;

    if (!access_token || !phone_number_id) {
      throw new Error('Missing access_token or phone_number_id');
    }

    // Verify the token works by fetching the phone number details
    let phoneNumber = null;
    let businessName = null;
    try {
      const phoneRes = await fetch(
        `${GRAPH}/${phone_number_id}?fields=display_phone_number,verified_name&access_token=${access_token}`
      );
      const phoneData = await phoneRes.json();
      if (!phoneData.error) {
        phoneNumber = phoneData.display_phone_number;
        businessName = phoneData.verified_name;
      }
    } catch (e) { /* non-fatal — token may still work for sending */ }

    // Register webhook subscription for the WABA — without this, Meta has
    // no destination to deliver inbound-message webhooks to, even though
    // the app-level webhook URL is configured. This is the #1 cause of
    // "I connected but nothing arrives" for manual Cloud API connections.
    if (waba_id) {
      try {
        await fetch(`${GRAPH}/${waba_id}/subscribed_apps`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}` },
        });
      } catch (e) { /* non-fatal — surfaced via the verify-connection check instead */ }
    }

    const config = {
      access_token,
      phone_number_id,
      phone_number: phoneNumber,
      business_name: businessName,
      waba_id: waba_id || null,
      verify_token: verify_token || `nyasa_verify_${workspaceId.slice(-8)}`,
      connected_via: 'manual',
      connected_at: new Date().toISOString(),
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

  // ── List Meta-approved message templates for this WABA ────────────────
  // Required for any business-initiated message (broadcasts) sent outside
  // the 24h customer-service window -- Meta rejects free-form text there.
  async listTemplates(config) {
    const { waba_id, access_token } = config;
    if (!waba_id || !access_token) {
      throw new Error('WhatsApp channel is missing waba_id — reconnect the channel to enable templates');
    }
    const r = await fetch(`${GRAPH}/${waba_id}/message_templates?fields=name,status,language,category,components&limit=100&access_token=${access_token}`);
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || 'Failed to fetch WhatsApp templates');
    return (json.data || []).filter(t => t.status === 'APPROVED');
  }

  // ── Send an outbound message ───────────────────────────────────────────
  async sendMessage(config, message, ctx) {
    const { phone_number_id, access_token } = config;
    const { to, text, media, template } = message;

    if (!phone_number_id || !access_token) {
      throw new Error('WhatsApp channel not fully configured — missing phone_number_id or access_token');
    }

    // Template message (used for broadcasts / any business-initiated send
    // outside the 24h customer-service window — Meta requires an
    // Meta-approved template in that case, plain text gets rejected).
    if (template?.name) {
      const payload = {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en_US' },
          ...(template.components ? { components: template.components } : {}),
        },
      };
      const r = await fetch(`${GRAPH}/${phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error?.message || 'WhatsApp template send failed');
      return { ok: true, external_id: json.messages?.[0]?.id };
    }

    const WA_TYPE = { image: 'image', video: 'video', audio: 'audio' };
    let payload;

    // WhatsApp Cloud API only accepts specific audio containers/codecs:
    // OGG (Opus only), MP4/AAC, MPEG (mp3), AMR. audio/webm — the browser's
    // MediaRecorder default — is silently rejected by Meta with a generic
    // API error. Fail fast with a clear, actionable message instead.
    const SUPPORTED_AUDIO_MIME = /^audio\/(ogg|mp4|mpeg|aac|amr)/i;
    if (media && media.type === 'audio' && media.mime && !SUPPORTED_AUDIO_MIME.test(media.mime)) {
      throw new Error(
        `WhatsApp doesn't support this audio format (${media.mime}). Supported: OGG/Opus, MP4/AAC, MP3, AMR. ` +
        `If this was recorded in-browser, try recording again — newer recordings use a supported format.`
      );
    }

    if (media && WA_TYPE[media.type]) {
      const waType = WA_TYPE[media.type];
      payload = {
        messaging_product: 'whatsapp', to, type: waType,
        [waType]: { link: media.url, ...(waType !== 'audio' && text ? { caption: text } : {}) },
      };
    } else {
      payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
    }

    const r = await fetch(`${GRAPH}/${phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || 'WhatsApp API error');

    return { ok: true, external_id: json.messages?.[0]?.id };
  }

  // ── Process inbound webhook ────────────────────────────────────────────
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
              console.error('WhatsApp media fetch error:', mediaErr);
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
      // Match verify_token against any workspace's config
      const match = configs?.find(c => c.config?.verify_token === token);
      if (match || !configs?.length) return { challenge };
    }
    return null;
  }

  // ── Fetch and re-host media from Meta's CDN ────────────────────────────
  async fetchMedia(mediaId, config, ctx) {
    const { sb, workspaceId } = ctx;
    const accessToken = config.access_token;

    // 1. Get the media URL from Graph API
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const metaJson = await metaRes.json();
    if (!metaJson.url) return null;

    // 2. Download the media (WhatsApp URLs require auth)
    const fileRes = await fetch(metaJson.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const buf = await fileRes.arrayBuffer();

    // 3. Re-host in our own Supabase bucket (WhatsApp URLs are temporary)
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
    // For Cloud API, we just clear the config — no webhook to unregister
    // (the webhook is shared across all workspaces via the app-level subscription)
  }
}
