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
import { AI_AGENT_TEMPLATES, generateDraftReply } from '../_lib/aiAgents.js';
import { ingestUrl, ingestFile } from '../_lib/knowledgeIngest.js';
import {
  getOrCreateSettings, saveSettings, createQuotation, updateQuotation, convertQuotationToInvoice,
  createInvoice, updateInvoice, recordInvoicePayment, getOrGeneratePdfUrl,
} from '../_lib/documents.js';
import { discoverWabas, connectWaba, createWaba, addPhoneNumber, requestVerificationCode, verifyPhoneCode, registerPhoneNumber } from '../_lib/whatsappGuidedSetup.js';
import { validateToken, discoverWabas as discoverWabasManual, getWabaInfo, listPhoneNumbers, getPhoneDetails, isPhoneRegistered, autoSetup } from '../_lib/whatsappSetup.js';
import { freshSetup } from '../_lib/freshSetup.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = 'https://nyasadesk.com';
const BRIDGE_API = 'https://officialapi.wasapflow.com/bridge/v1';

export default async function handler(req, res) {
  // AI Agents actions live here too -- api/ is hard-capped at 12 files on
  // Vercel Hobby (see AGENTS.md), so new modules get added as actions on an
  // existing route rather than new files. Logic itself lives in
  // api/_lib/aiAgents.js, this file just dispatches.
  // Quotation/Invoice Builder actions live here too, same reasoning as AI
  // Agents above -- logic itself lives in api/_lib/documents.js.
  const getActions = ['hosted-connect', 'templates', 'ai-agents-list', 'ai-templates',
    'doc-settings-get', 'quotation-list', 'quotation-get', 'invoice-list', 'invoice-get'];
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
  if (action === 'templates')     return handleListTemplates(req, res);
  if (action === 'ai-templates')   return handleAiTemplates(req, res);
  if (action === 'ai-agents-list') return handleAiAgentsList(req, res);
  if (action === 'ai-agents-save') return handleAiAgentsSave(req, res);
  if (action === 'ai-agents-delete') return handleAiAgentsDelete(req, res);
  if (action === 'ai-draft')       return handleAiDraft(req, res);
  if (action === 'ai-knowledge-from-url')  return handleAiKnowledgeFromUrl(req, res);
  if (action === 'ai-knowledge-from-file') return handleAiKnowledgeFromFile(req, res);
  if (action === 'doc-settings-get')   return handleDocSettingsGet(req, res);
  if (action === 'doc-settings-save')  return handleDocSettingsSave(req, res);
  if (action === 'quotation-create')   return handleQuotationCreate(req, res);
  if (action === 'quotation-update')   return handleQuotationUpdate(req, res);
  if (action === 'quotation-list')     return handleQuotationList(req, res);
  if (action === 'quotation-get')      return handleQuotationGet(req, res);
  if (action === 'quotation-convert')  return handleQuotationConvert(req, res);
  if (action === 'invoice-create')     return handleInvoiceCreate(req, res);
  if (action === 'invoice-update')     return handleInvoiceUpdate(req, res);
  if (action === 'invoice-list')       return handleInvoiceList(req, res);
  if (action === 'invoice-get')        return handleInvoiceGet(req, res);
  if (action === 'invoice-record-payment') return handleInvoiceRecordPayment(req, res);
  if (action === 'document-send')      return handleDocumentSend(req, res);
  if (action === 'whatsapp-guided-discover') return handleWhatsappGuidedDiscover(req, res);
  if (action === 'whatsapp-guided-connect') return handleWhatsappGuidedConnect(req, res);
  if (action === 'whatsapp-guided-create-waba')   return handleWhatsappGuidedCreateWaba(req, res);
  if (action === 'whatsapp-guided-add-phone')      return handleWhatsappGuidedAddPhone(req, res);
  if (action === 'whatsapp-guided-request-code')   return handleWhatsappGuidedRequestCode(req, res);
  if (action === 'whatsapp-guided-verify-code')    return handleWhatsappGuidedVerifyCode(req, res);
  if (action === 'whatsapp-guided-register-phone') return handleWhatsappGuidedRegisterPhone(req, res);
  if (action === 'whatsapp-guided-fresh-setup')   return handleWhatsappGuidedFreshSetup(req, res);
  if (action === 'whatsapp-manual-connect') return handleWhatsappManualConnect(req, res);
  return handleSend(req, res);
}

// ── Document Settings ────────────────────────────────────────────────────
async function handleDocSettingsGet(req, res) {
  try {
    const workspace_id = req.query.workspace_id;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const settings = await getOrCreateSettings(sb, workspace_id);
    return res.status(200).json({ ok: true, settings });
  } catch (e) {
    console.error('[doc-settings-get] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleDocSettingsSave(req, res) {
  try {
    const { workspace_id, ...patch } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const settings = await saveSettings(sb, workspace_id, patch);
    return res.status(200).json({ ok: true, settings });
  } catch (e) {
    console.error('[doc-settings-save] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Quotations ───────────────────────────────────────────────────────────
async function handleQuotationCreate(req, res) {
  try {
    const { workspace_id, ...input } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const quotation = await createQuotation(sb, workspace_id, input);
    return res.status(200).json({ ok: true, quotation });
  } catch (e) {
    console.error('[quotation-create] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleQuotationUpdate(req, res) {
  try {
    const { workspace_id, id, ...patch } = req.body || {};
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const quotation = await updateQuotation(sb, workspace_id, id, patch);
    return res.status(200).json({ ok: true, quotation });
  } catch (e) {
    console.error('[quotation-update] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleQuotationList(req, res) {
  try {
    const { workspace_id, status } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    let q = sb.from('quotations').select('*').eq('workspace_id', workspace_id).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ ok: true, quotations: data });
  } catch (e) {
    console.error('[quotation-list] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleQuotationGet(req, res) {
  try {
    const { workspace_id, id } = req.query;
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { pdfUrl, doc } = await getOrGeneratePdfUrl(sb, workspace_id, 'quotation', id);
    return res.status(200).json({ ok: true, quotation: doc, pdf_url: pdfUrl });
  } catch (e) {
    console.error('[quotation-get] error:', e);
    return res.status(404).json({ ok: false, error: e.message });
  }
}

async function handleQuotationConvert(req, res) {
  try {
    const { workspace_id, id, ...overrides } = req.body || {};
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const invoice = await convertQuotationToInvoice(sb, workspace_id, id, overrides);
    return res.status(200).json({ ok: true, invoice });
  } catch (e) {
    console.error('[quotation-convert] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ── Invoices ─────────────────────────────────────────────────────────────
async function handleInvoiceCreate(req, res) {
  try {
    const { workspace_id, ...input } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const invoice = await createInvoice(sb, workspace_id, input);
    return res.status(200).json({ ok: true, invoice });
  } catch (e) {
    console.error('[invoice-create] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleInvoiceUpdate(req, res) {
  try {
    const { workspace_id, id, ...patch } = req.body || {};
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const invoice = await updateInvoice(sb, workspace_id, id, patch);
    return res.status(200).json({ ok: true, invoice });
  } catch (e) {
    console.error('[invoice-update] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

async function handleInvoiceList(req, res) {
  try {
    const { workspace_id, status } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    let q = sb.from('invoices').select('*').eq('workspace_id', workspace_id).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ ok: true, invoices: data });
  } catch (e) {
    console.error('[invoice-list] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleInvoiceGet(req, res) {
  try {
    const { workspace_id, id } = req.query;
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { pdfUrl, doc } = await getOrGeneratePdfUrl(sb, workspace_id, 'invoice', id);
    const { data: payments } = await sb.from('invoice_payments').select('*').eq('invoice_id', id).order('paid_at', { ascending: false });
    return res.status(200).json({ ok: true, invoice: doc, pdf_url: pdfUrl, payments: payments || [] });
  } catch (e) {
    console.error('[invoice-get] error:', e);
    return res.status(404).json({ ok: false, error: e.message });
  }
}

async function handleInvoiceRecordPayment(req, res) {
  try {
    const { workspace_id, id, ...payment } = req.body || {};
    if (!workspace_id || !id) return res.status(400).json({ error: 'workspace_id and id are required' });
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const invoice = await recordInvoicePayment(sb, workspace_id, id, payment);
    return res.status(200).json({ ok: true, invoice });
  } catch (e) {
    console.error('[invoice-record-payment] error:', e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ── Share a generated document: attach to chat, and/or push out the
// conversation's channel (WhatsApp today; email once RESEND_API_KEY is
// configured). "Download" needs no backend action -- the frontend just
// links straight to pdf_url from quotation-get/invoice-get.
async function handleDocumentSend(req, res) {
  try {
    const { workspace_id, doc_type, id, conversation_id, via } = req.body || {};
    if (!workspace_id || !doc_type || !id || !conversation_id) {
      return res.status(400).json({ error: 'workspace_id, doc_type, id, and conversation_id are required' });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { doc, pdfUrl } = await getOrGeneratePdfUrl(sb, workspace_id, doc_type, id);
    const filename = `${doc.number}.pdf`;
    const table = doc_type === 'invoice' ? 'invoices' : 'quotations';

    const { data: conv } = await sb.from('conversations').select('external_id, channel').eq('id', conversation_id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const channel = via === 'email' ? 'email' : conv.channel;

    if (channel === 'email') {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) return res.status(400).json({ ok: false, error: 'Email sending is not configured yet (needs a Resend API key).' });
      const settings = await getOrCreateSettings(sb, workspace_id);
      const pdfRes = await fetch(pdfUrl);
      const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Resend only allows sending "from" a domain it has verified for
          // THIS Resend account (nyasadesk.com) -- a workspace's own business
          // email (e.g. hello@brandfletch.com) is on a domain we don't
          // control and Resend would reject it. So we always send from our
          // own verified address, with the workspace's brand as the display
          // name, and set reply_to to their real inbox so customer replies
          // land in the right place.
          from: `${settings.company_name || 'NyasaDesk'} <documents@nyasadesk.com>`,
          reply_to: settings.email || undefined,
          to: doc.customer_email,
          subject: `${doc_type === 'invoice' ? 'Invoice' : 'Quotation'} ${doc.number} from ${settings.company_name || 'us'}`,
          html: `<p>Hi ${doc.customer_name},</p><p>Please find attached your ${doc_type} <b>${doc.number}</b>.</p>`,
          attachments: [{ filename, content: pdfBase64 }],
        }),
      });
      const json = await r.json();
      if (!r.ok) return res.status(500).json({ ok: false, error: json.message || 'Failed to send email' });
    } else if (channel !== 'website') {
      const { data: cfg } = await sb.from('channel_configs').select('*').eq('workspace_id', workspace_id).eq('channel', channel).single();
      if (!cfg?.enabled) return res.status(400).json({ ok: false, error: 'Channel not configured' });
      const providerKey = channel === 'whatsapp'
        ? (cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
           : cfg.config?.bird_workspace_id ? 'whatsapp:bird'
           : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud')
        : channel;
      const provider = getProvider(providerKey);
      await provider.sendMessage(cfg.config, {
        to: conv.external_id, media: { type: 'document', url: pdfUrl, filename },
        conversation_id, workspace_id,
      }, { sb });
    }

    // Always attach to the chat thread itself so there's a record + the
    // customer sees it in-app even on the website channel.
    await sb.from('messages').insert({
      workspace_id, conversation_id, direction: 'outbound', channel: conv.channel,
      body: '', attachments: [{ type: 'document', url: pdfUrl, filename, mime: 'application/pdf' }],
      sender_name: 'System', status: 'sent',
    });
    await sb.from('conversations').update({ last_message: `[${doc_type === 'invoice' ? 'Invoice' : 'Quotation'}] ${filename}`, last_message_at: new Date().toISOString() }).eq('id', conversation_id);

    // First time a draft document actually goes out, mark it "sent".
    if (doc.status === 'draft') await sb.from(table).update({ status: 'sent' }).eq('id', id);

    return res.status(200).json({ ok: true, pdf_url: pdfUrl });
  } catch (e) {
    console.error('[document-send] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
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
      'operating_hours', 'automation_mode', 'status'];
    const payload = {};
    for (const k of ALLOWED) if (k in fields) payload[k] = fields[k];

    if (id) {
      const { data, error } = await sb.from('ai_agents').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', workspace_id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, agent: data });
    } else {
      const { data, error } = await sb.from('ai_agents').insert({ workspace_id, ...payload }).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, agent: data });
    }
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
    return res.status(400).json({ ok: false, error: e.message });
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
    const { message_id, conversation_id, workspace_id, channel, body: text, attachments, template } = req.body || {};
    if (!conversation_id || !workspace_id || !channel) {
      return res.status(400).json({ error: 'Missing fields: conversation_id, workspace_id, channel' });
    }
    const media = Array.isArray(attachments) && attachments.length ? attachments[0] : null;
    if (!text && !media && !template?.name) return res.status(400).json({ error: 'Message must have text, an attachment, or a template' });

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
      to: conv.external_id, text, media, template, message_id, conversation_id, workspace_id,
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
    await sb.from('conversations').update({
      last_message: text || (media ? `[${media.type}]` : ''),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    if (req.body?.message_id) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_KEY);
      // Store the real failure reason (e.g. Meta's actual Graph API rejection,
      // or our own pre-flight format check) so the UI can show it instead of
      // just a bare red X with no explanation.
      await sb2.from('messages').update({ status: 'failed', error_reason: (err.message || 'Unknown error').slice(0, 500) }).eq('id', req.body.message_id);
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
    if (!workspace_id || !access_token) {
      return res.status(400).json({ ok: false, error: 'workspace_id and access_token are required' });
    }

    // Step 1: validate token (throws with user-friendly message on failure)
    await validateToken(access_token);

    // Step 2: resolve WABA
    let resolvedWabaId = waba_id || null;
    let wabas = null;
    if (!resolvedWabaId) {
      wabas = await discoverWabasManual(access_token);
      resolvedWabaId = wabas[0]?.waba_id;
      if (!resolvedWabaId) {
        return res.status(400).json({ ok: false, error: 'No WhatsApp Business Account found for this token. Assign the System User to a WABA with Manage permission in Business Settings > System Users > Add Assets.' });
      }
    }

    // Step 3: resolve phone number
    let resolvedPhoneId = phone_number_id || null;
    if (!resolvedPhoneId) {
      const phones = await listPhoneNumbers(access_token, resolvedWabaId);
      resolvedPhoneId = phones[0]?.id;
      if (!resolvedPhoneId) {
        return res.status(400).json({ ok: false, error: 'No phone numbers found on this WhatsApp Business Account. Add one in Meta Business Manager first.' });
      }
    }

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

    // Step 6: fully set up (subscribe webhooks, fetch limits, etc.)
    const setup = await autoSetup(access_token, resolvedWabaId, resolvedPhoneId);

    const config = {
      provider: 'cloud',
      access_token,
      phone_number_id: resolvedPhoneId,
      waba_id: resolvedWabaId,
      verify_token: 'nyasa_' + resolvedWabaId.slice(-8),
      phone_number: setup.phone.display_phone_number,
      verified_name: setup.phone.verified_name,
      quality_rating: setup.phone.quality_rating,
      name_status: setup.phone.name_status,
      account_mode: setup.phone.account_mode,
      connected_via: 'manual_cloud_api',
      connected_at: new Date().toISOString(),
    };

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      'https://pfbaepibelomiutlotkn.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
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
