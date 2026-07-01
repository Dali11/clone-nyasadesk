import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, X, Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import ChannelBadge from '@/components/ChannelBadge';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getContacts, createContact, updateContact, deleteContact, getConversations } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STAGES = ['All', 'New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];
const STAGE_COLORS = {
  'New Lead': 'text-gray-400 bg-white/5', 'Contacted': 'text-blue-400 bg-blue-900/20',
  'Qualified': 'text-purple-400 bg-purple-900/20', 'Proposal Sent': 'text-yellow-400 bg-yellow-900/20',
  'Negotiation': 'text-orange-400 bg-orange-900/20', 'Closed Won': 'text-green-400 bg-green-900/20',
  'Closed Lost': 'text-red-400 bg-red-900/20',
};

function ContactDrawer({ contact, workspaceId, onClose, onSave }) {
  const [editData, setEditData] = useState({ ...contact });
  const [conversations, setConversations] = useState([]);
  const set = (k, v) => setEditData(d => ({ ...d, [k]: v }));
  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  useEffect(() => {
    if (!workspaceId || !contact?.id) return;
    getConversations(workspaceId)
      .then(all => setConversations(all.filter(c => c.contact_id === contact.id)))
      .catch(() => setConversations([]));
  }, [workspaceId, contact?.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-96 bg-[#111B21] border-l border-white/10 flex flex-col overflow-y-auto scrollbar-thin">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Contact Details</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 border-b border-white/10 text-center">
          <Avatar name={editData.full_name} size="xl" />
          <div className="mt-3 space-y-2">
            {[['full_name','Name'],['email','Email'],['phone','Phone'],['company','Company']].map(([k, ph]) => (
              <input key={k} className={inputCls} placeholder={ph} value={editData[k] || ''} onChange={e => set(k, e.target.value)} />
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Deal Stage</p>
          <select value={editData.deal_stage || 'New Lead'} onChange={e => set('deal_stage', e.target.value)}
            className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
            {STAGES.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
          <textarea rows={3} value={editData.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Add notes…"
            className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 resize-none placeholder:text-gray-600" />
        </div>
        {conversations.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversations ({conversations.length})</p>
            <div className="space-y-2">
              {conversations.map(c => (
                <div key={c.id} className="bg-[#2A3942] rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ChannelBadge channel={c.channel} />
                    <span className="text-xs text-gray-300 truncate">{c.last_message_preview || c.last_message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-5 py-4 mt-auto border-t border-white/10">
          <button onClick={() => onSave(editData)}
            className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors text-sm">
            Save Contact
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Contacts() {
  useDocumentTitle('Contacts');
  const { user, profile } = useNyasaAuth();
  const workspaceId = profile?.workspace_id || user?.id;

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ full_name: '', email: '', phone: '', company: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const data = await getContacts(workspaceId);
      setContacts(data);
    } catch (e) {
      console.error('[Contacts] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  const filtered = contacts.filter(c => {
    if (stageFilter !== 'All' && c.deal_stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.full_name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
    }
    return true;
  });

  const saveContact = async (data) => {
    try {
      await updateContact(data.id, {
        full_name: data.full_name, email: data.email, phone: data.phone,
        company: data.company, deal_stage: data.deal_stage, notes: data.notes,
      });
      setSelected(null);
      await load();
    } catch (e) {
      console.error('[Contacts] save error:', e);
    }
  };

  const handleCreate = async () => {
    if (!newForm.full_name.trim() || !workspaceId || saving) return;
    setSaving(true);
    try {
      await createContact(workspaceId, { ...newForm, deal_stage: 'New Lead' });
      setShowNew(false);
      setNewForm({ full_name: '', email: '', phone: '', company: '' });
      await load();
    } catch (e) {
      console.error('[Contacts] create error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteContact(id);
      if (selected?.id === id) setSelected(null);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error('[Contacts] delete error:', e);
    }
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0D1418]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-4 bg-[#111B21]">
          <div>
            <h1 className="text-base font-bold text-white">Contacts</h1>
            <p className="text-xs text-gray-500">{contacts.length} contacts</p>
          </div>
          <div className="flex-1 relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#2A3942] rounded-lg border-0 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
          </div>
          <button onClick={() => setShowNew(true)}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors">
            <Plus className="w-4 h-4" /> New Contact
          </button>
        </div>
        <div className="px-6 py-2 border-b border-white/10 flex gap-1 overflow-x-auto scrollbar-thin">
          {STAGES.map(s => (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all
                ${stageFilter === s ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-gray-500 hover:text-gray-300'}`}>{s}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Name','Company','Stage',''].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => setSelected(c)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.full_name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-white">{c.full_name}</p>
                          <p className="text-xs text-gray-500">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-400">{c.company}</td>
                    <td className="px-6 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[c.deal_stage] || 'text-gray-400 bg-white/5'}`}>
                        {c.deal_stage || 'New Lead'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/30 hover:text-red-400 text-gray-600 rounded-lg transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={4} className="py-16 text-center text-sm text-gray-500">No contacts found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowNew(false)} />
          <div className="relative bg-[#202C33] rounded-2xl border border-white/10 p-6 w-96 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-white">New Contact</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-200"><X className="w-4 h-4" /></button>
            </div>
            {[['full_name','Name *'],['email','Email'],['phone','Phone'],['company','Company']].map(([k, ph]) => (
              <input key={k} className={inputCls} placeholder={ph} value={newForm[k] || ''} onChange={e => setNewForm(f => ({ ...f, [k]: e.target.value }))} />
            ))}
            <button onClick={handleCreate} disabled={!newForm.full_name.trim() || saving}
              className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : 'Add Contact'}
            </button>
          </div>
        </div>
      )}
      {selected && <ContactDrawer contact={selected} workspaceId={workspaceId} onClose={() => setSelected(null)} onSave={saveContact} />}
    </div>
  );
}
