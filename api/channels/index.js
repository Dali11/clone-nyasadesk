// api/channels/index.js
// Unified channel API — routes by ?action=:
//   'send' (default)           — Send outbound message via provider
//   'telegram-setup'           — Set up Telegram bot (legacy, kept for backward compat)
//   'connect'                  — Connect a channel via provider abstraction
//   'disconnect'               — Disconnect a channel via provider abstraction
//
// All messaging operations go through NyasaDesk's provider abstraction layer
// (api/_lib/providers/), keeping the app independent of the underlying BSP.

import { createClient } from '../_lib/dbFactory.js';
import { getProvider } from '../_lib/providers/index.js';
import { AI_AGENT_TEMPLATES, generateDraftReply } from '../_lib/aiAgents.js';
import { ingestUrl, ingestFile } from '../_lib/knowledgeIngest.js';
import { discoverWabas, connectWaba, createWaba, addPhoneNumber, requestVerificationCode, verifyPhoneCode, registerPhoneNumber } from '../_lib/whatsappGuidedSetup.js';
import { validateToken, discoverWabas as discoverWabasManual, getWabaInfo, listPhoneNumbers, getPhoneDetails, isPhoneRegistered, autoSetup } from '../_lib/whatsappSetup.js';
import { freshSetup } from '../_lib/freshSetup.js';
import { buildEmail } from '../_lib/emailTemplate.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = 'https://nyasadesk.com';

// Quick UUID format guard — Postgres will throw "invalid input syntax for type uuid"
// if we pass an arbitrary string (e.g. 'test') directly into a UUID column.
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}



// ── Push notification test ───────────────────────────────────────────────────
async function handlePushTest(req, res) {
  try {
    const { workspace_id, message = 'Test push — tap to open inbox', contact_name = 'Test Contact' } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });
    const { notifyNewMessage } = await import('../_lib/pushNotify.js');
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    await notifyNewMessage(sb, {
      ownerId:       workspace_id,
      contactName:   contact_name,
      body:          message,
      conversationId: null,
      channel:       'whatsapp',
      contactPhone:  '',
      contactAvatar: '',
    });
    return res.status(200).json({ ok: true, msg: 'Push notification dispatched' });
  } catch (e) {
    console.error('[push-test] error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'Push test failed' });
  }
}

export default async function handler(req, res) {
  // AI Agents actions live here too -- api/ is hard-capped at 12 files on
  // Vercel Hobby (see AGENTS.md), so new modules get added as actions on an
  // existing route rather than new files. Logic itself lives in
  // api/_lib/aiAgents.js, this file just dispatches.
  const getActions = [
    'templates', 'ai-templates', 'ai-agent-list', 'ai-agent-get',
    'knowledge-list', 'knowledge-search', 'billing-status',
    'gmail-oauth-url',
    'gmail-oauth-callback', 'whatsapp-refresh-status',
  ];
  if (req.method !== 'POST' && !getActions.includes(req.query.action)) return res.status(405).json({ error: 'Method Not Allowed' });
  const action = req.query.action || 'send';

  if (action === 'telegram-setup') return handleConnect(req, res);
  if (action === 'connect')        return handleConnect(req, res);
  if (action === 'disconnect')     return handleDisconnect(req, res);
  if (action === 'verify')          return handleVerify(req, res);
  if (action === 'templates')     return handleListTemplates(req, res);
  if (action === 'ai-templates')   return handleAiTemplates(req, res);
  if (action === 'ai-agents-list') return handleAiAgentsList(req, res);
  if (action === 'ai-agents-save') return handleAiAgentsSave(req, res);
  if (action === 'ai-agents-delete') return handleAiAgentsDelete(req, res);
  if (action === 'ai-draft')       return handleAiDraft(req, res);
  if (action === 'ai-knowledge-from-url')  return handleAiKnowledgeFromUrl(req, res);
  if (action === 'ai-knowledge-from-file') return handleAiKnowledgeFromFile(req, res);
  if (action === 'whatsapp-guided-discover') return handleWhatsappGuidedDiscover(req, res);
  if (action === 'whatsapp-guided-connect') return handleWhatsappGuidedConnect(req, res);
  if (action === 'whatsapp-guided-create-waba')   return handleWhatsappGuidedCreateWaba(req, res);
  if (action === 'whatsapp-guided-add-phone')      return handleWhatsappGuidedAddPhone(req, res);
  if (action === 'whatsapp-guided-request-code')   return handleWhatsappGuidedRequestCode(req, res);
  if (action === 'whatsapp-guided-verify-code')    return handleWhatsappGuidedVerifyCode(req, res);
  if (action === 'whatsapp-guided-register-phone') return handleWhatsappGuidedRegisterPhone(req, res);
  if (action === 'whatsapp-guided-fresh-setup')   return handleWhatsappGuidedFreshSetup(req, res);
  if (action === 'whatsapp-manual-connect') return handleWhatsappManualConnect(req, res);
  if (action === 'whatsapp-refresh-status') return handleWhatsappRefreshStatus(req, res);
  if (action === 'whatsapp-complete-registration') return handleWhatsappCompleteRegistration(req, res);
  if (action === 'whatsapp-embedded-save')   return handleWhatsappEmbeddedSave(req, res);
  if (action === 'gmail-oauth-url')       return handleGmailOAuthUrl(req, res);
  if (action === 'gmail-oauth-callback')  return handleGmailOAuthCallback(req, res);
  if (action === 'email-test')            return handleEmailTest(req, res);
  if (action === 'email-send')            return handleEmailSend(req, res);
  if (action === 'push-test')     return handlePushTest(req, res);
  if (action === 'send-debug')   return handleSendDebug(req, res);
  if (action === 'list-templates') return handleListTemplates(req, res);
  return handleSend(req, res);
}

// ── AI Agents: list built-in templates ─────────────────────────────────────
async function handleAiTemplates(req, res) {
  return res.status(200).json({ ok: true, templates: AI_AGENT_TEMPLATES });
}

// ── AI Agents: list agents for a workspace ─────────────────────────────────
async function handleAiAgentsList(req, res) {
  try {
    const workspace_id = req.query.workspace_id;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    if (!isUUID(workspace_id)) return res.status(400).json({ ok: false, error: 'Invalid workspace_id format' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await sb.from('ai_agents').select('*').eq('workspace_id', workspace_id).order('created_at', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ ok: true, agents: data || [] });
  } catch (e) {
    console.error('[ai-agents-list] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── AI Agents: create or update an agent ────────────────────────────────────
async function handleAiAgentsSave(req, res) {
  try {
    const { id, workspace_id, ...fields } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const ALLOWED = ['name', 'description', 'role', 'template_key', 'model', 'system_instructions',
      'personality', 'tone', 'languages', 'enabled_channels', 'handoff_rules', 'permissions',
      'operating_hours', 'automation_mode', 'status',
      'agent_type', 'message_cap', 'handoff_assignment_rule_id',
      'webhook_tool_url', 'webhook_tool_secret'];
    const payload = {};
    for (const k of ALLOWED) if (k in fields) payload[k] = fields[k];

    // Helper: attempt save, retry without webhook_tool_* if column-not-found error
    async function doSave(p) {
      if (id) {
        const { data, error } = await sb.from('ai_agents').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', workspace_id).select().single();
        return { data, error };
      } else {
        const { data, error } = await sb.from('ai_agents').insert({ workspace_id, ...p }).select().single();
        return { data, error };
      }
    }

    let { data, error } = await doSave(payload);
    // If error is due to missing webhook_tool columns, retry without them
    if (error && (error.code === 'PGRST204' || (error.message && error.message.includes('webhook_tool')))) {
      const { webhook_tool_url, webhook_tool_secret, ...safePayload } = payload;
      const retry = await doSave(safePayload);
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return res.status(200).json({ ok: true, agent: data });
  } catch (e) {
    console.error('[ai-agents-save] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── AI Agents: delete an agent ───────────────────────────────────────────
async function handleAiAgentsDelete(req, res) {
  try {
    const { id, workspace_id } = req.body || {};
    if (!id || !workspace_id) return res.status(400).json({ error: 'id and workspace_id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await sb.from('ai_agents').delete().eq('id', id).eq('workspace_id', workspace_id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[ai-agents-delete] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── AI Agents: generate a draft reply for a conversation ──────────────────
// Phase 1 only ever drafts into the composer -- a human always reviews and
// hits send. Full automation (auto-send) is a later phase per the agreed
// build plan, gated by ai_agents.automation_mode.
async function handleAiDraft(req, res) {
  try {
    const { agent_id, conversation_id, workspace_id } = req.body || {};
    if (!agent_id || !conversation_id || !workspace_id) {
      return res.status(400).json({ error: 'agent_id, conversation_id, and workspace_id are required' });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: agent, error: agentErr } = await sb.from('ai_agents').select('*').eq('id', agent_id).eq('workspace_id', workspace_id).single();
    if (agentErr || !agent) return res.status(404).json({ error: 'AI agent not found' });

    const { data: conv } = await sb.from('conversations').select('contact_id').eq('id', conversation_id).single();
    const { data: contact } = conv?.contact_id
      ? await sb.from('contacts').select('name').eq('id', conv.contact_id).single()
      : { data: null };
    const { data: messages } = await sb.from('messages').select('direction,body,attachments')
      .eq('conversation_id', conversation_id).order('created_at', { ascending: true });

    // Knowledge: this agent's own snippets + workspace-shared ones (agent_id null)
    const { data: knowledge } = await sb.from('ai_knowledge').select('title,content')
      .eq('workspace_id', workspace_id).or('agent_id.eq.' + agent_id + ',agent_id.is.null')
      .order('created_at', { ascending: true });

    const draft = await generateDraftReply(agent, messages || [], contact, knowledge || [], { sb, workspaceId: workspace_id, conversationId: conversation_id });
    return res.status(200).json({ ok: true, draft });
  } catch (e) {
    console.error('[ai-draft] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── AI Agents: knowledge base ingestion (Phase 3) ──────────────────────────
// Turns a URL or an uploaded PDF/DOCX/TXT into a knowledge snippet, same
// table as Phase 2's manual entries (source_type distinguishes them). Still
// no embeddings/chunking -- content is truncated, then buildKnowledgeBlock
// caps the total prompt size at draft time.
async function handleAiKnowledgeFromUrl(req, res) {
  try {
    const { workspace_id, agent_id, url } = req.body || {};
    if (!workspace_id || !url) return res.status(400).json({ error: 'workspace_id and url are required' });
    const { title, content } = await ingestUrl(url);
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await sb.from('ai_knowledge')
      .insert({ workspace_id, agent_id: agent_id || null, title, content, source_type: 'url', url })
      .select().single();
    if (error) throw error;
    return res.status(200).json({ ok: true, knowledge: data });
  } catch (e) {
    console.error('[ai-knowledge-from-url] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleAiKnowledgeFromFile(req, res) {
  try {
    const { workspace_id, agent_id, filename, mime_type, content_base64 } = req.body || {};
    if (!workspace_id || !content_base64) return res.status(400).json({ error: 'workspace_id and content_base64 are required' });
    const { title, content } = await ingestFile(filename, mime_type, content_base64);
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await sb.from('ai_knowledge')
      .insert({ workspace_id, agent_id: agent_id || null, title, content, source_type: 'file' })
      .select().single();
    if (error) throw error;
    return res.status(200).json({ ok: true, knowledge: data });
  } catch (e) {
    console.error('[ai-knowledge-from-file] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ── List Meta-approved WhatsApp message templates ─────────────────────────
// GET /api/channels?action=templates&workspace_id=...
async function handleListTemplates(req, res) {
  try {
    const workspace_id = req.query.workspace_id;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspace_id).eq('channel', 'whatsapp').single();
    if (!cfg?.enabled) return res.status(200).json({ ok: true, templates: [] });
    const provider = getProvider('whatsapp:cloud');
    const templates = await provider.listTemplates(cfg.config);
    return res.status(200).json({ ok: true, templates });
  } catch (e) {
    // OAuth/token errors are not server crashes — return 200 + empty list
    const isAuthError = /token|oauth|expired|unauthorized|invalid.*access/i.test(e.message || '');
    if (isAuthError) return res.status(200).json({ ok: true, templates: [], warning: 'WhatsApp not connected or token expired' });
    console.error('[channels/templates] error:', e);
    return res.status(500).json({ ok: false, error: e.message, templates: [] });
  }
}

// ── Connect a channel via provider abstraction ───────────────────────────
async function handleConnect(req, res) {
  try {
    const { channel, workspace_id, ...authData } = req.body || {};
    if (!channel || !workspace_id) {
      return res.status(400).json({ ok: false, error: 'channel and workspace_id are required' });
    }

    const channelType = authData.provider_key
      ? `whatsapp:${authData.provider_key}`
      : (channel === 'telegram' ? 'telegram' : channel);

    const provider = getProvider(channelType);
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    const result = await provider.connect(workspace_id, { ...authData, workspace_id }, { sb });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/connect] error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Internal server error' });
  }
}

// ── WhatsApp Guided Setup (direct Graph API, no FB.login popup) ──────────
async function handleWhatsappGuidedDiscover(req, res) {
  try {
    const { access_token } = req.body || {};
    if (!access_token) return res.status(400).json({ ok: false, error: 'access_token is required' });
    const wabas = await discoverWabas(access_token);
    return res.status(200).json({ ok: true, wabas });
  } catch (e) {
    console.error('[channels/whatsapp-guided-discover] error:', e);
    return res.status(400).json({ ok: false, error: e.message || 'Discovery failed' });
  }
}

async function handleWhatsappGuidedConnect(req, res) {
  try {
    const { workspace_id, access_token, waba_id, phone_number_id } = req.body || {};
    if (!workspace_id || !access_token || !waba_id || !phone_number_id) {
      return res.status(400).json({ ok: false, error: 'workspace_id, access_token, waba_id and phone_number_id are required' });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const config = await connectWaba(sb, { workspaceId: workspace_id, accessToken: access_token, wabaId: waba_id, phoneNumberId: phone_number_id });
    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error('[channels/whatsapp-guided-connect] error:', e);
    return res.status(400).json({ ok: false, error: e.message || 'Connect failed' });
  }
}

async function handleWhatsappGuidedCreateWaba(req, res) {
  try {
    const { access_token, business_id, name } = req.body || {};
    if (!access_token || !business_id || !name) return res.status(400).json({ ok: false, error: 'access_token, business_id and name are required' });
    const result = await createWaba(access_token, business_id, name);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-create-waba] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleWhatsappGuidedAddPhone(req, res) {
  try {
    const { access_token, waba_id, cc, phone_number, verified_name } = req.body || {};
    if (!access_token || !waba_id || !cc || !phone_number || !verified_name) {
      return res.status(400).json({ ok: false, error: 'access_token, waba_id, cc, phone_number and verified_name are required' });
    }
    const result = await addPhoneNumber(access_token, waba_id, { cc, phoneNumber: phone_number, verifiedName: verified_name });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-add-phone] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleWhatsappGuidedRequestCode(req, res) {
  try {
    const { access_token, phone_number_id, code_method } = req.body || {};
    if (!access_token || !phone_number_id) return res.status(400).json({ ok: false, error: 'access_token and phone_number_id are required' });
    const result = await requestVerificationCode(access_token, phone_number_id, code_method);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-request-code] error:', e);
    return res.status(400).json({ ok: false, error: e.message, error_code: e.code || null });
  }
}

async function handleWhatsappGuidedVerifyCode(req, res) {
  try {
    const { access_token, phone_number_id, code } = req.body || {};
    if (!access_token || !phone_number_id || !code) return res.status(400).json({ ok: false, error: 'access_token, phone_number_id and code are required' });
    const result = await verifyPhoneCode(access_token, phone_number_id, code);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-verify-code] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleWhatsappGuidedRegisterPhone(req, res) {
  try {
    const { access_token, phone_number_id, pin } = req.body || {};
    if (!access_token || !phone_number_id || !pin) return res.status(400).json({ ok: false, error: 'access_token, phone_number_id and pin are required' });
    const result = await registerPhoneNumber(access_token, phone_number_id, pin);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-register-phone] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleWhatsappGuidedFreshSetup(req, res) {
  try {
    const { access_token, business_id, cc, phone_number } = req.body || {};
    if (!access_token || !business_id || !cc || !phone_number) {
      return res.status(400).json({ ok: false, error: 'access_token, business_id, cc and phone_number are required' });
    }
    const result = await freshSetup(access_token, business_id, cc, phone_number);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[channels/whatsapp-guided-fresh-setup] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
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
      const providerKey = channel === 'whatsapp' ? 'whatsapp:cloud' : channel;
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
  // Lightweight health check — reads stored credentials and pings Meta's Graph API
  // to confirm the token is still valid and the phone number is accessible.
  // Per Meta docs: GET /{phone-number-id} requires whatsapp_business_messaging permission.
  // We do NOT attempt to re-subscribe webhooks or touch the DB config — the account
  // is already connected; this is read-only confirmation.
  try {
    const { workspace_id, channel } = req.body || {};
    if (!workspace_id || !channel) {
      return res.status(400).json({ ok: false, error: 'workspace_id and channel are required' });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg, error: dbErr } = await sb.from('channel_configs').select('config,enabled')
      .eq('workspace_id', workspace_id).eq('channel', channel).single();
    if (dbErr || !cfg?.enabled) {
      return res.status(400).json({ ok: false, error: 'Channel is not connected' });
    }

    if (channel === 'whatsapp') {
      const { access_token, phone_number_id, waba_id } = cfg.config || {};
      if (!access_token || !phone_number_id) {
        return res.status(200).json({ ok: false, error: 'Stored config is incomplete — reconnect the channel' });
      }

      // 1. Validate token by fetching phone number details from Meta
      // Ref: https://developers.facebook.com/docs/whatsapp/business-management-api/phone-numbers
      const phoneRes = await fetch(
        `https://graph.facebook.com/v21.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,account_mode&access_token=${access_token}`
      );
      const phoneData = await phoneRes.json();

      if (phoneData.error) {
        // Token invalid or permissions missing — tell the user clearly
        return res.status(200).json({
          ok: false,
          error: phoneData.error.message || 'Meta API rejected the stored access token',
          error_code: phoneData.error.code,
        });
      }

      // 2. Check webhook subscription status (read-only — no re-subscription)
      let webhookSubscribed = false;
      if (waba_id) {
        try {
          const subRes = await fetch(
            `https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps?access_token=${access_token}`
          );
          const subData = await subRes.json();
          webhookSubscribed = Array.isArray(subData.data) && subData.data.length > 0;
        } catch (_) { /* non-fatal — webhook check is best-effort */ }
      }

      return res.status(200).json({
        ok: true,
        healthy: true,
        phone_number: phoneData.display_phone_number,
        verified_name: phoneData.verified_name,
        quality_rating: phoneData.quality_rating,
        webhook_subscribed: webhookSubscribed,
      });
    }

    return res.status(200).json({ ok: true, healthy: true });
  } catch (e) {
    console.error('[channels/verify] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleWhatsappEmbeddedSave(req, res) {
  try {
    const { workspace_id, waba_id, phone_number_id, display_name, quality_rating, connection_mode } = req.body || {};
    if (!workspace_id || !waba_id || !phone_number_id) {
      return res.status(400).json({ ok: false, error: 'workspace_id, waba_id, and phone_number_id are required' });
    }
    if (!isUUID(workspace_id)) return res.status(400).json({ ok: false, error: 'Invalid workspace_id format' });

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Save the WhatsApp channel config — the WABA is already registered on
    // so our app knows which WABA/phone to use for this workspace.
    const config = {
      waba_id,
      phone_number_id,
      phone_number: null,
      business_name: display_name || null,
      connected_via: 'embedded_signup_hosted',
      connected_at: new Date().toISOString(),
      quality_rating: quality_rating || null,
      connection_mode: connection_mode || 'coexistence',
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
    return res.status(500).json({ ok: false, error: e.message });
  }
}


// ── Send an outbound message via provider abstraction ────────────────────
// ── Debug send: returns the raw Meta API error for diagnosis ───────────
async function handleSendDebug(req, res) {
  try {
    const { conversation_id, workspace_id } = req.body || {};
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // If no workspace_id — dump ALL whatsapp configs (sanitized)
    if (!workspace_id || workspace_id === 'show_config') {
      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
      return res.status(200).json({
        configs: (cfgs || []).map(c => ({
          workspace_id: c.workspace_id,
          enabled: c.enabled,
          phone_number_id: c.config?.phone_number_id,
          waba_id: c.config?.waba_id,
          phone_number: c.config?.phone_number,
          has_token: !!c.config?.access_token,
          token_preview: c.config?.access_token ? c.config.access_token.slice(0, 15) + '...' : null,
          connected_via: c.config?.connected_via,
          connected_at: c.config?.connected_at,
          all_config_keys: Object.keys(c.config || {}),
        })),
      });
    }

    const { to_override, list_convs } = req.body || {};

    // List conversations mode
    if (list_convs) {
      const { data: convs } = await sb.from('conversations')
        .select('id,external_id,channel,last_message,updated_at')
        .eq('workspace_id', workspace_id)
        .eq('channel', 'whatsapp')
        .order('updated_at', { ascending: false })
        .limit(10);
      return res.status(200).json({ conversations: convs || [] });
    }
    const { data: conv } = conversation_id && conversation_id !== '00000000-0000-0000-0000-000000000000' ? await sb.from('conversations').select('*').eq('id', conversation_id).single() : { data: null };
    const { data: cfg } = await sb.from('channel_configs').select('*').eq('workspace_id', workspace_id).eq('channel', 'whatsapp').single();
    const { phone_number_id, access_token } = cfg?.config || {};
    const GRAPH = 'https://graph.facebook.com/v19.0';
    const to = to_override || conv?.external_id;
    const r = await fetch(`${GRAPH}/${phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: 'Debug test' },
      }),
    });
    const json = await r.json();
    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      meta_response: json,
      phone_number_id,
      token_preview: access_token ? access_token.slice(0, 15) + '...' : null,
      has_token: !!access_token,
      to: conv?.external_id,
      channel: conv?.channel,
      cfg_enabled: cfg?.enabled,
      all_config_keys: Object.keys(cfg?.config || {}),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}



async function handleSend(req, res) {
  try {
    const { message_id, conversation_id, workspace_id, channel, body: text, attachments, template, message_type, location, media_url, media_type } = req.body || {};
    if (!conversation_id || !workspace_id || !channel) {
      return res.status(400).json({ error: 'Missing fields: conversation_id, workspace_id, channel' });
    }
    let media = Array.isArray(attachments) && attachments.length ? attachments[0] : null;
    if (!media && media_url && media_type) media = { url: media_url, type: media_type };
    const isLocation = message_type === 'location' && location?.latitude;
    if (!text && !media && !template?.name && !isLocation) return res.status(400).json({ error: 'Message must have text, an attachment, or a template' });

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
    const providerKey = channel === 'whatsapp' ? 'whatsapp:cloud' : channel;
    const provider = getProvider(providerKey);
    const result = await provider.sendMessage(cfg.config, {
      to: conv.external_id, text, media, template, message_id, conversation_id, workspace_id,
      ...(isLocation ? { location } : {}),
    }, { sb });

    // 4. Update message status
    if (message_id) {
      await sb.from('messages').update({
        ...(result.external_id ? { external_id: result.external_id } : {}),
        status: 'sent',
        error_reason: null,
      }).eq('id', message_id);
    }

    // 5. Update conversation
    const { sender_id, sender_name } = req.body || {};
    await sb.from('conversations').update({
      last_message: text || (media ? `[${media.type}]` : ''),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation_id);

    // ── Auto-assign-on-reply (replaces the missing DB trigger) ───────────────
    // If the conversation is still unassigned and a real human is sending
    // (sender_id is a UUID, not null/undefined), claim it for them immediately.
    // This ensures no chat stays in limbo after a staff member engages.
    if (sender_id) {
      const { data: existingConv } = await sb.from('conversations')
        .select('assigned_to').eq('id', conversation_id).maybeSingle();
      if (!existingConv?.assigned_to) {
        await sb.from('conversations').update({
          assigned_to: sender_id,
          assigned_to_name: sender_name || null,
          status: 'open',
        }).eq('id', conversation_id);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    if (req.body?.message_id) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_KEY);
      // Store a clean, user-friendly reason.
      // WINDOW_EXPIRED is a special sentinel the frontend checks to show
      // a "Send Template" CTA instead of a bare red X.
      const reason = err.windowExpired
        ? 'WINDOW_EXPIRED'
        : (err.message || 'Unknown error').slice(0, 500);
      await sb2.from('messages').update({ status: 'failed', error_reason: reason }).eq('id', req.body.message_id);
    }
    if (err.windowExpired) {
      return res.status(400).json({ error: 'WINDOW_EXPIRED', windowExpired: true, message: 'The 24-hour messaging window has closed. You must use an approved WhatsApp template to re-engage this contact.' });
    }
    return res.status(500).json({ error: err.message });
  }
}

// ── WhatsApp Manual Connect (Cloud API) ──────────────────────────────────
async function handleWhatsappManualConnect(req, res) {
  // Validate token, discover/validate WABA + phone, check registration status,
  // auto-setup if possible, return connected or needs_registration.
  try {
    const { workspace_id, access_token, waba_id, phone_number_id } = req.body || {};
    if (!workspace_id || !access_token || !waba_id || !phone_number_id) {
      return res.status(400).json({ ok: false, error: 'access_token, waba_id and phone_number_id are all required' });
    }

    // Step 1: validate token (throws with user-friendly message on failure)
    await validateToken(access_token);

    // Step 2: WABA ID provided directly — no auto-discovery
    const resolvedWabaId = waba_id.trim();

    // Step 3: Phone Number ID provided directly — no auto-discovery
    const resolvedPhoneId = phone_number_id.trim();

    // Step 4: get full phone details
    const phone = await getPhoneDetails(access_token, resolvedPhoneId);

    // Step 5: check if registered for Cloud API
    if (!isPhoneRegistered(phone)) {
      // Not registered — tell frontend to launch the registration wizard
      return res.status(200).json({
        ok: true,
        needs_registration: true,
        phone_number_id: resolvedPhoneId,
        waba_id: resolvedWabaId,
        phone_number: phone.display_phone_number,
        verified_name: phone.verified_name,
      });
    }

    // Step 6: Save the verify_token to DB BEFORE subscribing webhooks.
    // Meta's callback verification ping arrives immediately when we call
    // subscribeWebhooks — if the token isn't in the DB yet, our webhook
    // handler returns 403 and Meta rejects the connection (#2200).
    const { createClient } = await import('../_lib/dbFactory.js');
    const sb = createClient(
      'https://pfbaepibelomiutlotkn.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const verifyToken = 'nyasa_' + resolvedWabaId.slice(-8);

    // Write a partial config first so the webhook verify ping can succeed
    await sb.from('channel_configs').upsert({
      workspace_id, channel: 'whatsapp', enabled: true,
      config: {
        provider: 'cloud',
        access_token,
        phone_number_id: resolvedPhoneId,
        waba_id: resolvedWabaId,
        verify_token: verifyToken,
        connected_via: 'manual_cloud_api',
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    // Step 7: now subscribe webhooks + fetch full phone details
    const setup = await autoSetup(access_token, resolvedWabaId, resolvedPhoneId);

    // Step 8: update config with full phone details from setup
    const config = {
      provider: 'cloud',
      access_token,
      phone_number_id: resolvedPhoneId,
      waba_id: resolvedWabaId,
      verify_token: verifyToken,
      phone_number: setup.phone.display_phone_number,
      verified_name: setup.phone.verified_name,
      quality_rating: setup.phone.quality_rating,
      name_status: setup.phone.name_status,
      account_mode: setup.phone.account_mode,
      connected_via: 'manual_cloud_api',
      connected_at: new Date().toISOString(),
    };

    await sb.from('channel_configs').upsert({
      workspace_id, channel: 'whatsapp', enabled: true, config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error('[channels/whatsapp-manual-connect]', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ── WhatsApp Complete Registration (after manual-connect needs_registration) ──
// Registers the phone number on Cloud API and updates the EXISTING config
// (which was already saved with verify_token + webhook subscription by
// whatsapp-manual-connect). Does NOT re-subscribe webhooks — that's already done.
async function handleWhatsappCompleteRegistration(req, res) {
  try {
    const { workspace_id, access_token, phone_number_id, waba_id, pin } = req.body || {};
    if (!workspace_id || !access_token || !phone_number_id || !pin) {
      return res.status(400).json({ ok: false, error: 'workspace_id, access_token, phone_number_id and pin are required' });
    }

    // Step 1: Register the phone number on Cloud API
    const { registerPhoneNumber } = await import('../_lib/whatsappGuidedSetup.js');
    await registerPhoneNumber(access_token, phone_number_id, pin);

    // Step 2: Fetch fresh phone details to confirm registration
    const { getPhoneDetails, isPhoneRegistered } = await import('../_lib/whatsappSetup.js');
    const phone = await getPhoneDetails(access_token, phone_number_id);
    if (!isPhoneRegistered(phone)) {
      return res.status(400).json({ ok: false, error: 'Registration was accepted by Meta but the number is not yet showing as VERIFIED. Wait 30 seconds and try connecting again.' });
    }

    // Step 3: Update the existing config with full phone details (webhook already subscribed)
    const { createClient } = await import('../_lib/dbFactory.js');
    const sb = createClient('https://pfbaepibelomiutlotkn.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: existing } = await sb.from('channel_configs').select('config').eq('workspace_id', workspace_id).eq('channel', 'whatsapp').maybeSingle();
    if (!existing?.config) {
      return res.status(400).json({ ok: false, error: 'No pending WhatsApp config found. Please restart the connection flow.' });
    }
    const updatedConfig = {
      ...existing.config,
      phone_number: phone.display_phone_number,
      verified_name: phone.verified_name,
      quality_rating: phone.quality_rating,
      name_status: phone.name_status,
      account_mode: phone.account_mode,
      code_verification_status: phone.code_verification_status,
    };
    await sb.from('channel_configs').update({ config: updatedConfig, updated_at: new Date().toISOString() }).eq('workspace_id', workspace_id).eq('channel', 'whatsapp');

    return res.status(200).json({ ok: true, config: updatedConfig });
  } catch (e) {
    console.error('[channels/whatsapp-complete-registration]', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ── WhatsApp Refresh Status ───────────────────────────────────────────────
async function handleWhatsappRefreshStatus(req, res) {
  try {
    const { workspace_id, access_token, phone_number_id, waba_id } = req.body || {};
    if (!workspace_id || !access_token || !phone_number_id) {
      return res.status(400).json({ ok: false, error: 'workspace_id, access_token, phone_number_id required' });
    }
    const phone = await getPhoneDetails(access_token, phone_number_id);
    // Update config in DB with fresh details
    const { createClient } = await import('../_lib/dbFactory.js');
    const sb = createClient('https://pfbaepibelomiutlotkn.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: existing } = await sb.from('channel_configs').select('config').eq('workspace_id', workspace_id).eq('channel', 'whatsapp').maybeSingle();
    if (existing?.config) {
      const updatedConfig = {
        ...existing.config,
        phone_number: phone.display_phone_number,
        verified_name: phone.verified_name,
        quality_rating: phone.quality_rating,
        name_status: phone.name_status,
        account_mode: phone.account_mode,
        code_verification_status: phone.code_verification_status,
      };
      await sb.from('channel_configs').update({ config: updatedConfig, updated_at: new Date().toISOString() }).eq('workspace_id', workspace_id).eq('channel', 'whatsapp');
    }
    return res.status(200).json({ ok: true, phone: {
      phone_number: phone.display_phone_number,
      verified_name: phone.verified_name,
      quality_rating: phone.quality_rating,
      name_status: phone.name_status,
      account_mode: phone.account_mode,
      code_verification_status: phone.code_verification_status,
    }});
  } catch (e) {
    console.error('[channels/whatsapp-refresh-status]', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}



// ── Email: Gmail OAuth one-click connect ──────────────────────────────────
// Uses Google OAuth2 with offline access to get a refresh_token that lets
// Nyasadesk send (via Gmail API / SMTP-OAuth2) and read (via Gmail API)
// on behalf of the workspace owner's Gmail account — no app password needed.
//
// Required env vars (add in Vercel dashboard + .env.local):
//   GOOGLE_CLIENT_ID     — OAuth2 client ID  (type: Web application)
//   GOOGLE_CLIENT_SECRET — OAuth2 client secret
//
// The redirect URI registered in Google Cloud Console must be:
//   https://nyasadesk.com/api/channels?action=gmail-oauth-callback

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GMAIL_REDIRECT_URI   = 'https://nyasadesk.com/api/channels?action=gmail-oauth-callback';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

async function handleGmailOAuthUrl(req, res) {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ ok: false, error: 'workspace_id is required' });
    if (!GOOGLE_CLIENT_ID) return res.status(400).json({ ok: false, error: 'Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel environment variables.' });

    // Encode workspace_id in state param so we know whose token this is on callback
    const state = Buffer.from(JSON.stringify({ workspace_id })).toString('base64url');
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',   // force consent so we always get a refresh_token
      state,
    });
    return res.status(200).json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleGmailOAuthCallback(req, res) {
  // Google redirects GET /api/channels?action=gmail-oauth-callback&code=...&state=...
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.status(302).setHeader('Location', `/settings?email_error=${encodeURIComponent(oauthError)}`).end();
    }
    if (!code || !state) {
      return res.status(302).setHeader('Location', '/settings?email_error=missing_code').end();
    }

    let workspace_id;
    try {
      ({ workspace_id } = JSON.parse(Buffer.from(state, 'base64url').toString()));
    } catch {
      return res.status(302).setHeader('Location', '/settings?email_error=bad_state').end();
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) {
      return res.status(302).setHeader('Location', `/settings?email_error=${encodeURIComponent(tokens.error_description || tokens.error)}`).end();
    }

    // Fetch the user's email address
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.email;
    const name  = profile.name || email;

    // Save to channel_configs
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const config = {
      provider: 'gmail',
      email,
      name,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry:  tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      connected_via: 'gmail_oauth',
      connected_at:  new Date().toISOString(),
    };
    const { error: dbErr } = await sb.from('channel_configs').upsert(
      { workspace_id, channel: 'email', enabled: true, config, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,channel' }
    );
    if (dbErr) {
      return res.status(302).setHeader('Location', `/settings?email_error=${encodeURIComponent(dbErr.message)}`).end();
    }

    // Redirect back to settings with success flag
    return res.status(302).setHeader('Location', `/settings?email_connected=1&email=${encodeURIComponent(email)}`).end();
  } catch (e) {
    console.error('[gmail-oauth-callback]', e);
    return res.status(302).setHeader('Location', `/settings?email_error=${encodeURIComponent(e.message)}`).end();
  }
}

// ── Email: test IMAP/SMTP manual credentials ──────────────────────────────
async function handleEmailTest(req, res) {
  // Basic smoke-test: try to get a fresh Gmail OAuth token (for OAuth configs)
  // or just validate that required SMTP fields are present (for manual configs).
  try {
    const { workspace_id } = req.body || {};
    if (!workspace_id) return res.status(400).json({ ok: false, error: 'workspace_id required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs')
      .select('config').eq('workspace_id', workspace_id).eq('channel', 'email').single();
    if (!cfg?.config) return res.status(400).json({ ok: false, error: 'No email channel configured' });

    const c = cfg.config;
    if (c.provider === 'gmail') {
      // Try refreshing the token to confirm the refresh_token is still valid
      if (!c.refresh_token) return res.status(400).json({ ok: false, error: 'No refresh token stored — reconnect Gmail.' });
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: c.refresh_token, grant_type: 'refresh_token',
        }),
      });
      const data = await r.json();
      if (data.error) return res.status(400).json({ ok: false, error: `Gmail token refresh failed: ${data.error_description || data.error}` });
      return res.status(200).json({ ok: true, message: `Gmail connected as ${c.email}` });
    }

    // Manual IMAP/SMTP — just validate fields are present
    const missing = ['imap_host', 'smtp_host', 'email', 'password'].filter(k => !c[k]);
    if (missing.length) return res.status(400).json({ ok: false, error: `Missing fields: ${missing.join(', ')}` });
    return res.status(200).json({ ok: true, message: `Manual email configured for ${c.email}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Email: send outbound reply via Gmail API (OAuth) or Resend (SMTP fallback) ──
async function handleEmailSend(req, res) {
  try {
    const { workspace_id, conversation_id, to, subject, body, message_id } = req.body || {};
    if (!workspace_id || !to || !body) return res.status(400).json({ ok: false, error: 'workspace_id, to, and body are required' });

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cfg } = await sb.from('channel_configs')
      .select('config').eq('workspace_id', workspace_id).eq('channel', 'email').single();
    if (!cfg?.config) return res.status(400).json({ ok: false, error: 'Email channel not configured' });

    const c = cfg.config;
    let sentOk = false;

    if (c.provider === 'gmail' && c.refresh_token) {
      // ── Refresh access token ──
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: c.refresh_token, grant_type: 'refresh_token',
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) throw new Error(`Gmail token refresh failed: ${tokenData.error_description || tokenData.error}`);
      const accessToken = tokenData.access_token;

      // ── Build RFC 2822 raw email ──
      const fromHeader = c.name ? `${c.name} <${c.email}>` : c.email;
      const raw = [
        `From: ${fromHeader}`,
        `To: ${to}`,
        `Subject: ${subject || 'Re: Your enquiry'}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body,
      ].join('\r\n');
      const encodedRaw = Buffer.from(raw).toString('base64url');

      // ── Send via Gmail API ──
      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedRaw }),
      });
      const gmailData = await gmailRes.json();
      if (gmailData.error) throw new Error(gmailData.error.message || 'Gmail send failed');
      sentOk = true;

      // Update stored access token
      await sb.from('channel_configs').update({
        config: { ...c, access_token: accessToken, token_expiry: Date.now() + (tokenData.expires_in || 3600) * 1000 },
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspace_id).eq('channel', 'email');

    } else if (RESEND_API_KEY) {
      // ── Fallback: Resend (for manual IMAP configs or Gmail without refresh_token) ──
      const fromAddr = c.email ? `Nyasadesk <${c.email}>` : 'Nyasadesk <noreply@nyasadesk.com>';
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddr, to, subject: subject || 'Re: Your enquiry', text: body }),
      });
      const rd = await r.json();
      if (!r.ok) throw new Error(rd.message || 'Resend send failed');
      sentOk = true;
    } else {
      throw new Error('No email send method available. Connect Gmail or configure Resend.');
    }

    // Mark message as sent in DB
    if (message_id) {
      await sb.from('messages').update({ status: 'sent', error_reason: null }).eq('id', message_id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[email-send]', e);
    if (req.body?.message_id) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_KEY);
      await sb2.from('messages').update({ status: 'failed', error_reason: e.message.slice(0, 500) }).eq('id', req.body.message_id);
    }
    return res.status(500).json({ ok: false, error: e.message });
  }
}
