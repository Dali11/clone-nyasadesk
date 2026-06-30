// store.js — workspace state helpers
// Mock state is replaced by Supabase-backed data.
// This file is kept as a thin compatibility shim while pages are migrated.
// TODO: migrate each consumer to use Supabase / entity hooks directly.

let workspace = {
  id: null, name: '', logo: null, plan: 'free',
  channels: [], onboarding_complete: false, sla_hours: 4,
  business_hours: { start: '09:00', end: '18:00', timezone: 'UTC' },
};

let canned = [
  { id: 'cr-1', title: 'Greeting',   shortcut: '/hi',    body: 'Hi {{name}}, thanks for reaching out to Nyasadesk! How can I help you today?' },
  { id: 'cr-2', title: 'Follow up',  shortcut: '/fu',    body: 'Hi {{name}}, just following up on our previous conversation. Do you have any questions?' },
  { id: 'cr-3', title: 'Pricing',    shortcut: '/price', body: 'Our plans start at $29/month for small teams. Would you like me to send over a detailed pricing sheet?' },
  { id: 'cr-4', title: 'Demo invite',shortcut: '/demo',  body: "I'd love to show you Nyasadesk in action! Book a 30-minute demo: https://cal.nyasadesk.com" },
  { id: 'cr-5', title: 'Closing',    shortcut: '/bye',   body: 'Thanks for chatting with us today, {{name}}! Feel free to reach out anytime.' },
];

export const store = {
  // Workspace
  getWorkspace: () => workspace,
  updateWorkspace: (data) => { workspace = { ...workspace, ...data }; },

  // Canned responses (local until migrated)
  getCanned: () => canned,
  addCanned:    (c)       => { canned = [...canned, c]; },
  updateCanned: (id, data)=> { canned = canned.map(c => c.id === id ? { ...c, ...data } : c); },
  deleteCanned: (id)      => { canned = canned.filter(c => c.id !== id); },

  // Stubs — consumers should migrate to Supabase queries
  getConversations: () => [],
  getMessages:      () => [],
  getContacts:      () => [],
  getUsers:         () => [],
  getBroadcasts:    () => [],
  getRules:         () => [],
};
