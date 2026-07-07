// api/_lib/aiAgents.js
// Shared logic for the AI Agents module. Lives in _lib (doesn't count toward
// Vercel Hobby's 12-serverless-function cap) and is imported by whichever
// route file hosts the ai-agents actions (currently api/channels/index.js).
//
// Phase 1 scope: agent CRUD + "generate draft reply" only. No auto-send, no
// knowledge base yet (system_instructions text is the only "knowledge" for
// now) -- both come in later phases per the agreed build plan.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Model is "managed by NyasaDesk" -- customers never pick a raw model name.
// One default now; can grow into a plan-tiered map later (e.g. Starter ->
// mini, Scale -> full gpt-4o) without changing the agent schema.
export const DEFAULT_MODEL = 'gpt-4o-mini';

// ── Built-in starter templates ─────────────────────────────────────────────
// Preconfigure behaviour; fully editable after an agent is created from one.
export const AI_AGENT_TEMPLATES = [
  {
    key: 'receptionist',
    name: 'Receptionist Agent',
    description: 'Greets customers, answers general questions, and routes them to the right place.',
    role: 'Receptionist',
    personality: 'Warm, professional, welcoming',
    tone: 'Friendly and concise',
    system_instructions: 'You are the front-desk receptionist for this business. Greet customers warmly, answer general questions about hours, location, and services, and direct them to the right team or agent for anything specific. Keep replies short and clear. If you do not know something, say so and offer to get a human to help.',
  },
  {
    key: 'sales',
    name: 'Sales Agent',
    description: 'Answers product questions, qualifies leads, and moves conversations toward a sale.',
    role: 'Sales',
    personality: 'Confident, persuasive but not pushy',
    tone: 'Enthusiastic and helpful',
    system_instructions: 'You are a sales agent for this business. Answer product/pricing questions accurately, understand what the customer needs, and guide them toward making a purchase or booking a demo. Ask qualifying questions when helpful. Never make up prices or promises you are not given in your instructions or knowledge base.',
  },
  {
    key: 'support',
    name: 'Customer Support Agent',
    description: 'Handles support questions, troubleshooting, and issue resolution.',
    role: 'Customer Support',
    personality: 'Patient, empathetic, solution-focused',
    tone: 'Calm and reassuring',
    system_instructions: 'You are a customer support agent. Help customers resolve issues and answer questions about their orders/accounts/products. Be patient and empathetic. If an issue needs a human (refunds, complaints, anything you cannot verify), say so clearly and escalate rather than guessing.',
  },
  {
    key: 'finance',
    name: 'Finance Agent',
    description: 'Answers billing/invoicing questions and helps with payment-related queries.',
    role: 'Finance',
    personality: 'Precise, trustworthy, careful',
    tone: 'Professional and clear',
    system_instructions: 'You are a finance/billing agent. Answer questions about invoices, payments, and billing. Be precise -- never invent amounts, dates, or account details you do not have. Escalate to a human for anything involving refunds, disputes, or account changes.',
  },
  {
    key: 'appointment',
    name: 'Appointment Booking Agent',
    description: 'Helps customers find and book available appointment slots.',
    role: 'Appointment Booking',
    personality: 'Efficient, organized, friendly',
    tone: 'Brisk but pleasant',
    system_instructions: 'You are a booking assistant. Help customers find a suitable appointment time and collect the details needed to book (name, preferred date/time, reason for visit). You cannot yet directly book into the calendar -- collect the details and hand off to a human to confirm, or say a team member will confirm shortly.',
  },
  {
    key: 'knowledge_base',
    name: 'Knowledge Base Agent',
    description: 'Answers questions strictly from the business\'s own documented knowledge.',
    role: 'Knowledge Base',
    personality: 'Accurate, matter-of-fact',
    tone: 'Neutral and informative',
    system_instructions: 'You answer customer questions using only the knowledge provided to you about this business. If the answer is not in your knowledge, say you are not sure and offer to connect them with a human -- never guess or make something up.',
  },
];

// ── OpenAI draft generation ────────────────────────────────────────────────
// Builds a reply suggestion from an agent's persona + recent conversation
// history. Returns plain text (no auto-send in Phase 1 -- always a draft for
// a human to review/edit/send from the composer).
export async function generateDraftReply(agent, recentMessages, contact) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured on the server');

  const systemParts = [
    `You are "${agent.name}", an AI ${agent.role || 'assistant'} for this business.`,
    agent.system_instructions || '',
    agent.personality ? `Personality: ${agent.personality}.` : '',
    agent.tone ? `Tone: ${agent.tone}.` : '',
    Array.isArray(agent.languages) && agent.languages.length
      ? `Reply in the same language the customer is using; you are able to speak: ${agent.languages.join(', ')}.`
      : '',
    'You are drafting a reply for a human staff member to review before sending -- write it as the final message text only, no preamble, no explanation of what you are doing.',
  ].filter(Boolean);

  const history = (recentMessages || []).slice(-12).map(m => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.body || (m.attachments?.length ? `[${m.attachments[0].type}]` : ''),
  })).filter(m => m.content);

  const messages = [
    { role: 'system', content: systemParts.join('\n') },
    ...(contact?.name ? [{ role: 'system', content: `Customer name: ${contact.name}` }] : []),
    ...history,
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: agent.model || DEFAULT_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI request failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const draft = data.choices?.[0]?.message?.content?.trim();
  if (!draft) throw new Error('OpenAI returned an empty response');
  return draft;
}
