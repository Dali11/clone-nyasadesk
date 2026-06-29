// In-memory reactive store for Nyasadesk

const MOCK_OWNER = {
  id: 'user-owner', full_name: 'Alex Rivera', email: 'alex@nyasadesk.com',
  role: 'owner', avatar: null, workspace_id: 'ws-1', status: 'online',
};

const INITIAL_USERS = [MOCK_OWNER];

const INITIAL_CONTACTS = [];

const INITIAL_CONVERSATIONS = [];

const INITIAL_MESSAGES = {};

const INITIAL_CANNED = [
  { id: 'cr-1', title: 'Greeting', shortcut: '/hi', body: 'Hi {{name}}, thanks for reaching out to Nyasadesk! How can I help you today?' },
  { id: 'cr-2', title: 'Follow up', shortcut: '/fu', body: 'Hi {{name}}, just following up on our previous conversation. Do you have any questions?' },
  { id: 'cr-3', title: 'Pricing', shortcut: '/price', body: 'Our plans start at $29/month for small teams. Would you like me to send over a detailed pricing sheet?' },
  { id: 'cr-4', title: 'Demo invite', shortcut: '/demo', body: 'I\'d love to show you Nyasadesk in action! Book a 30-minute demo: https://cal.nyasadesk.com' },
  { id: 'cr-5', title: 'Closing', shortcut: '/bye', body: 'Thanks for chatting with us today, {{name}}! Feel free to reach out anytime. 🙌' },
];

const INITIAL_BROADCASTS = [];

const INITIAL_RULES = [];

const INITIAL_WORKSPACE = {
  id: 'ws-1', name: 'My Workspace', logo: null, plan: 'pro',
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