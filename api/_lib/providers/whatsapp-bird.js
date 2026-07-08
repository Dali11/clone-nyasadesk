// api/_lib/providers/whatsapp-bird.js
// WhatsApp via Bird (MessageBird) BSP — seamless white-label ISV integration.
//
// Nyasadesk registers as a WhatsApp Tech Provider with Meta and connects to
// Bird as a Solution Provider. Customers click "Connect WhatsApp", Meta's
// Embedded Signup opens (powered by OUR Bird solution ID), they pick their
// number, and everything else is automated:
//   1. Bird workspace created per customer
//   2. WhatsApp connector installed in that workspace
//   3. Webhooks auto-subscribed (inbound + outbound status)
//   4. Messages route through Bird's Channels API
//
// The customer NEVER sees Bird, never creates a Bird account, never pastes
// any API key. It's fully white-labeled.
//
// Required env vars (set once by Nyasadesk admin):
//   BIRD_ACCESS_KEY  — Bird organization access key
//   BIRD_ORG_ID      — Bird organization ID
//   BIRD_SOLUTION_ID — Meta solution ID (from Tech Provider registration)
//   META_CONFIG_ID   — Embedded Signup config ID (from Meta app dashboard)
//   FACEBOOK_APP_ID  — Meta app ID
//   FACEBOOK_APP_SECRET — Meta app secret

import { MessagingProvider, persistInboundMessage } from './base.js';

const BIRD_API = 'https://api.bird.com';
const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class WhatsAppBirdProvider extends MessagingProvider {
  get channelType() { return 'whatsapp'; }
  get providerName() { return 'Bird (WhatsApp BSP)'; }

  // ── Connect: full automated ISV flow ───────────────────────────────────
  // Called after the frontend Embedded Signup completes with a code.
  // authData: { mode: 'embedded', code, phone_number_id, waba_id, workspace_id }
  async connect(workspaceId, authData, ctx) {
    const { sb } = ctx;
    const { code, phone_number_id, waba_id } = authData;

    if (!code) throw new Error('Missing OAuth code from Embedded Signup');
    if (!phone_number_id || !waba_id) throw new Error('Missing phone_number_id or waba_id from Embedded Signup');

    const BIRD_KEY = process.env.BIRD_ACCESS_KEY;
    const BIRD_ORG = process.env.BIRD_ORG_ID;
    const APP_ID = process.env.FACEBOOK_APP_ID;
    const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

    if (!BIRD_KEY || !BIRD_ORG) throw new Error('Bird credentials not configured. Admin must set BIRD_ACCESS_KEY and BIRD_ORG_ID.');
    if (!APP_ID || !APP_SECRET) throw new Error('Meta app credentials not configured.');

    // 1. Exchange code for long-lived access token
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error('Token exchange failed: ' + tokenData.error.message);
    const accessToken = tokenData.access_token;

    // 2. Resolve the phone number from Meta
    let phoneNumber = null;
    let businessName = null;
    try {
      const phoneRes = await fetch(
        `${GRAPH}/${phone_number_id}?fields=display_phone_number,verified_name&access_token=${accessToken}`
      );
      const phoneData = await phoneRes.json();
      if (!phoneData.error) {
        phoneNumber = phoneData.display_phone_number;
        businessName = phoneData.verified_name;
      }
    } catch (e) { /* non-fatal */ }

    // 3. Create a Bird workspace for this customer
    const wsRes = await fetch(`${BIRD_API}/organizations/${BIRD_ORG}/workspaces`, {
      method: 'POST',
      headers: { 'Authorization': `AccessKey ${BIRD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Nyasadesk - ${businessName || phoneNumber || workspaceId.slice(-8)}`,
        description: `WhatsApp workspace for Nyasadesk customer`,
        dataPolicy: { group: 'eu-west-1', regions: [{ region: 'eu-west-1', priority: 1 }] },
      }),
    });
    const wsData = await wsRes.json();
    if (!wsData.id) throw new Error('Failed to create Bird workspace: ' + JSON.stringify(wsData));
    const birdWorkspaceId = wsData.id;

    // 4. Install the WhatsApp connector in the Bird workspace
    const connRes = await fetch(`${BIRD_API}/workspaces/${birdWorkspaceId}/connectors`, {
      method: 'POST',
      headers: { 'Authorization': `AccessKey ${BIRD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorTemplateRef: 'whatsapp:1',
        name: `WhatsApp - ${businessName || phoneNumber || 'Business'}`,
        arguments: {
          wabaId: waba_id,
          phoneId: phone_number_id,
          phoneNumber: phoneNumber || '',
        },
        securityArguments: {
          oauth: { accessToken },
        },
      }),
    });
    const connData = await connRes.json();
    if (!connData.id) throw new Error('Failed to install WhatsApp connector: ' + JSON.stringify(connData));
    const connectorId = connData.id;
    const channelId = connData.channel?.channelId;

    if (!channelId) throw new Error('No channelId returned from connector creation. Waiting for channel.created webhook...');

    // 5. Subscribe to webhooks (inbound messages + outbound status)
    const webhookUrl = `https://nyasadesk1.vercel.app/api/webhooks/whatsapp?workspace_id=${workspaceId}&source=bird`;
    const signingKey = `nyasa_bird_${workspaceId.slice(-8)}`;

    // Inbound messages
    await fetch(`${BIRD_API}/organizations/${BIRD_ORG}/workspaces/${birdWorkspaceId}/webhook-subscription`, {
      method: 'POST',
      headers: { 'Authorization': `AccessKey ${BIRD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'channels',
        event: 'whatsapp.inbound',
        url: webhookUrl,
        signingKey,
        eventFilters: [{ key: 'channelId', value: channelId }],
      }),
    }).catch(e => console.error('[Bird] inbound webhook sub warning:', e.message));

    // Outbound status (sent, delivered, read, failed)
    await fetch(`${BIRD_API}/organizations/${BIRD_ORG}/workspaces/${birdWorkspaceId}/webhook-subscription`, {
      method: 'POST',
      headers: { 'Authorization': `AccessKey ${BIRD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'channels',
        event: 'whatsapp.outbound',
        url: webhookUrl,
        signingKey,
        eventFilters: [
          { key: 'channelId', value: channelId },
          { key: 'messageStatus', value: 'sent' },
          { key: 'messageStatus', value: 'delivered' },
          { key: 'messageStatus', value: 'read' },
          { key: 'messageStatus', value: 'sending_failed' },
          { key: 'messageStatus', value: 'delivery_failed' },
        ],
      }),
    }).catch(e => console.error('[Bird] outbound webhook sub warning:', e.message));

    // 6. Persist the config
    const config = {
      bird_workspace_id: birdWorkspaceId,
      bird_connector_id: connectorId,
      bird_channel_id: channelId,
      bird_signing_key: signingKey,
      phone_number: phoneNumber,
      business_name: businessName,
      waba_id: waba_id,
      phone_number_id: phone_number_id,
      access_token: accessToken, // long-lived Meta token (for resolving numbers / ad attribution)
      provider: 'bird',
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

  // ── Send an outbound message via Bird's Channels API ───────────────────
  async sendMessage(config, message, ctx) {
    const { bird_workspace_id, bird_channel_id } = config;
    const { to, text, media } = message;

    if (!bird_workspace_id || !bird_channel_id) {
      throw new Error('WhatsApp channel not configured — missing Bird workspace/channel IDs');
    }

    const BIRD_KEY = process.env.BIRD_ACCESS_KEY;
    if (!BIRD_KEY) throw new Error('BIRD_ACCESS_KEY not configured');

    // Normalize recipient to E.164 with + prefix
    const recipient = to.startsWith('+') ? to : '+' + to;

    let body;
    if (media) {
      const bodyTypeMap = { image: 'image', video: 'image', audio: 'file' };
      const bodyType = bodyTypeMap[media.type] || 'file';
      if (media.type === 'image' || media.type === 'video') {
        body = {
          type: 'image',
          image: {
            images: [{ mediaUrl: media.url }],
            ...(text ? { text: { text: text } } : {}),
          },
        };
      } else {
        body = {
          type: 'file',
          file: { files: [{ mediaUrl: media.url, contentType: media.mime || 'audio/ogg' }] },
        };
      }
    } else {
      body = { type: 'text', text: { text } };
    }

    const r = await fetch(`${BIRD_API}/workspaces/${bird_workspace_id}/channels/${bird_channel_id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `AccessKey ${BIRD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiver: { contacts: [{ identifierKey: 'phonenumber', identifierValue: recipient }] },
        body,
      }),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error?.message || json.message || 'Bird API error');

    return { ok: true, external_id: json.id || json.parts?.[0]?.platformReference };
  }

  // ── Process inbound webhook (Bird format — completely different from Meta) ─
  async handleInbound(payload, config, ctx) {
    const { sb, workspaceId, applyAssignmentRules } = ctx;

    // Bird webhook events have {service, event, payload: {...}}
    // The actual message is in payload.payload when event = whatsapp.inbound
    const evt = payload.event || '';
    const msg = payload.payload || payload;

    // ── Channel created event (async connector installation result) ──────
    if (evt === 'channel.created') {
      // Update the config with the channel ID if we don't have it yet
      if (config && !config.bird_channel_id && msg.id) {
        await sb.from('channel_configs').update({
          config: { ...config, bird_channel_id: msg.id, bird_connector_id: msg.connectorId },
        }).eq('workspace_id', workspaceId).eq('channel', 'whatsapp');
      }
      return;
    }

    // ── Outbound status update ───────────────────────────────────────────
    if (evt === 'whatsapp.outbound' || (msg.direction === 'outgoing' && msg.status)) {
      const statusMap = { sent: 'sent', delivered: 'delivered', read: 'read', sending_failed: 'failed', delivery_failed: 'failed' };
      const mappedStatus = statusMap[msg.status] || msg.status;
      if (msg.id) {
        await sb.from('messages').update({ status: mappedStatus })
          .eq('external_id', msg.id).eq('workspace_id', workspaceId);
      }
      return;
    }

    // ── Inbound message (whatsapp.inbound) ───────────────────────────────
    if (evt !== 'whatsapp.inbound' && msg.direction !== 'incoming') return;

    const from = msg.sender?.contact?.identifierValue || '';
    const fromClean = from.replace(/\D/g, ''); // strip + and formatting
    const msgId = msg.id || msg.parts?.[0]?.platformReference || '';
    const ts = msg.createdAt || new Date().toISOString();
    const contactName = msg.sender?.contact?.displayName || from;

    let body = '';
    let attachments = null;

    if (msg.body?.type === 'text') {
      body = msg.body.text?.text || '';
    } else if (msg.body?.type === 'image') {
      const imgUrl = msg.body.image?.images?.[0]?.mediaUrl;
      if (imgUrl) {
        attachments = [{ url: imgUrl, type: 'image', mime: 'image/jpeg' }];
        body = msg.body.image?.text?.text || '📷 Photo';
      } else { body = '📷 Photo'; }
    } else if (msg.body?.type === 'file') {
      const file = msg.body.file?.files?.[0];
      if (file) {
        const isAudio = (file.contentType || '').startsWith('audio');
        const isVideo = (file.contentType || '').startsWith('video');
        attachments = [{ url: file.mediaUrl, type: isAudio ? 'audio' : isVideo ? 'video' : 'file', mime: file.contentType }];
        body = isAudio ? '🎤 Voice message' : isVideo ? '🎥 Video' : '📎 Attachment';
      } else { body = '📎 Attachment'; }
    } else if (msg.body?.type === 'location') {
      body = '📍 Location';
    } else {
      body = `[${msg.body?.type || 'unknown'}]`;
    }

    // Click-to-WhatsApp ad attribution (from Meta referral, if present)
    const adReferral = msg.meta?.referral || null;
    const { data: existingContact } = await sb.from('contacts')
      .select('lead_source, ad_attribution')
      .eq('workspace_id', workspaceId).eq('channel', 'whatsapp').eq('external_id', fromClean)
      .maybeSingle();

    const leadSource = existingContact?.lead_source === 'whatsapp_ad'
      ? 'whatsapp_ad' : (adReferral ? 'whatsapp_ad' : 'whatsapp');
    let adAttribution = existingContact?.ad_attribution || null;
    if (adReferral && !adAttribution) {
      adAttribution = {
        source_type: 'ad',
        source_id: adReferral.metadata?.source_id || null,
        source_url: adReferral.metadata?.source_url || null,
        headline: adReferral.title || null,
        body: adReferral.text || null,
        // Bird's referral shape for the ad creative itself isn't clearly documented
        // (unlike the official Cloud API's image_url/video_url/thumbnail_url) --
        // best-effort fallback across the field names Bird's payloads have used.
        image_url: adReferral.mediaUrl || adReferral.metadata?.image_url || null,
        video_url: adReferral.metadata?.video_url || null,
        thumbnail_url: adReferral.metadata?.thumbnail_url || null,
        ctwa_clid: adReferral.metadata?.tracking_id || null,
        captured_at: ts,
      };
    }

    const { conversation: conv } = await persistInboundMessage(sb, workspaceId, {
      channel: 'whatsapp', externalId: fromClean, contactName, phone: from,
      body, attachments, externalMsgId: msgId, senderId: fromClean, senderName: contactName,
      timestamp: ts, leadSource, adAttribution,
    });

    if (conv?.id && !conv.assigned_to) {
      await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'whatsapp',
        contact: { lead_source: leadSource } });
    }
  }

  // ── Webhook verification (GET handshake) ───────────────────────────────
  // Bird doesn't use the Meta hub.verify_token flow — webhooks are configured
  // via API. But we keep this for backward compat with any Meta-style verifications.
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

  // ── Fetch media from Bird's CDN ────────────────────────────────────────
  // Bird media URLs are already public CDN links, so no re-hosting needed
  // unless we want to preserve them. For now, return the URL directly.
  async fetchMedia(mediaId, config, ctx) {
    // Bird's media URLs in the webhook payload are already accessible
    // (they use media.nest.messagebird.com CDN). No separate fetch needed.
    return null;
  }

  async disconnect(config) {
    // Optionally disable the connector in Bird via API
    if (config.bird_workspace_id && config.bird_connector_id) {
      const BIRD_KEY = process.env.BIRD_ACCESS_KEY;
      if (BIRD_KEY) {
        try {
          await fetch(`${BIRD_API}/workspaces/${config.bird_workspace_id}/connectors/${config.bird_connector_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `AccessKey ${BIRD_KEY}` },
          });
        } catch (e) { /* non-fatal */ }
      }
    }
  }

  // ── Get the Embedded Signup config for the frontend ────────────────────
  // The frontend calls this to get the config_id and solution_id needed
  // to launch FB.login with the correct Bird ISV parameters.
  getEmbeddedSignupConfig() {
    return {
      config_id: process.env.META_CONFIG_ID || null,
      solution_id: process.env.BIRD_SOLUTION_ID || null,
      app_id: process.env.FACEBOOK_APP_ID || null,
    };
  }
}
