// In-memory reactive store for Nyasadesk

const MOCK_OWNER = {
  id: 'user-owner', full_name: 'Alex Rivera', email: 'alex@nyasadesk.com',
  role: 'owner', avatar: null, workspace_id: 'ws-1', status: 'online',
};

const INITIAL_USERS = [
  MOCK_OWNER,
  { id: 'user-2', full_name: 'Maria Lopez', email: 'maria@nyasadesk.com', role: 'admin', avatar: null, workspace_id: 'ws-1', status: 'online' },
  { id: 'user-3', full_name: 'James Okafor', email: 'james@nyasadesk.com', role: 'agent', avatar: null, workspace_id: 'ws-1', status: 'away' },
  { id: 'user-4', full_name: 'Priya Nair', email: 'priya@nyasadesk.com', role: 'agent', avatar: null, workspace_id: 'ws-1', status: 'offline' },
];

const INITIAL_CONTACTS = [
  { id: 'c-1', full_name: 'Sarah Chen', email: 'sarah.chen@acme.com', phone: '+1 415 555 0101', company: 'Acme Corp', lead_source: 'whatsapp', deal_stage: 'Qualified', tags: ['enterprise', 'hot lead'], notes: 'Very interested in the enterprise plan.', created_date: '2026-06-01T10:00:00Z' },
  { id: 'c-2', full_name: 'James Okafor', email: 'james@innovatech.io', phone: '+44 20 7946 0101', company: 'InnovaTech', lead_source: 'email', deal_stage: 'Proposal Sent', tags: ['follow-up'], notes: '', created_date: '2026-06-10T08:00:00Z' },
  { id: 'c-3', full_name: 'Priya Nair', email: 'priya.nair@globalops.in', phone: '+91 98765 43210', company: 'GlobalOps', lead_source: 'website', deal_stage: 'New Lead', tags: ['demo', 'inbound'], notes: '', created_date: '2026-06-20T07:00:00Z' },
  { id: 'c-4', full_name: 'Carlos Mendez', email: 'c.mendez@futurelogic.mx', phone: '+52 55 1234 5678', company: 'FutureLogic', lead_source: 'messenger', deal_stage: 'Negotiation', tags: ['LATAM'], notes: 'Needs 90-day payment terms.', created_date: '2026-06-12T12:00:00Z' },
  { id: 'c-5', full_name: 'Emily Harrington', email: 'emily.h@brightwave.com', phone: '+1 212 555 0199', company: 'BrightWave', lead_source: 'email', deal_stage: 'Closed Won', tags: ['won'], notes: '', created_date: '2026-05-28T09:00:00Z' },
  { id: 'c-6', full_name: 'Tomas Vogel', email: 'tomas@nordconsult.de', phone: '+49 30 12345678', company: 'NordConsult', lead_source: 'messenger', deal_stage: 'Contacted', tags: [], notes: '', created_date: '2026-06-15T11:00:00Z' },
];

const INITIAL_CONVERSATIONS = [
  { id: 'conv-1', subject: 'Enterprise pricing for 200 seats', contact_id: 'c-1', contact_name: 'Sarah Chen', contact_email: 'sarah.chen@acme.com', channel: 'email', status: 'open', assigned_to: 'user-owner', assigned_to_name: 'Alex Rivera', priority: 'urgent', tags: ['enterprise', 'hot lead'], last_message_preview: 'I have a few questions about the volume discount...', last_message_at: '2026-06-27T09:15:00Z', unread: true, deal_stage: 'Qualified', is_reminder_active: false, sla_breach_at: '2026-06-27T13:15:00Z', created_date: '2026-06-20T10:00:00Z', updated_date: '2026-06-27T09:15:00Z' },
  { id: 'conv-2', subject: 'Custom SLA for EU region', contact_id: 'c-2', contact_name: 'James Okafor', contact_email: 'james@innovatech.io', channel: 'whatsapp', status: 'open', assigned_to: 'user-2', assigned_to_name: 'Maria Lopez', priority: 'high', tags: ['follow-up', 'enterprise'], last_message_preview: 'We need GDPR-compliant data processing guarantees.', last_message_at: '2026-06-27T08:30:00Z', unread: true, deal_stage: 'Proposal Sent', is_reminder_active: true, reminder_at: '2026-06-28T10:00:00Z', sla_breach_at: '2026-06-27T12:30:00Z', created_date: '2026-06-18T08:00:00Z', updated_date: '2026-06-27T08:30:00Z' },
  { id: 'conv-3', subject: 'Product demo request', contact_id: 'c-3', contact_name: 'Priya Nair', contact_email: 'priya.nair@globalops.in', channel: 'website', status: 'unassigned', assigned_to: null, assigned_to_name: null, priority: 'normal', tags: ['demo', 'inbound'], last_message_preview: 'Hello! I found your product through Google.', last_message_at: '2026-06-27T07:45:00Z', unread: true, deal_stage: 'New Lead', is_reminder_active: false, sla_breach_at: '2026-06-27T11:45:00Z', created_date: '2026-06-27T07:00:00Z', updated_date: '2026-06-27T07:45:00Z' },
  { id: 'conv-4', subject: 'Contract negotiation - volume pricing', contact_id: 'c-4', contact_name: 'Carlos Mendez', contact_email: 'c.mendez@futurelogic.mx', channel: 'messenger', status: 'open', assigned_to: 'user-2', assigned_to_name: 'Maria Lopez', priority: 'high', tags: ['negotiation', 'LATAM'], last_message_preview: 'We need a 90-day payment term instead of 60.', last_message_at: '2026-06-26T16:20:00Z', unread: false, deal_stage: 'Negotiation', is_reminder_active: false, sla_breach_at: null, created_date: '2026-06-15T12:00:00Z', updated_date: '2026-06-26T16:20:00Z' },
  { id: 'conv-5', subject: 'Onboarding kickoff confirmation', contact_id: 'c-5', contact_name: 'Emily Harrington', contact_email: 'emily.h@brightwave.com', channel: 'email', status: 'closed', assigned_to: 'user-owner', assigned_to_name: 'Alex Rivera', priority: 'normal', tags: ['won'], last_message_preview: 'We are ready to get started!', last_message_at: '2026-06-25T14:00:00Z', unread: false, deal_stage: 'Closed Won', is_reminder_active: false, sla_breach_at: null, created_date: '2026-06-10T09:00:00Z', updated_date: '2026-06-25T14:00:00Z' },
  { id: 'conv-6', subject: 'Discovery call follow-up', contact_id: 'c-6', contact_name: 'Tomas Vogel', contact_email: 'tomas@nordconsult.de', channel: 'messenger', status: 'unassigned', assigned_to: null, assigned_to_name: null, priority: 'low', tags: ['follow-up'], last_message_preview: 'Thanks for the call. Will share with my team.', last_message_at: '2026-06-26T11:00:00Z', unread: false, deal_stage: 'Contacted', is_reminder_active: false, sla_breach_at: null, created_date: '2026-06-22T11:00:00Z', updated_date: '2026-06-26T11:00:00Z' },
  { id: 'conv-7', subject: 'Urgent: API integration errors', contact_id: 'c-1', contact_name: 'Sarah Chen', contact_email: 'sarah.chen@acme.com', channel: 'whatsapp', status: 'open', assigned_to: 'user-owner', assigned_to_name: 'Alex Rivera', priority: 'urgent', tags: ['support'], last_message_preview: 'Our dev team is getting 401 errors on the API.', last_message_at: '2026-06-27T10:05:00Z', unread: true, deal_stage: 'Qualified', is_reminder_active: false, sla_breach_at: '2026-06-27T14:05:00Z', created_date: '2026-06-27T10:00:00Z', updated_date: '2026-06-27T10:05:00Z' },
];

const INITIAL_MESSAGES = {
  'conv-1': [
    { id: 'msg-1a', conversation_id: 'conv-1', type: 'inbound', body: 'Hi there! We are evaluating your platform for our team of 200. Can you walk me through the enterprise pricing?', sender_name: 'Sarah Chen', sender_id: 'c-1', channel: 'email', created_date: '2026-06-27T08:00:00Z' },
    { id: 'msg-1b', conversation_id: 'conv-1', type: 'outbound', body: 'Hi Sarah! Great to hear from you. Our enterprise plan starts at $15/seat/month with volume discounts for 100+ seats.', sender_name: 'Alex Rivera', sender_id: 'user-owner', channel: 'email', created_date: '2026-06-27T08:30:00Z' },
    { id: 'msg-1c', conversation_id: 'conv-1', type: 'inbound', body: 'I have a few questions about the volume discount and also about SSO support.', sender_name: 'Sarah Chen', sender_id: 'c-1', channel: 'email', created_date: '2026-06-27T09:15:00Z' },
  ],
  'conv-2': [
    { id: 'msg-2a', conversation_id: 'conv-2', type: 'inbound', body: 'We need GDPR-compliant data processing guarantees for our EU operations.', sender_name: 'James Okafor', sender_id: 'c-2', channel: 'whatsapp', created_date: '2026-06-27T08:30:00Z' },
  ],
  'conv-7': [
    { id: 'msg-7a', conversation_id: 'conv-7', type: 'inbound', body: 'Our dev team is getting 401 errors on the API. This is blocking our integration.', sender_name: 'Sarah Chen', sender_id: 'c-1', channel: 'whatsapp', created_date: '2026-06-27T10:05:00Z' },
  ],
};

const INITIAL_CANNED = [
  { id: 'cr-1', title: 'Greeting', shortcut: '/hi', body: 'Hi {{name}}, thanks for reaching out to Nyasadesk! How can I help you today?' },
  { id: 'cr-2', title: 'Follow up', shortcut: '/fu', body: 'Hi {{name}}, just following up on our previous conversation. Do you have any questions?' },
  { id: 'cr-3', title: 'Pricing', shortcut: '/price', body: 'Our plans start at $29/month for small teams. Would you like me to send over a detailed pricing sheet?' },
  { id: 'cr-4', title: 'Demo invite', shortcut: '/demo', body: 'I\'d love to show you Nyasadesk in action! Book a 30-minute demo: https://cal.nyasadesk.com' },
  { id: 'cr-5', title: 'Closing', shortcut: '/bye', body: 'Thanks for chatting with us today, {{name}}! Feel free to reach out anytime. 🙌' },
];

const INITIAL_BROADCASTS = [
  { id: 'bc-1', name: 'June Product Update', channel: 'whatsapp', status: 'sent', audience: ['c-1','c-2','c-3'], message: 'Hi {{name}}, we just launched our new AI auto-reply feature!', sent_at: '2026-06-20T10:00:00Z', sent_count: 3, delivered_count: 3, read_count: 2, created_date: '2026-06-19T12:00:00Z' },
  { id: 'bc-2', name: 'Re-engagement Campaign', channel: 'email', status: 'draft', audience: ['c-4','c-6'], message: 'Hi {{name}}, we\'d love to reconnect — can we set up a quick call?', sent_at: null, sent_count: 0, delivered_count: 0, read_count: 0, created_date: '2026-06-25T09:00:00Z' },
];

const INITIAL_RULES = [
  { id: 'rule-1', name: 'Round Robin - All Channels', type: 'round_robin', channel: 'all', condition_value: '', assigned_to_ids: ['user-owner','user-2','user-3'], assigned_to_names: ['Alex Rivera','Maria Lopez','James Okafor'], is_active: true, priority_order: 1, round_robin_index: 0 },
  { id: 'rule-2', name: 'Enterprise leads → Alex', type: 'lead_source', channel: 'email', condition_value: 'enterprise', assigned_to_ids: ['user-owner'], assigned_to_names: ['Alex Rivera'], is_active: true, priority_order: 2, round_robin_index: 0 },
];

const INITIAL_WORKSPACE = {
  id: 'ws-1', name: 'Nyasadesk Demo', logo: null, plan: 'pro',
  channels: ['whatsapp', 'messenger', 'email', 'website'],
  onboarding_complete: true, sla_hours: 4,
  business_hours: { start: '09:00', end: '18:00', timezone: 'UTC' },
};

// Mutable state
let conversations = INITIAL_CONVERSATIONS.map(c => ({ ...c }));
let contacts = INITIAL_CONTACTS.map(c => ({ ...c }));
let users = INITIAL_USERS.map(u => ({ ...u }));
let workspace = { ...INITIAL_WORKSPACE };
let broadcasts = INITIAL_BROADCASTS.map(b => ({ ...b }));
let rules = INITIAL_RULES.map(r => ({ ...r }));
let canned = INITIAL_CANNED.map(c => ({ ...c }));
const messageStore = Object.fromEntries(
  Object.entries(INITIAL_MESSAGES).map(([k, msgs]) => [k, msgs.map(m => ({ ...m }))])
);

export const store = {
  getConversations: () => conversations,
  updateConversation: (id, data) => { conversations = conversations.map(c => c.id === id ? { ...c, ...data } : c); },
  addConversation: (conv) => { conversations = [conv, ...conversations]; },

  getMessages: (convId) => messageStore[convId] || [],
  addMessage: (convId, msg) => {
    if (!messageStore[convId]) messageStore[convId] = [];
    messageStore[convId] = [...messageStore[convId], msg];
  },

  getContacts: () => contacts,
  updateContact: (id, data) => { contacts = contacts.map(c => c.id === id ? { ...c, ...data } : c); },
  addContact: (c) => { contacts = [c, ...contacts]; },
  deleteContact: (id) => { contacts = contacts.filter(c => c.id !== id); },

  getUsers: () => users,
  addUser: (u) => { users = [...users, u]; },
  removeUser: (id) => { users = users.filter(u => u.id !== id); },
  updateUser: (id, data) => { users = users.map(u => u.id === id ? { ...u, ...data } : u); },

  getWorkspace: () => workspace,
  updateWorkspace: (data) => { workspace = { ...workspace, ...data }; },

  getBroadcasts: () => broadcasts,
  addBroadcast: (b) => { broadcasts = [b, ...broadcasts]; },
  updateBroadcast: (id, data) => { broadcasts = broadcasts.map(b => b.id === id ? { ...b, ...data } : b); },
  deleteBroadcast: (id) => { broadcasts = broadcasts.filter(b => b.id !== id); },

  getRules: () => rules,
  addRule: (r) => { rules = [...rules, r]; },
  updateRule: (id, data) => { rules = rules.map(r => r.id === id ? { ...r, ...data } : r); },
  deleteRule: (id) => { rules = rules.filter(r => r.id !== id); },

  getCanned: () => canned,
  addCanned: (c) => { canned = [...canned, c]; },
  updateCanned: (id, data) => { canned = canned.map(c => c.id === id ? { ...c, ...data } : c); },
  deleteCanned: (id) => { canned = canned.filter(c => c.id !== id); },
};

export function genId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}