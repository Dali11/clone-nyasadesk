// api/_lib/documents.js
// Generic Quotation & Invoice Builder -- business logic shared by the HTTP
// router (api/channels/index.js) AND the AI tool-calling path (Phase 2).
// Nothing here is hardcoded to any one business -- every default (currency,
// tax, bank accounts, templates, numbering prefixes) comes from
// business_document_settings, configured per workspace.

import { generateDocumentPdf } from './pdfGenerator.js';

const CHAT_MEDIA_BUCKET = 'chat-media';

export async function getOrCreateSettings(sb, workspaceId) {
  let { data } = await sb.from('business_document_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (!data) {
    const { data: created, error } = await sb.from('business_document_settings')
      .insert({ workspace_id: workspaceId }).select('*').single();
    if (error) throw new Error('Failed to initialize document settings: ' + error.message);
    data = created;
  }
  return data;
}

export async function saveSettings(sb, workspaceId, patch) {
  await getOrCreateSettings(sb, workspaceId); // ensure row exists first
  const ALLOWED = ['company_name', 'logo_url', 'address', 'phone', 'email', 'website', 'currency',
    'bank_accounts', 'mobile_money_accounts', 'tax_enabled', 'tax_label', 'tax_rate_percent', 'tax_number',
    'default_payment_instructions', 'default_terms', 'default_validity_days', 'default_due_days',
    'default_template', 'brand_color', 'footer_text', 'signature_url', 'quotation_prefix', 'invoice_prefix',
    'next_quotation_number', 'next_invoice_number'];
  const clean = {};
  for (const k of ALLOWED) if (k in patch) clean[k] = patch[k];
  // Manual override of the running counter -- only accept a sane positive
  // integer, never let a bad value corrupt future document numbering.
  for (const k of ['next_quotation_number', 'next_invoice_number']) {
    if (k in clean) {
      const n = parseInt(clean[k], 10);
      if (!Number.isFinite(n) || n < 1) throw new Error('Next number must be a positive whole number');
      clean[k] = n;
    }
  }
  const { data, error } = await sb.from('business_document_settings')
    .update(clean).eq('workspace_id', workspaceId).select('*').single();
  if (error) throw new Error('Failed to save document settings: ' + error.message);
  return data;
}

// Computes subtotal/tax/total from line items -- the one place this math
// happens so quotations, invoices, and their PDFs never disagree.
export function computeTotals(items, settings, discountAmount = 0) {
  const subtotal = (items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), 0);
  const afterDiscount = Math.max(0, subtotal - (Number(discountAmount) || 0));
  const taxAmount = settings?.tax_enabled ? afterDiscount * (Number(settings.tax_rate_percent) || 0) / 100 : 0;
  const total = afterDiscount + taxAmount;
  return {
    subtotal: round2(subtotal),
    discount_amount: round2(Number(discountAmount) || 0),
    tax_amount: round2(taxAmount),
    total: round2(total),
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function nextNumber(sb, workspaceId, docType) {
  const { data, error } = await sb.rpc('next_document_number', { p_workspace_id: workspaceId, p_doc_type: docType });
  if (error) throw new Error('Failed to generate document number: ' + error.message);
  return data;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

// ── Quotations ─────────────────────────────────────────────────────────────
export async function createQuotation(sb, workspaceId, input) {
  const settings = await getOrCreateSettings(sb, workspaceId);
  if (!input.customer_name) throw new Error('customer_name is required');
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('At least one item is required');

  const totals = computeTotals(input.items, settings, input.discount_amount);
  const number = await nextNumber(sb, workspaceId, 'quotation');

  const row = {
    workspace_id: workspaceId,
    contact_id: input.contact_id || null,
    conversation_id: input.conversation_id || null,
    number,
    customer_name: input.customer_name,
    customer_business_name: input.customer_business_name || input.business_name || null,
    customer_email: input.customer_email || null,
    customer_phone: input.customer_phone || null,
    customer_address: input.customer_address || null,
    items: input.items,
    notes: input.notes || null,
    duration: input.duration || input.campaign_duration || null,
    ...totals,
    currency: input.currency || settings.currency,
    status: 'draft',
    valid_until: input.valid_until || addDays(settings.default_validity_days),
    template_key: input.template_key || settings.default_template,
    created_by: input.created_by || null,
  };
  const { data, error } = await sb.from('quotations').insert(row).select('*').single();
  if (error) throw new Error('Failed to create quotation: ' + error.message);
  return data;
}

export async function updateQuotation(sb, workspaceId, id, patch) {
  const settings = await getOrCreateSettings(sb, workspaceId);
  const update = { ...patch };
  if (patch.items) {
    Object.assign(update, computeTotals(patch.items, settings, patch.discount_amount));
  }
  if (update.status && !['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(update.status)) {
    throw new Error('Invalid quotation status: ' + update.status);
  }
  update.pdf_url = null; // any edit invalidates the cached PDF, regenerated on next request
  const { data, error } = await sb.from('quotations').update(update)
    .eq('id', id).eq('workspace_id', workspaceId).select('*').single();
  if (error) throw new Error('Failed to update quotation: ' + error.message);
  return data;
}

export async function convertQuotationToInvoice(sb, workspaceId, quotationId, overrides = {}) {
  const { data: quote, error: qErr } = await sb.from('quotations').select('*').eq('id', quotationId).eq('workspace_id', workspaceId).single();
  if (qErr || !quote) throw new Error('Quotation not found');
  if (quote.converted_to_invoice_id) throw new Error('This quotation has already been converted to an invoice');

  const settings = await getOrCreateSettings(sb, workspaceId);
  const number = await nextNumber(sb, workspaceId, 'invoice');

  const row = {
    workspace_id: workspaceId,
    contact_id: quote.contact_id,
    conversation_id: quote.conversation_id,
    quotation_id: quote.id,
    number,
    customer_name: quote.customer_name,
    customer_business_name: quote.customer_business_name,
    customer_email: quote.customer_email,
    customer_phone: quote.customer_phone,
    customer_address: quote.customer_address,
    items: quote.items,
    notes: quote.notes,
    duration: quote.duration,
    subtotal: quote.subtotal,
    discount_amount: quote.discount_amount,
    tax_amount: quote.tax_amount,
    total: quote.total,
    currency: quote.currency,
    status: 'draft',
    due_date: overrides.due_date || addDays(settings.default_due_days),
    payment_instructions: overrides.payment_instructions || settings.default_payment_instructions,
    template_key: quote.template_key,
    created_by: overrides.created_by || quote.created_by,
  };
  const { data: invoice, error } = await sb.from('invoices').insert(row).select('*').single();
  if (error) throw new Error('Failed to create invoice from quotation: ' + error.message);

  await sb.from('quotations').update({ converted_to_invoice_id: invoice.id, status: 'accepted' }).eq('id', quotationId);
  return invoice;
}

// ── Invoices ─────────────────────────────────────────────────────────────
export async function createInvoice(sb, workspaceId, input) {
  const settings = await getOrCreateSettings(sb, workspaceId);
  if (!input.customer_name) throw new Error('customer_name is required');
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('At least one item is required');

  const totals = computeTotals(input.items, settings, input.discount_amount);
  const number = await nextNumber(sb, workspaceId, 'invoice');

  const row = {
    workspace_id: workspaceId,
    contact_id: input.contact_id || null,
    conversation_id: input.conversation_id || null,
    number,
    customer_name: input.customer_name,
    customer_business_name: input.customer_business_name || input.business_name || null,
    customer_email: input.customer_email || null,
    customer_phone: input.customer_phone || null,
    customer_address: input.customer_address || null,
    items: input.items,
    notes: input.notes || null,
    duration: input.duration || null,
    ...totals,
    currency: input.currency || settings.currency,
    status: 'draft',
    due_date: input.due_date || addDays(settings.default_due_days),
    payment_instructions: input.payment_instructions || settings.default_payment_instructions,
    template_key: input.template_key || settings.default_template,
    created_by: input.created_by || null,
  };
  const { data, error } = await sb.from('invoices').insert(row).select('*').single();
  if (error) throw new Error('Failed to create invoice: ' + error.message);
  return data;
}

export async function updateInvoice(sb, workspaceId, id, patch) {
  const settings = await getOrCreateSettings(sb, workspaceId);
  const update = { ...patch };
  if (patch.items) {
    Object.assign(update, computeTotals(patch.items, settings, patch.discount_amount));
  }
  if (update.status && !['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].includes(update.status)) {
    throw new Error('Invalid invoice status: ' + update.status);
  }
  update.pdf_url = null;
  const { data, error } = await sb.from('invoices').update(update)
    .eq('id', id).eq('workspace_id', workspaceId).select('*').single();
  if (error) throw new Error('Failed to update invoice: ' + error.message);
  return data;
}

// Records a payment against an invoice and rolls the invoice's amount_paid /
// status forward accordingly (partial vs fully paid). This is the one place
// invoice payment state changes, so it can never drift from payment history.
export async function recordInvoicePayment(sb, workspaceId, invoiceId, payment) {
  const { data: invoice, error: invErr } = await sb.from('invoices').select('*').eq('id', invoiceId).eq('workspace_id', workspaceId).single();
  if (invErr || !invoice) throw new Error('Invoice not found');
  if (!payment.amount || Number(payment.amount) <= 0) throw new Error('Payment amount must be greater than 0');

  const { error: payErr } = await sb.from('invoice_payments').insert({
    invoice_id: invoiceId, workspace_id: workspaceId,
    amount: payment.amount, method: payment.method || 'other',
    reference: payment.reference || null, paid_at: payment.paid_at || new Date().toISOString(),
    recorded_by: payment.recorded_by || null, notes: payment.notes || null,
  });
  if (payErr) throw new Error('Failed to record payment: ' + payErr.message);

  const newPaid = round2(Number(invoice.amount_paid) + Number(payment.amount));
  const newStatus = newPaid >= Number(invoice.total) ? 'paid' : (newPaid > 0 ? 'partial' : invoice.status);

  const { data: updated, error: updErr } = await sb.from('invoices')
    .update({ amount_paid: newPaid, status: newStatus }).eq('id', invoiceId).select('*').single();
  if (updErr) throw new Error('Failed to update invoice after payment: ' + updErr.message);
  return updated;
}

// ── PDF generation + storage ─────────────────────────────────────────────
// Caches the generated PDF in Supabase Storage (public chat-media bucket,
// same one media attachments already use) so repeated sends/downloads don't
// regenerate it -- invalidated (pdf_url cleared) whenever the document is edited.
export async function getOrGeneratePdfUrl(sb, workspaceId, docType, docId) {
  const table = docType === 'invoice' ? 'invoices' : 'quotations';
  const { data: doc, error } = await sb.from(table).select('*').eq('id', docId).eq('workspace_id', workspaceId).single();
  if (error || !doc) throw new Error((docType === 'invoice' ? 'Invoice' : 'Quotation') + ' not found');
  if (doc.pdf_url) return { doc, pdfUrl: doc.pdf_url };

  const settings = await getOrCreateSettings(sb, workspaceId);
  const pdfBuffer = await generateDocumentPdf(doc, docType, settings);
  const path = `documents/${workspaceId}/${docType}-${doc.number.replace(/[^a-zA-Z0-9-]/g, '_')}-${Date.now()}.pdf`;

  const { error: upErr } = await sb.storage.from(CHAT_MEDIA_BUCKET).upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error('Failed to store generated PDF: ' + upErr.message);

  const { data: pub } = sb.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path);
  const pdfUrl = pub.publicUrl;
  await sb.from(table).update({ pdf_url: pdfUrl }).eq('id', docId);
  return { doc: { ...doc, pdf_url: pdfUrl }, pdfUrl };
}
