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
import { buildEmail } from '../_lib/emailTemplate.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = 'https://nyasadesk.com';

export default async function handler(req, res) {
  // AI Agents actions live here too -- api/ is hard-capped at 12 files on
  // Vercel Hobby (see AGENTS.md), so new modules get added as actions on an
  // existing route rather than new files. Logic itself lives in
  // api/_lib/aiAgents.js, this file just dispatches.
  // Quotation/Invoice Builder actions live here too, same reasoning as AI
  // Agents above -- logic itself lives in api/_lib/documents.js.
  const getActions = [
    'templates', 'ai-templates', 'ai-agent-list', 'ai-agent-get',
    'knowledge-list', 'knowledge-search', 'billing-status',
    'doc-settings-get', 'quotation-list', 'quotation-get', 'invoice-list', 'invoice-get',
    'sales-list', 'sales-commission-report', 'gmail-oauth-url',
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
  if (action === 'whatsapp-refresh-status') return handleWhatsappRefreshStatus(req, res);
  if (action === 'whatsapp-complete-registration') return handleWhatsappCompleteRegistration(req, res);
  if (action === 'whatsapp-embedded-save')   return handleWhatsappEmbeddedSave(req, res);
  if (action === 'sales-create')  return handleSalesCreate(req, res);
  if (action === 'sales-list')    return handleSalesList(req, res);
  if (action === 'sales-verify')  return handleSalesVerify(req, res);
  if (action === 'sales-delete')  return handleSalesDelete(req, res);
  if (action === 'sales-commission-report') return handleSalesCommissionReport(req, res);
  if (action === 'sales-commission-pdf')   return handleSalesCommissionPdf(req, res);
  if (action === 'gmail-oauth-url')       return handleGmailOAuthUrl(req, res);
  if (action === 'gmail-oauth-callback')  return handleGmailOAuthCallback(req, res);
  if (action === 'email-test')            return handleEmailTest(req, res);
  if (action === 'email-send')            return handleEmailSend(req, res);
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
          html: buildEmail({
            preheader: `Your ${doc_type === 'invoice' ? 'Invoice' : 'Quotation'} ${doc.number} from ${settings.company_name || 'us'}`,
            body: `
              <h1 style="margin:0 0 16px;color:#E9EDF0;font-size:22px;font-weight:700;line-height:1.3;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                ${doc_type === 'invoice' ? 'Invoice' : 'Quotation'}
                ${doc.number}
              </h1>
              <p style="margin:0 0 12px;color:#8696A0;font-size:15px;line-height:1.6;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                Hi <strong style="color:#E9EDF0;">${doc.customer_name}</strong>,
              </p>
              <p style="margin:0 0 20px;color:#8696A0;font-size:15px;line-height:1.6;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                Please find your ${doc_type === 'invoice' ? 'invoice' : 'quotation'}
                <strong style="color:#25D366;">${doc.number}</strong> attached to this email,
                sent by <strong style="color:#E9EDF0;">${settings.company_name || 'us'}</strong>.
              </p>
              ${doc_type === 'invoice' ? `<p style="margin:0;color:#8696A0;font-size:14px;line-height:1.6;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                If you have any questions about this invoice, please reply to this email.
              </p>` : `<p style="margin:0;color:#8696A0;font-size:14px;line-height:1.6;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                This quotation is valid for 30 days. Reply to accept or ask any questions.
              </p>`}`,
            footer: `Sent via Nyasadesk on behalf of ${settings.company_name || 'your service provider'}.`,
          }),
          attachments: [{ filename, content: pdfBase64 }],
        }),
      });
      const json = await r.json();
      if (!r.ok) return res.status(500).json({ ok: false, error: json.message || 'Failed to send email' });
    } else if (channel !== 'website') {
      const { data: cfg } = await sb.from('channel_configs').select('*').eq('workspace_id', workspace_id).eq('channel', channel).single();
      if (!cfg?.enabled) return res.status(400).json({ ok: false, error: 'Channel not configured' });
      const providerKey = channel === 'whatsapp' ? 'whatsapp:cloud' : channel;
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
    const { createClient } = await import('@supabase/supabase-js');
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
    const { createClient } = await import('@supabase/supabase-js');
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
    const { createClient } = await import('@supabase/supabase-js');
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

// ── Sales Tracking ────────────────────────────────────────────────────────

async function handleSalesCreate(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const { workspace_id, conversation_id, contact_name, contact_phone,
            document_id, document_type, document_number,
            sale_value, currency, notes } = req.body || {};
    if (!workspace_id || !sale_value) return res.status(400).json({ error: 'workspace_id and sale_value are required' });

    // Resolve agent display name from profile
    const { data: profile } = await sb.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const agent_name = profile?.full_name || user.email || 'Unknown';

    const { data, error } = await sb.from('sales').insert({
      workspace_id,
      agent_id: user.id,
      agent_name,
      conversation_id: conversation_id || null,
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,
      document_id: document_id || null,
      document_type: document_type || null,
      document_number: document_number || null,
      sale_value: Number(sale_value),
      currency: currency || 'MWK',
      notes: notes || null,
      status: 'claimed',
    }).select().single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, sale: data });
  } catch (e) {
    console.error('[sales-create]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleSalesList(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const { workspace_id, agent_id, from_date, to_date } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    let q = sb.from('sales').select('*').eq('workspace_id', workspace_id).order('created_at', { ascending: false });
    if (agent_id) q = q.eq('agent_id', agent_id);
    if (from_date) q = q.gte('created_at', from_date);
    if (to_date) q = q.lte('created_at', to_date);

    const { data, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, sales: data || [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleSalesVerify(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const { sale_id, status } = req.body || {};
    if (!sale_id || !status) return res.status(400).json({ error: 'sale_id and status required' });
    // Only admins (role='admin') or the workspace owner (no workspace_id set
    // on their own profile, because workspace_id points to the owner in
    // invited members' rows) can verify/dispute sales.
    const { data: profile } = await sb.from('profiles').select('role, workspace_id').eq('id', user.id).maybeSingle();
    const isOwner = !profile?.workspace_id; // workspace owner has no workspace_id (they ARE the workspace)
    const isAdmin = profile?.role === 'admin' || profile?.role === 'sales_manager';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can verify sales' });
    }
    const { data, error } = await sb.from('sales')
      .update({ status, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', sale_id).select().single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, sale: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleSalesDelete(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const { sale_id } = req.body || {};
    if (!sale_id) return res.status(400).json({ error: 'sale_id required' });
    // Only the agent who created it (if still 'claimed') or an admin can delete
    const { data: sale } = await sb.from('sales').select('agent_id, status').eq('id', sale_id).maybeSingle();
    if (!sale) return res.status(404).json({ error: 'Not found' });
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const isAdmin = !profile?.workspace_id || profile?.role === 'admin';
    if (!isAdmin && (sale.agent_id !== user.id || sale.status !== 'claimed')) {
      return res.status(403).json({ error: 'Cannot delete a verified sale' });
    }
    await sb.from('sales').delete().eq('id', sale_id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Auth helper (used by Sales actions) ──────────────────────────────────
// Verifies the Bearer token from the Authorization header, returns the user
// and a service-role Supabase client. Sends 401 and returns { user: null }
// when the token is missing or invalid so callers can early-return.
async function requireAuth(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return { user: null, sb: null };
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: { user } = {}, error } = await sb.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return { user: null, sb: null };
  }
  return { user, sb };
}

// ── Sales Commission Report (GET) ─────────────────────────────────────────
async function handleSalesCommissionReport(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const { workspace_id, agent_id, date_from, date_to, commission_rate } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const rate = parseFloat(commission_rate);
    const cRate = Number.isFinite(rate) ? rate : 0.10;

    let q = sb.from('sales')
      .select('id, agent_id, agent_name, sale_value, currency, created_at, profiles!sales_agent_id_fkey(full_name)')
      .eq('workspace_id', workspace_id)
      .eq('status', 'verified');
    if (agent_id) q = q.eq('agent_id', agent_id);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to);
    q = q.order('created_at', { ascending: true });

    const { data: sales, error } = await q.limit(2000);
    if (error) throw new Error(error.message);

    // Group by agent
    const groups = {};
    for (const s of sales || []) {
      const aid = s.agent_id || 'unknown';
      const name = s.agent_name || s.profiles?.full_name || 'Unknown Agent';
      if (!groups[aid]) groups[aid] = { agent_id: aid, agent_name: name, total_sales_count: 0, total_value: 0, currency: s.currency || 'MWK' };
      groups[aid].total_sales_count += 1;
      groups[aid].total_value += Number(s.sale_value) || 0;
    }

    const currency = (sales && sales[0]?.currency) || 'MWK';
    const agent_summaries = Object.values(groups).map(g => ({
      ...g,
      total_value: Math.round(g.total_value * 100) / 100,
      commission_amount: Math.round(g.total_value * cRate * 100) / 100,
    })).sort((a, b) => b.total_value - a.total_value);

    const grand_total_value = Math.round(agent_summaries.reduce((s, a) => s + a.total_value, 0) * 100) / 100;
    const grand_total_commission = Math.round(agent_summaries.reduce((s, a) => s + a.commission_amount, 0) * 100) / 100;

    return res.status(200).json({
      ok: true,
      agent_summaries,
      grand_total_value,
      grand_total_commission,
      period: { from: date_from || null, to: date_to || null },
      commission_rate: cRate,
      currency,
    });
  } catch (e) {
    console.error('[sales-commission-report]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Sales Commission PDF (POST) ───────────────────────────────────────────
async function handleSalesCommissionPdf(req, res) {
  try {
    const { user, sb } = await requireAuth(req, res);
    if (!user) return;
    const {
      workspace_id, agent_id, date_from, date_to,
      commission_rate, business_name, report_title,
    } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const rate = parseFloat(commission_rate);
    const cRate = Number.isFinite(rate) ? rate : 0.10;
    const title = report_title || 'Sales Commission Report';
    const bizName = business_name || 'Your Business';

    // Fetch the same data as the report action
    let q = sb.from('sales')
      .select('id, agent_id, agent_name, sale_value, currency, created_at, profiles!sales_agent_id_fkey(full_name)')
      .eq('workspace_id', workspace_id)
      .eq('status', 'verified');
    if (agent_id) q = q.eq('agent_id', agent_id);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to);
    q = q.order('created_at', { ascending: true });

    const { data: sales, error } = await q.limit(2000);
    if (error) throw new Error(error.message);

    const groups = {};
    for (const s of sales || []) {
      const aid = s.agent_id || 'unknown';
      const name = s.agent_name || s.profiles?.full_name || 'Unknown Agent';
      if (!groups[aid]) groups[aid] = { agent_name: name, count: 0, value: 0 };
      groups[aid].count += 1;
      groups[aid].value += Number(s.sale_value) || 0;
    }
    const currency = (sales && sales[0]?.currency) || 'MWK';
    const rows = Object.values(groups).map(g => ({
      agent: g.agent_name,
      count: g.count,
      value: Math.round(g.value * 100) / 100,
      commission: Math.round(g.value * cRate * 100) / 100,
    })).sort((a, b) => b.value - a.value);

    const grandValue = Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100;
    const grandCommission = Math.round(rows.reduce((s, r) => s + r.commission, 0) * 100) / 100;

    // ── Build PDF with jsPDF ──
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const PAGE_W = 210, PAGE_H = 297, M = 15;
    const money = n => currency + ' ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    let y = M;

    // Header band
    pdf.setFillColor(37, 211, 102); // #25D366
    pdf.rect(0, 0, PAGE_W, 3, 'F');

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(20, 20, 20);
    pdf.text(bizName, M, y + 8);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(90, 90, 90);
    pdf.text(title, M, y + 14);

    // Date range, right-aligned
    pdf.setFontSize(9); pdf.setTextColor(120, 120, 120);
    const rangeText = `Period: ${fmtD(date_from)} — ${fmtD(date_to)}`;
    pdf.text(rangeText, PAGE_W - M, y + 8, { align: 'right' });
    pdf.text(`Commission rate: ${(cRate * 100).toFixed(1)}%`, PAGE_W - M, y + 14, { align: 'right' });

    y += 22;
    pdf.setDrawColor(220, 220, 220); pdf.line(M, y, PAGE_W - M, y);
    y += 8;

    // Table header
    const cols = { agent: M, count: 105, value: 130, rate: 165, comm: PAGE_W - M };
    pdf.setFillColor(245, 247, 246);
    pdf.rect(M, y, PAGE_W - M * 2, 8, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(60, 60, 60);
    pdf.text('AGENT', cols.agent + 2, y + 5.5);
    pdf.text('SALES', cols.count, y + 5.5);
    pdf.text('TOTAL VALUE', cols.value, y + 5.5);
    pdf.text('RATE', cols.rate, y + 5.5);
    pdf.text('COMMISSION DUE', cols.comm, y + 5.5, { align: 'right' });
    y += 12;

    // Table rows
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(30, 30, 30);
    for (const r of rows) {
      if (y > PAGE_H - 50) { pdf.addPage(); y = M; }
      const nameLines = pdf.splitTextToSize(r.agent, 95);
      pdf.text(nameLines, cols.agent, y);
      pdf.text(String(r.count), cols.count, y);
      pdf.text(money(r.value), cols.value, y);
      pdf.text((cRate * 100).toFixed(0) + '%', cols.rate, y);
      pdf.text(money(r.commission), cols.comm, y, { align: 'right' });
      y += Math.max(nameLines.length * 4.5, 6.5);
      pdf.setDrawColor(240, 240, 240); pdf.line(M, y - 1.5, PAGE_W - M, y - 1.5);
    }

    y += 4;

    // Grand totals
    pdf.setFillColor(37, 211, 102, 0.08);
    pdf.setFillColor(240, 250, 243);
    pdf.rect(M, y, PAGE_W - M * 2, 14, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(20, 60, 35);
    pdf.text('GRAND TOTALS', cols.agent + 2, y + 5.5);
    pdf.setFontSize(9); pdf.text(`${rows.reduce((s, r) => s + r.count, 0)} sales`, cols.count, y + 5.5);
    pdf.setFontSize(10);
    pdf.text(money(grandValue), cols.value, y + 5.5);
    pdf.text(money(grandCommission), cols.comm, y + 5.5, { align: 'right' });
    y += 10;
    pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
    pdf.text(`Based on ${rows.reduce((s, r) => s + r.count, 0)} verified sale(s) across ${rows.length} agent(s)`, M, y + 4);

    // Footer (every page)
    const pageCount = pdf.internal.getNumberOfPages();
    const ts = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
      pdf.text('Generated by Nyasadesk', PAGE_W / 2, PAGE_H - 10, { align: 'center' });
      pdf.text(ts, PAGE_W - M, PAGE_H - 10, { align: 'right' });
    }

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

    // Upload to Supabase Storage
    const path = `commission-reports/${workspace_id}/${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from('chat-media').upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error('Failed to upload PDF: ' + upErr.message);

    const { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
    return res.status(200).json({ ok: true, pdf_url: pub.publicUrl });
  } catch (e) {
    console.error('[sales-commission-pdf]', e);
    return res.status(500).json({ ok: false, error: e.message });
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
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ ok: false, error: 'Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel environment variables.' });

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
