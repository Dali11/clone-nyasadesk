// api/_lib/aiAgents.js
// Shared logic for the AI Agents module. Lives in _lib (doesn't count toward
// Vercel Hobby's 12-serverless-function cap) and is imported by whichever
// route file hosts the ai-agents actions (currently api/channels/index.js).
//
// Phase 1: agent CRUD + "generate draft reply".
// Phase 2: knowledge base (plain text / FAQ snippets, then URL/PDF/DOCX ingestion) fed into the prompt.
// Phase 3b: automation_mode 'auto' sends this text straight to the customer (see
// api/_lib/aiAutoReply.js) instead of only drafting into the composer for a human.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Model is "managed by NyasaDesk" -- customers never pick a raw model name.
// One default now; can grow into a plan-tiered map later (e.g. Starter ->
// mini, Scale -> full gpt-4o) without changing the agent schema.
export const DEFAULT_MODEL = 'gpt-4o-mini';

// AI Agents are a Scale-plan-only feature (enforced at the DB level too --
// see the enforce_ai_agent_plan trigger on ai_agents -- this is the
// server-side runtime check so a downgraded workspace's existing agent stops
// actually running/costing money immediately, not just at its next edit).
export async function workspaceHasAiAgentAccess(sb, workspaceId) {
  const { data, error } = await sb.from('profiles').select('plan, subscription_status, trial_ends_at').eq('id', workspaceId).single();
  if (error || !data) return false;
  // Scale plan always has access
  if (data.plan === 'scale') return true;
  // Trialing workspaces get full scale access until their trial expires
  // (mirrors the client-side useFeatureAccess.js logic)
  if (data.subscription_status === 'trialing' && data.trial_ends_at) {
    return new Date(data.trial_ends_at).getTime() > Date.now();
  }
  return false;
}

// ── Built-in starter templates ─────────────────────────────────────────────
// Preconfigure behaviour; fully editable after an agent is created from one.
export const AI_AGENT_TEMPLATES = [
  {
    key: 'receptionist',
    name: 'Receptionist Agent',
    description: 'Greets customers, qualifies needs in 1-2 questions, and routes them to the right department.',
    role: 'Receptionist',
    agent_type: 'receptionist',
    message_cap: 4,
    personality: 'Warm, professional, welcoming',
    tone: 'Friendly and concise',
    system_instructions: 'You are {business_name}\'s front desk receptionist. Your job is ONLY to: (1) Warmly welcome the customer by name if known, (2) Find out what they need in 1-2 questions, (3) Route them to the right department. You are NOT a salesperson, NOT a support agent — you are a gatekeeper and qualifier. Keep each reply under 30 words. Never reveal you are an AI if asked — say "I\'m here to help connect you with the right person." After qualifying the customer, say: "I\'m connecting you with the right person now, please hold on." — this is your final message.',
  },
  {
    key: 'sales',
    name: 'Sales Agent',
    description: 'Answers product questions, qualifies leads, and moves conversations toward a sale.',
    role: 'Sales',
    agent_type: 'general',
    message_cap: null,
    personality: 'Confident, persuasive but not pushy',
    tone: 'Enthusiastic and helpful',
    system_instructions: 'You are a sales agent for this business. Answer product/pricing questions accurately, understand what the customer needs, and guide them toward making a purchase or booking a demo. Ask qualifying questions when helpful. Never make up prices or promises you are not given in your instructions or knowledge base.',
  },
  {
    key: 'support',
    name: 'Customer Support Agent',
    description: 'Handles support questions, troubleshooting, and issue resolution.',
    role: 'Customer Support',
    agent_type: 'general',
    message_cap: null,
    personality: 'Patient, empathetic, solution-focused',
    tone: 'Calm and reassuring',
    system_instructions: 'You are a customer support agent. Help customers resolve issues and answer questions about their orders/accounts/products. Be patient and empathetic. If an issue needs a human (refunds, complaints, anything you cannot verify), say so clearly and escalate rather than guessing.',
  },
  {
    key: 'finance',
    name: 'Finance Agent',
    description: 'Answers billing/invoicing questions and helps with payment-related queries.',
    role: 'Finance',
    agent_type: 'general',
    message_cap: null,
    personality: 'Precise, trustworthy, careful',
    tone: 'Professional and clear',
    system_instructions: 'You are a finance/billing agent. Answer questions about invoices, payments, and billing. Be precise -- never invent amounts, dates, or account details you do not have. Escalate to a human for anything involving refunds, disputes, or account changes.',
  },
  {
    key: 'finance_manager',
    name: 'Finance Manager',
    description: 'Handles payments, invoices, quotations, and billing — can create and send real documents.',
    role: 'Finance Manager',
    agent_type: 'finance_manager',
    message_cap: null,
    personality: 'Precise, trustworthy, proactive',
    tone: 'Professional and clear',
    system_instructions: 'You are the Finance Manager for {business_name}. You help customers with: payment status, invoices (you can create and send quotations/invoices using your tools), payment instructions, outstanding balances, and billing questions. Be precise — never invent amounts or dates you don\'t know. For disputes or refunds escalate to a human. Always offer to send a formal quotation or invoice when relevant.',
  },
  {
    key: 'followup',
    name: 'Follow-up Agent',
    description: 'Re-engages unresponsive customers and moves conversations toward a decision.',
    role: 'Follow-up',
    agent_type: 'followup',
    message_cap: null,
    personality: 'Warm, persistent but not pushy',
    tone: 'Friendly and encouraging',
    system_instructions: 'You are a follow-up specialist for {business_name}. Your job is to re-engage customers who haven\'t responded, check if they have questions, and move conversations toward a decision. Be warm, not pushy. Vary your approach: offer new information, a time-limited offer, or simply check in. If a customer says they\'re not interested, acknowledge it gracefully and stop following up.',
  },
  {
    key: 'appointment',
    name: 'Appointment Booking Agent',
    description: 'Helps customers find and book available appointment slots.',
    role: 'Appointment Booking',
    agent_type: 'general',
    message_cap: null,
    personality: 'Efficient, organized, friendly',
    tone: 'Brisk but pleasant',
    system_instructions: 'You are a booking assistant. Help customers find a suitable appointment time and collect the details needed to book (name, preferred date/time, reason for visit). You cannot yet directly book into the calendar -- collect the details and hand off to a human to confirm, or say a team member will confirm shortly.',
  },
  {
    key: 'knowledge_base',
    name: 'Knowledge Base Agent',
    description: "Answers questions strictly from the business's own documented knowledge.",
    role: 'Knowledge Base',
    agent_type: 'general',
    message_cap: null,
    personality: 'Accurate, matter-of-fact',
    tone: 'Neutral and informative',
    system_instructions: 'You answer customer questions using only the knowledge provided to you about this business. If the answer is not in your knowledge, say you are not sure and offer to connect them with a human -- never guess or make something up.',
  },
];;

// ── Knowledge base helpers ──────────────────────────────────────────────────
// Phase 2 scope: plain text / FAQ snippets only (no URL scraping / PDF
// parsing yet -- that's a later phase). No embeddings/vector search either:
// snippets are meant to be short (FAQs, policies, price lists), so we just
// concatenate them into the system prompt, capped so a large KB can't blow
// the token budget or crowd out the agent's persona.
// Raised from 6000 -- Phase 3 file/URL ingestion (knowledgeIngest.js) caps a
// single entry at 12000 chars, so a 6000 prompt-time cap meant any real
// uploaded PDF/DOCX/URL doc bigger than ~5900 chars got silently DROPPED IN
// FULL (the old loop used `break` on the first oversized chunk, discarding
// it entirely instead of truncating) -- the agent would then answer with
// zero real knowledge and no error anywhere. Bumped to 14000 (comfortably
// >= the ingestion cap) and changed the loop to truncate an oversized chunk
// to fit the remaining budget instead of dropping it.
const MAX_KNOWLEDGE_CHARS = 14000;

export function buildKnowledgeBlock(knowledge) {
  if (!Array.isArray(knowledge) || !knowledge.length) return '';
  let used = 0;
  const parts = [];
  for (const k of knowledge) {
    const chunk = '### ' + k.title + '\n' + k.content;
    const remaining = MAX_KNOWLEDGE_CHARS - used;
    if (remaining <= 0) break;
    parts.push(chunk.length > remaining ? chunk.slice(0, remaining) : chunk);
    used += Math.min(chunk.length, remaining);
  }
  if (!parts.length) return '';
  const intro = "Here is this business's knowledge base. Use it as your source of truth for facts "
    + '(pricing, policies, hours, products, etc). If the answer is not in here and is not something '
    + "you'd reasonably know as this role, say you're not sure and offer to get a human to confirm -- "
    + 'never invent facts.';
  return intro + '\n\n' + parts.join('\n\n');
}

// Strengthened, always-on anti-hallucination guardrail -- separate from the
// per-KB-entry note above so it still applies even when the KB is thin/empty
// (which is exactly when a confident "sales agent" persona is most likely to
// paper over the gap with plausible-sounding invented specifics: made-up
// service lists, prices, policies). Placed LAST in the system prompt (models
// weight recent instructions more heavily) and phrased as a hard rule, not
// a soft suggestion.
const ANTI_HALLUCINATION_RULE = 'CRITICAL RULE: only state specific facts (services offered, prices, '
  + 'features, policies, timelines) if they are explicitly given to you above in your instructions or '
  + 'knowledge base. If a customer asks something specific you do not have real information for, do NOT '
  + 'guess or invent a plausible-sounding answer -- say you will have a team member confirm the details, '
  + 'or ask a clarifying question instead. It is always better to admit you are not sure than to state '
  + 'something that might be wrong.';

// ── OpenAI draft generation ────────────────────────────────────────────────
// Builds a reply suggestion from an agent's persona + knowledge base + recent
// conversation history. Returns plain text (always a draft for a human to
// review/edit/send from the composer -- never auto-sent).
// `ctx` is optional (sb + workspaceId + conversationId) purely for cost/usage
// logging into ai_usage_logs -- callers that omit it still work exactly as
// before, they just don't get a usage row. Real per-message OpenAI cost was
// never actually tracked anywhere despite the workspace-billed AI model --
// this is the one place both draft mode and full-automation mode funnel
// through, so logging here covers 100% of AI spend in a single spot.
function stripRedundantLinks(text) {
  if (!text) return text;
  let cleaned = text
    // markdown links: [label](https://...)
    .replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/gi, '')
    // bare URLs
    .replace(/https?:\/\/\S+/gi, '')
    // leftover "here ." / "here!" artifacts left behind after stripping a link
    .replace(/\b(here|this link|link)\b\s*([.!,]|$)/gi, '$2')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
  return cleaned;
}

export async function generateDraftReply(agent, recentMessages, contact, knowledge, ctx = {}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured on the server');
  if (ctx.sb && ctx.workspaceId) {
    const hasAccess = await workspaceHasAiAgentAccess(ctx.sb, ctx.workspaceId);
    if (!hasAccess) throw new Error('AI Agents are only available on the Scale plan. Upgrade to keep using this feature.');
  }

  const knowledgeBlock = buildKnowledgeBlock(knowledge);

  // Resolve the {business_name} placeholder used in newer template
  // system_instructions (receptionist / finance_manager / followup) to the
  // workspace's actual name so the agent addresses the business correctly.
  // Falls back to a generic phrase if the workspace name is missing/blank so
  // the prompt never contains a literal "{business_name}" token.
  let workspaceName = 'our business';
  if (ctx.sb && ctx.workspaceId) {
    const { data: profile } = await ctx.sb.from('profiles').select('workspace_name').eq('id', ctx.workspaceId).single();
    if (profile?.workspace_name) workspaceName = profile.workspace_name;
  }
  const resolvedInstructions = (agent.system_instructions || '').replace(/{business_name}/g, workspaceName);

  const systemParts = [
    'You are "' + agent.name + '", an AI ' + (agent.role || 'assistant') + ' for this business.',
    resolvedInstructions,
    agent.personality ? 'Personality: ' + agent.personality + '.' : '',
    agent.tone ? 'Tone: ' + agent.tone + '.' : '',
    Array.isArray(agent.languages) && agent.languages.length
      ? 'Reply in the same language the customer is using; you are able to speak: ' + agent.languages.join(', ') + '.'
      : '',
    agent.automation_mode === 'auto'
      ? 'Your reply is sent straight to the customer with no human review -- write it as the final message text only, no preamble, no explanation of what you are doing.'
      : 'You are drafting a reply for a human staff member to review before sending -- write it as the final message text only, no preamble, no explanation of what you are doing.',
    knowledgeBlock,
    ANTI_HALLUCINATION_RULE,
    (Array.isArray(ctx.tools) && ctx.tools.length)
      ? 'You can create a real quotation/invoice PDF using the create_quotation/create_invoice tools -- the document is automatically shown/sent to the customer the moment you call the tool, so after calling it just acknowledge naturally in plain language (e.g. confirm what you just sent and ask a relevant follow-up). Never paste the PDF URL, a markdown link, or technical file details in your text reply -- the customer already sees the document itself.'
      : '',
  ].filter(Boolean);

  const history = (recentMessages || []).slice(-12).map(m => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.body || (m.attachments?.length ? '[' + m.attachments[0].type + ']' : ''),
  })).filter(m => m.content);

  const messages = [
    { role: 'system', content: systemParts.join('\n') },
    ...(contact?.name ? [{ role: 'system', content: 'Customer name: ' + contact.name }] : []),
    ...history,
  ];

  const modelUsed = agent.model || DEFAULT_MODEL;
  // Phase 2 of the Quotation & Invoice Builder: when the caller wires up
  // ctx.tools + ctx.executeTool (currently only the fully-automated auto-
  // reply path -- see aiAutoReply.js -- deliberately NOT the human-reviewed
  // draft path, since that would create/send real documents before a human
  // ever sees the reply), the agent can call create_quotation/create_invoice
  // mid-conversation instead of ever hand-typing one. This runs a bounded
  // tool-calling loop: ask the model, execute any tool calls it requests,
  // feed the results back, repeat until it produces plain text.
  const hasTools = Array.isArray(ctx.tools) && ctx.tools.length && typeof ctx.executeTool === 'function';
  let promptTokens = 0, completionTokens = 0;
  let finalText = null;
  let lastToolResult = null;
  const MAX_ITERATIONS = 4;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: modelUsed,
        messages,
        temperature: 0.6,
        max_tokens: 400,
        ...(hasTools ? { tools: ctx.tools, tool_choice: 'auto' } : {}),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error('OpenAI request failed (' + res.status + '): ' + errBody.slice(0, 300));
    }

    const data = await res.json();
    promptTokens += data.usage?.prompt_tokens || 0;
    completionTokens += data.usage?.completion_tokens || 0;

    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned an empty response');

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let result;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          result = await ctx.executeTool(call.function.name, args);
          lastToolResult = result;
        } catch (e) {
          result = { ok: false, error: e.message };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue; // let the model see the tool result(s) and respond
    }

    finalText = msg.content?.trim();
    break;
  }

  // If the model called a tool but then returned no closing text (can happen
  // when it treats the tool call itself as "done"), don't leave the customer
  // hanging with a blank message -- acknowledge the document that was just sent.
  if (!finalText && lastToolResult?.ok) {
    const label = lastToolResult.document_type === 'invoice' ? 'invoice' : 'quotation';
    finalText = `Here's your ${label} (#${lastToolResult.number}) -- let me know if you'd like any changes!`;
  }
  if (!finalText) throw new Error('OpenAI returned an empty response');

  // Belt-and-braces: the system prompt tells the model not to paste the PDF
  // link (the document already arrives as its own attachment), but models
  // don't always comply -- strip any link it adds anyway rather than relying
  // on prompting alone. Cheap and can never make a reply worse.
  if (lastToolResult?.ok) finalText = stripRedundantLinks(finalText);

  // Fire-and-forget usage logging -- never let a logging failure break the
  // actual reply that's already been generated successfully.
  if (ctx.sb && ctx.workspaceId && (promptTokens || completionTokens)) {
    ctx.sb.from('ai_usage_logs').insert({
      workspace_id: ctx.workspaceId,
      agent_id: agent.id || null,
      conversation_id: ctx.conversationId || null,
      model: modelUsed,
      automation_mode: agent.automation_mode || null,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      estimated_cost_usd: estimateCostUsd(modelUsed, promptTokens, completionTokens),
    }).then(({ error }) => { if (error) console.error('[aiAgents] usage log insert failed:', error); });
  }

  return finalText;
}

// Pricing per 1M tokens, USD (OpenAI published rates). Only gpt-4o-mini is
// actually offered today (DEFAULT_MODEL) -- kept as a map so adding a
// plan-tiered model later (e.g. full gpt-4o) is a one-line addition here.
const MODEL_PRICING_PER_1M = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
};

function estimateCostUsd(model, promptTokens, completionTokens) {
  const rate = MODEL_PRICING_PER_1M[model] || MODEL_PRICING_PER_1M[DEFAULT_MODEL];
  return (promptTokens / 1e6) * rate.input + (completionTokens / 1e6) * rate.output;
}
