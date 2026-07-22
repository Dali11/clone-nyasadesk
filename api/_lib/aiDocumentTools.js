// api/_lib/aiDocumentTools.js
// AI Agents Phase 2 of the Quotation & Invoice Builder: lets an agent
// actually CALL the document builder mid-conversation (OpenAI tool/function
// calling) instead of ever hand-typing a quotation in chat text. Generic --
// works for any workspace's own items/prices/currency/branding, nothing
// business-specific here.
//
// Phase 4: External Webhook Tool — any agent with a `webhook_tool_url` in its
// config can call `register_student` (or any future external action) via a
// secure POST to that URL. The tool definition and executor live here so the
// existing aiAutoReply.js tool-calling loop picks them up automatically.

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

// ── External Webhook Tool ────────────────────────────────────────────────────
// Returns the register_student tool definition when the agent has a
// webhook_tool_url configured. Generic: the URL is stored per-agent, not
// hardcoded here, so any workspace can point it at their own endpoint.
export function getWebhookTools(agent) {
  if (!agent?.webhook_tool_url) return [];
  return [
    {
      type: 'function',
      function: {
        name: 'register_student',
        description: 'Registers a new student account once you have their full name and phone number. Call this ONCE — as soon as you have both details. The system auto-generates the email and password. Do NOT ask the student for email, password, or class.',
        parameters: {
          type: 'object',
          properties: {
            full_name: { type: 'string', description: "Student's full name exactly as they gave it." },
            phone:     { type: 'string', description: "Student's phone number in international format, e.g. 265999123456. Use their WhatsApp number." },
          },
          required: ['full_name', 'phone'],
        },
      },
    },
  ];
}

// Calls the external webhook URL stored in agent.webhook_tool_url.
// Passes a shared secret (agent.webhook_tool_secret) as a Bearer token so
// the receiving endpoint can verify the call is legitimate.
export async function executeWebhookTool(agent, toolName, args) {
  if (toolName !== 'register_student') throw new Error('Unknown webhook tool: ' + toolName);

  const url    = agent.webhook_tool_url;
  const secret = agent.webhook_tool_secret || '';

  if (!url) throw new Error('Agent has no webhook_tool_url configured.');

  // Auto-generate email and password from phone number and name.
  // Email  : <local_digits>@chibondoacademy.com  (strip country code prefix, use last 9+ digits)
  // Password: FirstnameSurname + last 3 digits of phone (e.g. "EmmieChungà949")
  //           — at least 8 chars, alphanumeric, predictable so agent can tell the student.
  const enrichedArgs = { ...args };

  if (!enrichedArgs.email && enrichedArgs.phone) {
    // Strip non-digits, keep the local part (drop leading 265 / 0 prefix, keep 9 digits)
    const digits = enrichedArgs.phone.replace(/\D/g, '');
    // Use the full digit string as local part for uniqueness (phone number = unique ID)
    const localPart = digits.length >= 6 ? digits : digits.padEnd(6, '0');
    enrichedArgs.email = `${localPart}@chibondoacademy.com`;
  }

  if (!enrichedArgs.password && enrichedArgs.full_name) {
    // Build password from first + last name parts, strip spaces/special chars
    const nameParts = enrichedArgs.full_name.trim().split(/\s+/);
    const firstName = (nameParts[0] || '').replace(/[^a-zA-Z]/g, '');
    const lastName  = (nameParts[nameParts.length - 1] || '').replace(/[^a-zA-Z]/g, '');
    const digits    = (enrichedArgs.phone || '').replace(/\D/g, '');
    const suffix    = digits.slice(-3) || '000';
    // e.g. "EmmieChungà949" → cap first letters for readability
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    enrichedArgs.password = `${cap(firstName)}${cap(lastName)}${suffix}`;
    // Ensure minimum 8 chars
    while (enrichedArgs.password.length < 8) enrichedArgs.password += '0';
    // Store generated password so the agent can share it with the student
    enrichedArgs._generated_password = enrichedArgs.password;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ tool: toolName, args: enrichedArgs }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Webhook responded ${res.status}`);

  // Pass back the generated password so the agent can tell the student
  if (enrichedArgs._generated_password) {
    json.password = enrichedArgs._generated_password;
    json.email    = enrichedArgs.email;
  }
  return json;
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
