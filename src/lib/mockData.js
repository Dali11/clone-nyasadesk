// Central mock data store for SalesInbox demo

export const MOCK_USER = {
  id: 'user-1',
  full_name: 'Alex Rivera',
  email: 'alex@salesinbox.io',
  role: 'admin',
};

export const MOCK_USERS = [
  { id: 'user-1', full_name: 'Alex Rivera', email: 'alex@salesinbox.io', role: 'admin' },
  { id: 'user-2', full_name: 'Maria Lopez', email: 'maria@salesinbox.io', role: 'user' },
  { id: 'user-3', full_name: 'Jordan Kim', email: 'jordan@salesinbox.io', role: 'user' },
];

export const MOCK_CONTACTS = [
  { id: 'c-1', full_name: 'Sarah Chen', email: 'sarah.chen@acme.com', company: 'Acme Corp', phone: '+1 415 555 0101', lead_source: 'email', territory: 'North America', deal_stage: 'Qualified', notes: 'Very interested in enterprise tier. Decision maker is CFO.', tags: [], created_date: '2026-06-20T10:00:00Z', updated_date: '2026-06-27T09:00:00Z' },
  { id: 'c-2', full_name: 'James Okafor', email: 'james@innovatech.io', company: 'InnovaTech', phone: '+44 20 7946 0890', lead_source: 'whatsapp', territory: 'Europe', deal_stage: 'Proposal Sent', notes: 'Requested a custom SLA. Follow up on pricing proposal.', tags: [], created_date: '2026-06-18T08:00:00Z', updated_date: '2026-06-27T08:00:00Z' },
  { id: 'c-3', full_name: 'Priya Nair', email: 'priya.nair@globalops.in', company: 'GlobalOps', phone: '+91 98765 43210', lead_source: 'chat', territory: 'APAC', deal_stage: 'New Lead', notes: 'Came from website chat widget. Not sure about budget yet.', tags: [], created_date: '2026-06-27T07:00:00Z', updated_date: '2026-06-27T07:00:00Z' },
  { id: 'c-4', full_name: 'Carlos Mendez', email: 'c.mendez@futurelogic.mx', company: 'FutureLogic', phone: '+52 55 1234 5678', lead_source: 'email', territory: 'LATAM', deal_stage: 'Negotiation', notes: '', tags: [], created_date: '2026-06-15T12:00:00Z', updated_date: '2026-06-26T16:00:00Z' },
  { id: 'c-5', full_name: 'Emily Harrington', email: 'emily.h@brightwave.com', company: 'BrightWave', phone: '', lead_source: 'phone', territory: 'North America', deal_stage: 'Closed Won', notes: 'Signed 2-year contract. Upsell opportunity in Q3.', tags: [], created_date: '2026-06-10T09:00:00Z', updated_date: '2026-06-25T14:00:00Z' },
  { id: 'c-6', full_name: 'Tomas Vogel', email: 'tomas@nordconsult.de', company: 'NordConsult GmbH', phone: '', lead_source: 'email', territory: 'Europe', deal_stage: 'Contacted', notes: '', tags: [], created_date: '2026-06-22T11:00:00Z', updated_date: '2026-06-26T11:00:00Z' },
];

export const MOCK_CONVERSATIONS = [
  { id: 'conv-1', subject: 'Enterprise pricing for 200 seats', contact_id: 'c-1', contact_name: 'Sarah Chen', contact_email: 'sarah.chen@acme.com', channel: 'email', status: 'open', assigned_to: 'user-1', assigned_to_name: 'Alex Rivera', priority: 'urgent', tags: ['enterprise', 'hot lead'], last_message_preview: 'I have a few questions about the volume discount...', last_message_at: '2026-06-27T09:15:00Z', unread: true, deal_stage: 'Qualified', is_reminder_active: false, created_date: '2026-06-20T10:00:00Z', updated_date: '2026-06-27T09:15:00Z' },
  { id: 'conv-2', subject: 'Custom SLA requirements for EU region', contact_id: 'c-2', contact_name: 'James Okafor', contact_email: 'james@innovatech.io', channel: 'whatsapp', status: 'open', assigned_to: 'user-2', assigned_to_name: 'Maria Lopez', priority: 'high', tags: ['follow-up', 'enterprise'], last_message_preview: 'We need GDPR-compliant data processing guarantees.', last_message_at: '2026-06-27T08:30:00Z', unread: true, deal_stage: 'Proposal Sent', is_reminder_active: true, reminder_at: '2026-06-28T10:00:00Z', created_date: '2026-06-18T08:00:00Z', updated_date: '2026-06-27T08:30:00Z' },
  { id: 'conv-3', subject: 'Website chat inquiry - product demo request', contact_id: 'c-3', contact_name: 'Priya Nair', contact_email: 'priya.nair@globalops.in', channel: 'chat', status: 'unassigned', assigned_to: null, assigned_to_name: null, priority: 'normal', tags: ['demo', 'inbound'], last_message_preview: 'Hello! I found your product through Google and would love to see a demo.', last_message_at: '2026-06-27T07:45:00Z', unread: true, deal_stage: 'New Lead', is_reminder_active: false, created_date: '2026-06-27T07:00:00Z', updated_date: '2026-06-27T07:45:00Z' },
  { id: 'conv-4', subject: 'Contract negotiation - volume tier pricing', contact_id: 'c-4', contact_name: 'Carlos Mendez', contact_email: 'c.mendez@futurelogic.mx', channel: 'email', status: 'open', assigned_to: 'user-2', assigned_to_name: 'Maria Lopez', priority: 'high', tags: ['negotiation', 'LATAM'], last_message_preview: 'We need a 90-day payment term instead of 60.', last_message_at: '2026-06-26T16:20:00Z', unread: false, deal_stage: 'Negotiation', is_reminder_active: false, created_date: '2026-06-15T12:00:00Z', updated_date: '2026-06-26T16:20:00Z' },
  { id: 'conv-5', subject: 'Onboarding kickoff confirmation', contact_id: 'c-5', contact_name: 'Emily Harrington', contact_email: 'emily.h@brightwave.com', channel: 'email', status: 'closed', assigned_to: 'user-1', assigned_to_name: 'Alex Rivera', priority: 'normal', tags: ['won', 'onboarding'], last_message_preview: 'We are ready to get started. Looking forward to working with your team.', last_message_at: '2026-06-25T14:00:00Z', unread: false, deal_stage: 'Closed Won', is_reminder_active: false, created_date: '2026-06-10T09:00:00Z', updated_date: '2026-06-25T14:00:00Z' },
  { id: 'conv-6', subject: 'Initial discovery call follow-up', contact_id: 'c-6', contact_name: 'Tomas Vogel', contact_email: 'tomas@nordconsult.de', channel: 'email', status: 'unassigned', assigned_to: null, assigned_to_name: null, priority: 'low', tags: ['follow-up'], last_message_preview: 'Thanks for the call. I will share this with our team and get back to you.', last_message_at: '2026-06-26T11:00:00Z', unread: false, deal_stage: 'Contacted', is_reminder_active: false, created_date: '2026-06-22T11:00:00Z', updated_date: '2026-06-26T11:00:00Z' },
  { id: 'conv-7', subject: 'Urgent: integration support needed', contact_id: 'c-1', contact_name: 'Sarah Chen', contact_email: 'sarah.chen@acme.com', channel: 'chat', status: 'open', assigned_to: 'user-1', assigned_to_name: 'Alex Rivera', priority: 'urgent', tags: ['support', 'urgent'], last_message_preview: 'Our dev team is getting 401 errors on the API.', last_message_at: '2026-06-27T10:05:00Z', unread: true, deal_stage: 'Qualified', is_reminder_active: false, created_date: '2026-06-27T10:00:00Z', updated_date: '2026-06-27T10:05:00Z' },
];

export const MOCK_MESSAGES = {
  'conv-1': [
    { id: 'm-1a', conversation_id: 'conv-1', type: 'inbound', body: 'Hi there,\n\nI have been reviewing the proposal you sent over and I have a few questions about the volume discount structure for our 200-seat rollout.\n\nSpecifically, can we discuss custom invoicing terms for a Q3 start date?\n\nBest,\nSarah', sender_name: 'Sarah Chen', sender_email: 'sarah.chen@acme.com', channel: 'email', created_date: '2026-06-27T08:00:00Z' },
    { id: 'm-1b', conversation_id: 'conv-1', type: 'note', body: 'Sarah is the main decision maker. Her CFO wants to see ROI numbers before signing. Need to send case studies from similar-sized companies.', sender_name: 'Alex Rivera', channel: 'email', created_date: '2026-06-27T08:30:00Z' },
    { id: 'm-1c', conversation_id: 'conv-1', type: 'outbound', body: 'Hi Sarah,\n\nGreat questions! Yes, we can absolutely accommodate custom invoicing for a Q3 start. I will prepare a tailored breakdown with the volume discount applied.\n\nI will have this to you by EOD Thursday -- does that work?\n\nBest,\nAlex', sender_name: 'Alex Rivera', channel: 'email', created_date: '2026-06-27T09:15:00Z' },
  ],
  'conv-2': [
    { id: 'm-2a', conversation_id: 'conv-2', type: 'inbound', body: 'Hey! We need GDPR-compliant data processing guarantees explicitly written into the contract. Our legal team flagged this. Can your team provide a Data Processing Agreement (DPA)?', sender_name: 'James Okafor', channel: 'whatsapp', created_date: '2026-06-27T07:00:00Z' },
    { id: 'm-2b', conversation_id: 'conv-2', type: 'outbound', body: 'Hi James, absolutely -- we have a standard DPA ready to go. I will have our legal team send it over within 24 hours. Is there a specific contact on your end we should loop in?', sender_name: 'Maria Lopez', channel: 'whatsapp', created_date: '2026-06-27T08:30:00Z' },
  ],
  'conv-3': [
    { id: 'm-3a', conversation_id: 'conv-3', type: 'inbound', body: 'Hello! I found your product through a Google search and I would love to see a demo. We are a team of 45 and looking for a sales tool.', sender_name: 'Priya Nair', channel: 'chat', created_date: '2026-06-27T07:45:00Z' },
  ],
  'conv-4': [
    { id: 'm-4a', conversation_id: 'conv-4', type: 'inbound', body: 'We are happy to move forward but we need 90-day payment terms instead of 60. This is a hard requirement from our finance team.', sender_name: 'Carlos Mendez', channel: 'email', created_date: '2026-06-26T15:00:00Z' },
    { id: 'm-4b', conversation_id: 'conv-4', type: 'outbound', body: 'Hi Carlos, I understand. Let me check with our finance team on the 90-day terms. I should have an answer for you by tomorrow.', sender_name: 'Maria Lopez', channel: 'email', created_date: '2026-06-26T16:20:00Z' },
  ],
  'conv-5': [
    { id: 'm-5a', conversation_id: 'conv-5', type: 'outbound', body: 'Hi Emily! Great news -- your contract has been processed. Welcome to the team! Here is what happens next with onboarding.', sender_name: 'Alex Rivera', channel: 'email', created_date: '2026-06-25T13:00:00Z' },
    { id: 'm-5b', conversation_id: 'conv-5', type: 'inbound', body: 'Excellent! We are ready to get started. Looking forward to working with your team.', sender_name: 'Emily Harrington', channel: 'email', created_date: '2026-06-25T14:00:00Z' },
  ],
  'conv-6': [
    { id: 'm-6a', conversation_id: 'conv-6', type: 'inbound', body: 'Thanks for the call yesterday. I will share this with our team and get back to you by end of next week.', sender_name: 'Tomas Vogel', channel: 'email', created_date: '2026-06-26T11:00:00Z' },
  ],
  'conv-7': [
    { id: 'm-7a', conversation_id: 'conv-7', type: 'inbound', body: 'Our dev team is getting 401 Unauthorized errors when calling the API. We have double-checked the API keys and they look correct. This is blocking our integration.', sender_name: 'Sarah Chen', channel: 'chat', created_date: '2026-06-27T10:00:00Z' },
    { id: 'm-7b', conversation_id: 'conv-7', type: 'activity', body: 'Conversation assigned to Alex Rivera', sender_name: 'System', channel: 'chat', created_date: '2026-06-27T10:05:00Z' },
  ],
};

export const MOCK_RULES = [
  { id: 'rule-1', name: 'Round Robin -- All Inbound', type: 'round_robin', channel: 'all', is_active: true, priority_order: 0, condition_value: '', assigned_to_ids: [], assigned_to_names: [], round_robin_index: 0, created_date: '2026-06-01T00:00:00Z' },
  { id: 'rule-2', name: 'Email -- Senior Rep Priority', type: 'lead_source', channel: 'email', is_active: true, priority_order: 1, condition_value: 'enterprise', assigned_to_ids: ['user-1'], assigned_to_names: ['Alex Rivera'], round_robin_index: 0, created_date: '2026-06-01T00:00:00Z' },
  { id: 'rule-3', name: 'APAC Territory Rule', type: 'territory', channel: 'all', is_active: true, priority_order: 2, condition_value: 'APAC', assigned_to_ids: ['user-3'], assigned_to_names: ['Jordan Kim'], round_robin_index: 0, created_date: '2026-06-01T00:00:00Z' },
];

let _idCounter = 1000;
export function genId(prefix) {
  return (prefix || 'id') + '-' + (++_idCounter) + '-' + Date.now();
}