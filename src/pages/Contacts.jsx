import { useState } from 'react';
import { Search, Plus, User, Mail, Phone, ChevronRight, Edit3, Trash2, Check, X } from 'lucide-react';
import NavRail from '@/components/NavRail';
import DealStageStepper from '@/components/DealStageStepper';
import TagChip from '@/components/TagChip';
import ChannelBadge from '@/components/ChannelBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_USER, MOCK_CONTACTS, MOCK_CONVERSATIONS, genId } from '@/lib/mockData';

const STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];

// In-memory conversation lookup for contact history
function getContactHistory(contactId) {
  return MOCK_CONVERSATIONS.filter(c => c.contact_id === contactId);
}

function ContactDrawer({ contact, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...contact });
  const history = getContactHistory(contact.id);

  const save = () => {
    onUpdate({ ...contact, ...editData });
    setEditing(false);
  };

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-y-auto scrollbar-thin shrink-0"
    >
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Contact Profile</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(!editing)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            {editing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          </button>
          <button onClick={() => { if (window.confirm('Delete this contact?')) onDelete(contact.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white font-bold text-xl mb-4">
            {contact.full_name?.[0]?.toUpperCase() || '?'}
          </div>

          {editing ? (
            <div className="space-y-2.5">
              {[
                { key: 'full_name', placeholder: 'Full Name', label: 'Name' },
                { key: 'email', placeholder: 'Email', label: 'Email' },
                { key: 'phone', placeholder: 'Phone', label: 'Phone' },
                { key: 'company', placeholder: 'Company', label: 'Company' },
                { key: 'territory', placeholder: 'Territory', label: 'Territory' },
              ].map(({ key, placeholder, label }) => (
                <div key={key}>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5 block">{label}</label>
                  <input
                    value={editData[key] || ''}
                    onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
                  />
                </div>
              ))}
              <button onClick={save} className="w-full py-2 bg-[#5C6CF7] text-white text-xs font-semibold rounded-lg hover:bg-[#4A5CE6] transition-colors flex items-center justify-center gap-1.5 mt-2">
                <Check className="w-3 h-3" /> Save Changes
              </button>
            </div>
          ) : (
            <>
              <h3 className="font-bold text-gray-900 text-lg leading-tight">{contact.full_name}</h3>
              {contact.company && <p className="text-sm text-gray-500">{contact.company}</p>}
              {contact.territory && <p className="text-xs text-gray-400 mt-0.5">{contact.territory}</p>}
              <div className="mt-3 space-y-1.5">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#5C6CF7] transition-colors">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {contact.phone}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {contact.lead_source && <ChannelBadge channel={contact.lead_source} showLabel />}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Deal Stage</p>
          <DealStageStepper
            currentStage={contact.deal_stage || 'New Lead'}
            onChange={stage => onUpdate({ ...contact, deal_stage: stage })}
            compact
          />
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Notes</p>
          <textarea
            rows={4}
            defaultValue={contact.notes || ''}
            onBlur={e => onUpdate({ ...contact, notes: e.target.value })}
            placeholder="Add notes about this contact…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] text-gray-700 placeholder:text-gray-400"
          />
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Conversations ({history.length})</p>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400">No conversations yet</p>
          ) : (
            <div className="space-y-2">
              {history.map(c => (
                <div key={c.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ChannelBadge channel={c.channel} />
                    <span className="text-xs font-medium text-gray-700 truncate">{c.subject}</span>
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      c.status === 'closed' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                    }`}>{c.status}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{c.last_message_preview || 'No messages'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const stageColors = {
  'New Lead': 'bg-gray-100 text-gray-600',
  'Contacted': 'bg-blue-100 text-blue-600',
  'Qualified': 'bg-indigo-100 text-indigo-600',
  'Proposal Sent': 'bg-purple-100 text-purple-600',
  'Negotiation': 'bg-amber-100 text-amber-600',
  'Closed Won': 'bg-emerald-100 text-emerald-600',
  'Closed Lost': 'bg-red-100 text-red-600',
};

export default function Contacts() {
  const user = MOCK_USER;
  const [contacts, setContacts] = useState([...MOCK_CONTACTS]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selectedContact, setSelectedContact] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({ full_name: '', email: '', company: '', phone: '' });

  const filtered = contacts.filter(c => {
    if (stageFilter !== 'all' && c.deal_stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q);
    }
    return true;
  });

  const addContact = () => {
    if (!newContact.full_name) return;
    const c = {
      ...newContact,
      id: genId('c'),
      deal_stage: 'New Lead',
      tags: [],
      notes: '',
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    };
    setContacts(prev => [c, ...prev]);
    setShowAddForm(false);
    setNewContact({ full_name: '', email: '', company: '', phone: '' });
    setSelectedContact(c);
  };

  const handleUpdate = (updated) => {
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
    if (selectedContact?.id === updated.id) setSelectedContact(updated);
  };

  const handleDelete = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setSelectedContact(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
      <NavRail user={user} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Contacts</h1>
            <p className="text-xs text-gray-400">{contacts.length} contacts</p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] focus:bg-white w-56 transition-all"
            />
          </div>

          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
          >
            <option value="all">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            <AnimatePresence>
              {showAddForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-white rounded-2xl border border-[#5C6CF7]/30 p-4 mb-4 shadow-sm overflow-hidden"
                >
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                    {[
                      { key: 'full_name', placeholder: 'Full Name *' },
                      { key: 'email', placeholder: 'Email' },
                      { key: 'company', placeholder: 'Company' },
                      { key: 'phone', placeholder: 'Phone' },
                    ].map(({ key, placeholder }) => (
                      <input
                        key={key}
                        value={newContact[key]}
                        onChange={e => setNewContact(d => ({ ...d, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={addContact} disabled={!newContact.full_name} className="px-4 py-1.5 bg-[#5C6CF7] text-white text-sm font-semibold rounded-lg hover:bg-[#4A5CE6] transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <User className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-500 font-medium">No contacts found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map(contact => (
                  <motion.div
                    key={contact.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedContact(contact)}
                    className={`bg-white rounded-xl px-4 py-3.5 border cursor-pointer transition-all flex items-center gap-4 hover:shadow-sm
                      ${selectedContact?.id === contact.id ? 'border-[#5C6CF7] shadow-sm' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5C6CF7]/20 to-[#00A8BD]/20 flex items-center justify-center text-[#5C6CF7] font-bold shrink-0">
                      {contact.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm">{contact.full_name}</p>
                        {contact.lead_source && <ChannelBadge channel={contact.lead_source} />}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {contact.email && <span className="text-xs text-gray-400 truncate">{contact.email}</span>}
                        {contact.company && <span className="text-xs text-gray-500">{contact.company}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${stageColors[contact.deal_stage] || 'bg-gray-100 text-gray-600'}`}>
                        {contact.deal_stage || 'New Lead'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {selectedContact && (
              <ContactDrawer
                contact={selectedContact}
                onClose={() => setSelectedContact(null)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}