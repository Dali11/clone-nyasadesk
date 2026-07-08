// api/_lib/aiDocumentTools.js
// AI Agents Phase 2 of the Quotation & Invoice Builder: lets an agent
// actually CALL the document builder mid-conversation (OpenAI tool/function
// calling) instead of ever hand-typing a quotation in chat text. Generic --
// works for any workspace's own items/prices/currency/branding, nothing
// business-specific here.

import { createQuotation, createInvoice, getOrGeneratePdfUrl } from './documents.js';
import { getProvider } from './providers/index.js';

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'What this line item is for' },
    quantity: { type: 'number', description: 'Quantity, defaults to 1 if omitted' },
    unit_price: { type: 'number', description: 'Price per unit in the business currency. Must be a REAL price from your knowledge base/instructions -- never invent one.' },
  },
  required: ['description', 'unit_price'],
};

const COMMON_PROPS = {
  customer_name: { type: 'string', description: "The customer's name (use what you already know from the conversation/contact)." },
  customer_business_name: { type: 'string', description: "The customer's own business name, if they mentioned one." },
  items: { type: 'array', items: ITEM_SCHEMA, description: 'Line items with real descriptions/prices only.' },
  duration: { type: 'string', description: 'Campaign/service duration or period, if relevant (optional).' },
  notes: { type: 'string', description: 'Any extra notes to include on the document (optional).' },
};

export function getDocumentTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'create_quotation',
        description: "Generates a professional quotation PDF for the customer and sends/attaches it into this chat automatically. Call this instead of typing a quotation out in chat text. Only call it once you know the customer's name and specific items with real prices from your knowledge base -- never invent prices.",
        parameters: { type: 'object', properties: COMMON_PROPS, required: ['customer_name', 'items'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_invoice',
        description: "Generates a formal invoice PDF for the customer and sends/attaches it into this chat automatically -- e.g. once they've confirmed/accepted and it's time to bill them. Only call this once you know the customer's name and specific items with real prices from your knowledge base -- never invent prices.",
        parameters: { type: 'object', properties: COMMON_PROPS, required: ['customer_name', 'items'] },
      },
    },
  ];
}

function resolveProviderKey(channel, cfg) {
  if (channel !== 'whatsapp') return channel;
  if (cfg.config?.provider === 'wasapflow') return 'whatsapp:wasapflow';
  if (cfg.config?.bird_workspace_id) return 'whatsapp:bird';
  if (cfg.config?.d360_api_key) return 'whatsapp:360dialog';
  return 'whatsapp:cloud';
}

// Executes a tool call: creates the real quotation/invoice record, generates
// its PDF, attaches it into the live chat, and pushes it out over the
// conversation's channel (WhatsApp today) -- the exact same path a human
// clicking "Send" in the Documents UI takes.
export async function executeDocumentTool(sb, { workspaceId, conversationId, contactId, agentId, agentName }, toolName, args) {
  if (toolName !== 'create_quotation' && toolName !== 'create_invoice') {
    throw new Error('Unknown tool: ' + toolName);
  }
  if (!Array.isArray(args?.items) || !args.items.length) {
    throw new Error('At least one item with a description and unit_price is required.');
  }
  const docType = toolName === 'create_invoice' ? 'invoice' : 'quotation';

  let contactRow = null;
  if (contactId) {
    const { data } = await sb.from('contacts').select('name, phone, email').eq('id', contactId).maybeSingle();
    contactRow = data;
  }

  const input = {
    contact_id: contactId || null,
    conversation_id: conversationId,
    customer_name: args.customer_name || contactRow?.name || 'Customer',
    customer_phone: contactRow?.phone || null,
    customer_email: contactRow?.email || null,
    customer_business_name: args.customer_business_name || null,
    items: args.items,
    duration: args.duration || null,
    notes: args.notes || null,
  };

  const doc = docType === 'invoice' ? await createInvoice(sb, workspaceId, input) : await createQuotation(sb, workspaceId, input);
  const { pdfUrl } = await getOrGeneratePdfUrl(sb, workspaceId, docType, doc.id);
  const filename = `${doc.number}.pdf`;

  const { data: conv } = await sb.from('conversations').select('external_id, channel').eq('id', conversationId).single();
  const channel = conv?.channel || 'website';

  if (conv && channel !== 'website') {
    const { data: cfg } = await sb.from('channel_configs').select('*').eq('workspace_id', workspaceId).eq('channel', channel).single();
    if (cfg?.enabled) {
      try {
        const provider = getProvider(resolveProviderKey(channel, cfg));
        await provider.sendMessage(cfg.config, {
          to: conv.external_id, media: { type: 'document', url: pdfUrl, filename },
          conversation_id: conversationId, workspace_id: workspaceId,
        }, { sb });
      } catch (e) {
        // Don't let a failed channel push stop the document from being
        // recorded/attached in-app -- surface it in logs for debugging.
        console.error('[aiDocumentTools] provider send failed, still attaching to chat:', e);
      }
    }
  }

  await sb.from('messages').insert({
    workspace_id: workspaceId, conversation_id: conversationId, direction: 'outbound', channel,
    body: '', attachments: [{ type: 'document', url: pdfUrl, filename, mime: 'application/pdf' }],
    sender_name: agentName || 'AI Agent', sender_id: agentId ? 'ai:' + agentId : null, status: 'sent',
    metadata: { is_ai: true, generated_document: { type: docType, id: doc.id, number: doc.number } },
  });
  await sb.from('conversations').update({
    last_message: `[${docType === 'invoice' ? 'Invoice' : 'Quotation'}] ${filename}`, last_message_at: new Date().toISOString(),
  }).eq('id', conversationId);

  if (doc.status === 'draft') {
    await sb.from(docType === 'invoice' ? 'invoices' : 'quotations').update({ status: 'sent' }).eq('id', doc.id);
  }

  return {
    ok: true, document_type: docType, number: doc.number,
    total: doc.total, currency: doc.currency, pdf_url: pdfUrl,
  };
}
