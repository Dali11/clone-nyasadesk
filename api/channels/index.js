// api/channels/index.js
// Unified channel API — routes by ?action=:
//   'send' (default)           — Send outbound message via provider
//   'telegram-setup'           — Set up Telegram bot (legacy, kept for backward compat)
//   'connect'                  — Connect a channel via provider abstraction
//   'disconnect'               — Disconnect a channel via provider abstraction
//
// All messaging operations go through NyasaDesk's provider abstraction layer
// (api/_lib/providers/), keeping the app independent of the underlying BSP.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = 'https://nyasadesk1.vercel.app';
const BRIDGE_API = 'https://officialapi.wasapflow.com/bridge/v1';

export default async function handler(req, res) {
  const getActions = ['hosted-connect'];
  if (req.method !== 'POST' && !getActions.includes(req.query.action)) return res.status(405).json({ error: 'Method Not Allowed' });
  const action = req.query.action || 'send';

  if (action === 'telegram-setup') return handleConnect(req, res);
  if (action === 'connect')        return handleConnect(req, res);
  if (action === 'disconnect')     return handleDisconnect(req, res);
  if (action === 'verify')          return handleVerify(req, res);
  if (action === 'signup-config')  return handleSignupConfig(req, res);
  if (action === 'hosted-connect') return handleHostedConnect(req, res);
  if (action === 'save-waba')     return handleSaveWaba(req, res);
  if (action === 'sync-waba')     return handleSyncWaba(req, res);
  return handleSend(req, res);
}

// ── Connect a channel via provider abstraction ───────────────────────────
async function handleConnect(req, res) {
  try {
    const { channel, workspace_id, ...authData } = req.body || {};
    if (!channel || !workspace_id) {
      return res.status(400).json({ ok: false, error: 'channel and workspace_id are required' });
    }

    // For WhatsApp, default to WasapFlow Bridge (BSP), unless a specific provider is requested
    const channelType = authData.provider_key
      ? `whatsapp:${authData.provider_key}`
      : (channel === 'whatsapp' ? 'whatsapp:wasapflow'
         : channel === 'telegram' ? 'telegram' : channel);

    const provider = getProvider(channelType);
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    const result = await provider.connect(workspace_id, { ...authData, workspace_id }, { sb });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/connect] error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Internal server error' });
  }
}

// ── Disconnect a channel ──────────────────────────────────────────────────
async function handleDisconnect(req, res) {
  try {
    const { channel, workspace_id } = req.body || {};
    if (!channel || !workspace_id) {
      return res.status(400).json({ ok: false, error: 'channel and workspace_id are required' });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs')
      .select('*').eq('workspace_id', workspace_id).eq('channel', channel).single();

    if (cfg) {
      const providerKey = channel === 'whatsapp'
        ? (cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
           : cfg.config?.bird_workspace_id ? 'whatsapp:bird'
           : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud')
        : channel;
      const provider = getProvider(providerKey);
      await provider.disconnect(cfg.config);
      await sb.from('channel_configs')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id).eq('channel', channel);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[channels/disconnect] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}


// ── Verify a channel connection is actually working ──────────────────────
// Checks the stored credentials are still valid AND (for WhatsApp) that
// Meta will actually deliver webhook events to us — a connected token with
// no WABA subscription looks "connected" in the UI but silently receives
// nothing. Auto-fixes the subscription gap when it finds one.
async function handleVerify(req, res) {
  try {
    const { workspace_id, channel } = req.body || {};
    if (!workspace_id || !channel) {
      return res.status(400).json({ ok: false, error: 'workspace_id and channel are required' });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', channel).single();
    if (!cfg?.enabled) return res.status(400).json({ ok: false, error: 'Channel is not connected' });

    if (channel === 'whatsapp') {
      const { access_token, phone_number_id, waba_id } = cfg.config || {};
      const checks = { token_valid: false, webhook_subscribed: false, waba_id_present: !!waba_id };

      if (access_token && phone_number_id) {
        const r = await fetch(`https://graph.facebook.com/v21.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status&access_token=${access_token}`);
        const d = await r.json();
        if (!d.error) {
          checks.token_valid = true;
          checks.phone_number = d.display_phone_number;
          checks.verified_name = d.verified_name;
          checks.quality_rating = d.quality_rating;
          checks.code_verification_status = d.code_verification_status;
        } else {
          checks.token_error = d.error.message;
        }
      } else {
        checks.token_error = 'Missing access token or phone number ID';
      }

      if (access_token && waba_id) {
        const r2 = await fetch(`https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps?access_token=${access_token}`);
        const d2 = await r2.json();
        checks.webhook_subscribed = Array.isArray(d2.data) && d2.data.length > 0;

        // Self-heal: if the app isn't subscribed to this WABA, subscribe it now
        // instead of just reporting a red X the user can't act on.
        if (!checks.webhook_subscribed && checks.token_valid) {
          try {
            const subRes = await fetch(`https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps`, {
              method: 'POST', headers: { Authorization: `Bearer ${access_token}` },
            });
            const subData = await subRes.json();
            if (subData.success) { checks.webhook_subscribed = true; checks.auto_fixed = true; }
          } catch (e) { /* leave as unsubscribed, report to user */ }
        }
      } else if (!waba_id) {
        checks.webhook_note = 'No WABA ID stored — cannot verify or fix webhook subscription automatically.';
      }

      return res.status(200).json({ ok: true, healthy: checks.token_valid && checks.webhook_subscribed, checks });
    }

    return res.status(200).json({ ok: true, healthy: true, checks: { note: 'Verification not implemented for this channel' } });
  } catch (e) {
    console.error('[channels/verify] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Get WasapFlow Embedded Signup config (for frontend FB.login) ─────────
async function handleSignupConfig(req, res) {
  try {
    const { WhatsAppWasapFlowProvider } = await import('../_lib/providers/whatsapp-wasapflow.js');
    const config = await WhatsAppWasapFlowProvider.getEmbeddedSignupConfig();
    return res.status(200).json({ ok: true, ...config });
  } catch (e) {
    console.error('[channels/signup-config] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Save WABA config (called after WasapFlow hosted connect success) ────
async function handleSaveWaba(req, res) {
  try {
    const { workspace_id, waba_id, phone_number_id, display_name, quality_rating, connection_mode } = req.body || {};
    if (!workspace_id || !waba_id || !phone_number_id) {
      return res.status(400).json({ ok: false, error: 'workspace_id, waba_id, and phone_number_id are required' });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Save the WhatsApp channel config — the WABA is already registered on
    // WasapFlow's side (the hosted page did that). We just store the config
    // so our app knows which WABA/phone to use for this workspace.
    const config = {
      provider: 'wasapflow',
      waba_id,
      phone_number_id,
      phone_number: null,
      business_name: display_name || null,
      connected_via: 'embedded_signup_hosted',
      connected_at: new Date().toISOString(),
      quality_rating: quality_rating || null,
      connection_mode: connection_mode || 'coexistence',
      wasapflow_client_id: waba_id,
    };

    const { error } = await sb.from('channel_configs').upsert({
      workspace_id,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    if (error) throw error;

    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error('[channels/save-waba] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Sync WABA from WasapFlow (poll for registered clients) ──────────────
async function handleSyncWaba(req, res) {
  try {
    const { workspace_id } = req.body || {};
    const wsId = workspace_id || req.query.workspace_id;
    if (!wsId) return res.status(400).json({ ok: false, error: 'workspace_id is required' });

    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey) return res.status(500).json({ ok: false, error: 'WASAPFLOW_PARTNER_KEY not configured' });

    // List all registered clients from WasapFlow
    const listRes = await fetch(`${BRIDGE_API}/clients`, {
      headers: { 'x-partner-key': partnerKey },
    });
    const listData = await listRes.json();
    if (!listRes.ok || !listData.success) {
      return res.status(500).json({ ok: false, error: listData.message || 'Failed to list WasapFlow clients' });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check if we already have a WhatsApp config for this workspace
    const { data: existing } = await sb.from('channel_configs')
      .select('*').eq('workspace_id', wsId).eq('channel', 'whatsapp').single();

    const clients = listData.clients || listData.data || [];
    if (!clients.length) {
      return res.status(200).json({ ok: false, error: 'No WhatsApp accounts found. Complete the signup first.' });
    }

    // If we already have a config, try to find a matching client or a new one
    let client = null;
    if (existing?.config?.waba_id) {
      // Find the client that matches our existing WABA
      client = clients.find(c => c.waba_id === existing.config.waba_id);
    }

    // If no match, take the most recently created client
    if (!client) {
      // Sort by created_at descending and take the first one
      clients.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      client = clients[0];
    }

    if (!client) {
      return res.status(200).json({ ok: false, error: 'No WhatsApp account found.' });
    }

    // Save/update the config
    const config = {
      provider: 'wasapflow',
      waba_id: client.waba_id,
      phone_number_id: client.phone_number_id,
      phone_number: client.phone_number || null,
      business_name: client.display_name || client.business_name || null,
      connected_via: 'embedded_signup_hosted',
      connected_at: new Date().toISOString(),
      quality_rating: client.quality_rating || null,
      connection_mode: client.connection_mode || 'coexistence',
      wasapflow_client_id: client.id || client.waba_id,
    };

    const { error } = await sb.from('channel_configs').upsert({
      workspace_id: wsId,
      channel: 'whatsapp',
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    if (error) throw error;

    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error('[channels/sync-waba] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── WasapFlow hosted connect (redirects to their pre-whitelisted page) ───
async function handleHostedConnect(req, res) {
  try {
    const partnerKey = process.env.WASAPFLOW_PARTNER_KEY;
    if (!partnerKey) return res.status(500).json({ ok: false, error: 'WASAPFLOW_PARTNER_KEY not configured' });

    const workspaceId = (req.query.workspace_id) || (req.body?.workspace_id);
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspace_id is required' });

    const redirectUri = encodeURIComponent(PROD_URL + '/api/auth/whatsapp-embedded');

    // Try the hosted connect page with partner_key as query param
    // WasapFlow's hosted page is on their domain (already whitelisted with Meta)
    const hostedUrl = `https://partner.wasapflow.com/bridge/connect?partner_key=${encodeURIComponent(partnerKey)}&redirect_uri=${redirectUri}&state=${workspaceId}`;

    // First, try a server-side fetch to see what the page returns
    try {
      const probe = await fetch(`https://partner.wasapflow.com/bridge/connect?partner_key=${encodeURIComponent(partnerKey)}&redirect_uri=${redirectUri}&state=${workspaceId}`, {
        headers: { 'x-partner-key': partnerKey },
        redirect: 'manual',
      });

      if (probe.status === 200) {
        // Page exists and returns HTML — redirect the user there
        return res.redirect(302, hostedUrl);
      } else if (probe.status >= 300 && probe.status < 400) {
        // It's a redirect — follow it
        const location = probe.headers.get('location');
        if (location) return res.redirect(302, location);
        return res.redirect(302, hostedUrl);
      } else {
        // Return the status so we can debug
        const body = await probe.text().catch(() => '');
        return res.status(200).json({
          ok: false,
          error: `WasapFlow hosted connect returned status ${probe.status}`,
          status: probe.status,
          bodyPreview: body.substring(0, 500),
          hostedUrl: hostedUrl
        });
      }
    } catch (fetchErr) {
      return res.status(200).json({
        ok: false,
        error: 'Could not reach WasapFlow hosted connect: ' + fetchErr.message,
        hostedUrl: hostedUrl
      });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Send an outbound message via provider abstraction ────────────────────
async function handleSend(req, res) {
  try {
    const { message_id, conversation_id, workspace_id, channel, body: text, attachments } = req.body || {};
    if (!conversation_id || !workspace_id || !channel) {
      return res.status(400).json({ error: 'Missing fields: conversation_id, workspace_id, channel' });
    }
    const media = Array.isArray(attachments) && attachments.length ? attachments[0] : null;
    if (!text && !media) return res.status(400).json({ error: 'Message must have text or an attachment' });

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Website channel: no external API needed, just mark as sent ──────
    if (channel === 'website') {
      if (message_id) {
        await sb.from('messages').update({ status: 'sent' }).eq('id', message_id);
      }
      await sb.from('conversations').update({
        last_message: text || (media ? `[${media.type}]` : ''),
        last_message_at: new Date().toISOString(),
      }).eq('id', conversation_id);
      return res.status(200).json({ ok: true });
    }

    // 1. Get the channel config
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', channel).single();
    if (!cfg?.enabled) return res.status(400).json({ error: 'Channel not configured' });

    // 2. Get the conversation's external_id (recipient)
    const { data: conv } = await sb.from('conversations').select('external_id').eq('id', conversation_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    // 3. Send through the provider abstraction
    // Detect which WhatsApp provider to use based on the stored config
    const providerKey = channel === 'whatsapp'
      ? (cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
         : cfg.config?.bird_workspace_id ? 'whatsapp:bird'
         : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud')
      : channel;
    const provider = getProvider(providerKey);
    const result = await provider.sendMessage(cfg.config, {
      to: conv.external_id, text, media, message_id, conversation_id, workspace_id,
    }, { sb });

    // 4. Update message status
    if (message_id) {
      await sb.from('messages').update({
        ...(result.external_id ? { external_id: result.external_id } : {}),
        status: 'sent',
      }).eq('id', message_id);
    }

    // 5. Update conversation
    await sb.from('conversations').update({
      last_message: text || (media ? `[${media.type}]` : ''),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    if (req.body?.message_id) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_KEY);
      await sb2.from('messages').update({ status: 'failed' }).eq('id', req.body.message_id);
    }
    return res.status(500).json({ error: err.message });
  }
}
