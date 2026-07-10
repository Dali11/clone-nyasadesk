import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, X, Loader2, SlidersHorizontal, ChevronDown, UserCircle2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import ChannelBadge from '@/components/ChannelBadge';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getContacts, createContact, updateContact, deleteContact, getConversations } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STAGES = ['All', 'New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];
const STAGE_COLORS = {
  'New Lead':      'text-gray-400 bg-white/5',
  'Contacted':     'text-blue-400 bg-blue-900/20',
  'Qualified':     'text-purple-400 bg-purple-900/20',
  'Proposal Sent': 'text-yellow-400 bg-yellow-900/20',
  'Negotiation':   'text-orange-400 bg-orange-900/20',
  'Closed Won':    'text-green-400 bg-green-900/20',
  'Closed Lost':   'text-red-400 bg-red-900/20',
};
const SORT_OPTIONS = [
  { value: 'name_asc',    label: 'Name A→Z' },
  { value: 'name_desc',   label: 'Name Z→A' },
  { value: 'newest',      label: 'Newest first' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'company_asc', label: 'Company A→Z' },
];

/* ── Contact drawer ─────────────────────────────────────────────────── */
function ContactDrawer({ contact, workspaceId, onClose, onSave }) {
  const [editData, setEditData] = useState({ ...contact });
  const [conversations, setConversations] = useState([]);
  const set = (k, v) => setEditData(d => ({ ...d, [k]: v }));
  const inp = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  useEffect(() => {
    if (!workspaceId || !contact?.id) return;
    getConversations(workspaceId)
      .then(all => setConversations(all.filter(c => c.contact_id === contact.id)))
      .catch(() => {});
  }, [workspaceId, contact?.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-sm md:w-96 bg-[var(--nyasa-surface-1)] border-l border-[var(--nyasa-border)] flex flex-col overflow-y-auto scrollbar-thin">
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)] flex items-center justify-between">
          <h2 className="font-semibold text-white">Contact Details</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)] text-center">
          <Avatar name={editData.full_name} src={editData.avatar_url} size="xl" />
          <div className="mt-3 space-y-2">
            {[['full_name','Name'],['email','Email'],['phone','Phone'],['company','Company']].map(([k, ph]) => (
              <input key={k} className={inp} placeholder={ph} value={editData[k] || ''} onChange={e => set(k, e.target.value)} />
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Deal Stage</p>
          <select value={editData.deal_stage || 'New Lead'} onChange={e => set('deal_stage', e.target.value)}
            className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
            {STAGES.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
          <textarea rows={3} value={editData.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Add notes…"
            className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 resize-none placeholder:text-gray-600" />
        </div>
        {conversations.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversations ({conversations.length})</p>
            <div className="space-y-2">
              {conversations.map(cv => (
                <div key={cv.id} className="bg-[var(--nyasa-surface-4)] rounded-xl px-3 py-2 flex items-center gap-2">
                  <ChannelBadge channel={cv.channel} />
                  <span className="text-xs text-gray-300 truncate">{cv.last_message_preview || cv.last_message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-5 py-4 mt-auto border-t border-[var(--nyasa-border)]">
          <button onClick={() => onSave(editData)}
            className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] text-sm">
            Save Contact
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────── */
export default function Contacts() {
  useDocumentTitle('Contacts');
  const { user, profile, isWorkspaceAdmin } = useNyasaAuth();
  const canManage = isWorkspaceAdmin || profile?.role === 'sales_manager';
  const workspaceId = profile?.workspace_id || user?.id;

  const [contacts, setContacts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [sort, setSort]               = useState('name_asc');
  const [showSort, setShowSort]       = useState(false);
  const [drawerContact, setDrawerContact] = useState(null);
  const [selected, setSelected]       = useState(() => new Set());
  const [showNew, setShowNew]         = useState(false);
  const [newForm, setNewForm]         = useState({ full_name: '', email: '', phone: '', company: '' });
  const [saving, setSaving]           = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);

  const load = async () => {
    if (!workspaceId) { setLoading(false); return; }
    try { setContacts(await getContacts(workspaceId)); }
    catch (e) { console.error('[Contacts] load:', e); }
    finally { setLoading(false); }
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

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'name_desc':   return (b.full_name || '').localeCompare(a.full_name || '');
      case 'newest':      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      case 'oldest':      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      case 'company_asc': return (a.company || '').localeCompare(b.company || '');
      default:            return (a.full_name || '').localeCompare(b.full_name || '');
    }
  });

  const toggleSelect = id =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = canManage && filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const toggleSelectAll = () =>
    setSelected(prev => { const n = new Set(prev); allSelected ? filtered.forEach(c => n.delete(c.id)) : filtered.forEach(c => n.add(c.id)); return n; });

  const bulkDelete = async () => {
    if (!selected.size || !window.confirm(`Delete ${selected.size} contacts? This cannot be undone.`)) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => deleteContact(id).catch(console.error)));
    setContacts(prev => prev.filter(c => !ids.includes(c.id)));
    setSelected(new Set());
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    await deleteContact(id).catch(console.error);
    if (drawerContact?.id === id) setDrawerContact(null);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const saveContact = async (data) => {
    try {
      await updateContact(data.id, { full_name: data.full_name, email: data.email, phone: data.phone, company: data.company, deal_stage: data.deal_stage, notes: data.notes });
      setDrawerContact(null); await load();
    } catch (e) { console.error('[Contacts] save:', e); }
  };

  const handleCreate = async () => {
    if (!newForm.full_name.trim() || !workspaceId || saving) return;
    setSaving(true);
    try {
      await createContact(workspaceId, { ...newForm, deal_stage: 'New Lead' });
      setShowNew(false); setNewForm({ full_name: '', email: '', phone: '', company: '' }); await load();
    } catch (e) { console.error('[Contacts] create:', e); }
    finally { setSaving(false); }
  };

  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label || 'Sort';
  const inp = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--nyasa-surface-5)]">

        {/* ── Header ── */}
        <div className="bg-[var(--nyasa-surface-1)] border-b border-[var(--nyasa-border)] px-4 pt-3 pb-2">
          {/* Row 1: title + actions */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-white leading-tight">Contacts</h1>
              <p className="text-[11px] text-gray-500">{contacts.length} contacts</p>
            </div>
            {/* Search toggle (mobile) / search bar (desktop) */}
            <button onClick={() => setSearchOpen(o => !o)}
              className="md:hidden p-2 rounded-xl bg-[var(--nyasa-surface-2)] text-gray-400 hover:text-white shrink-0">
              <Search className="w-4 h-4" />
            </button>
            {/* Sort button */}
            <div className="relative">
              <button onClick={() => setShowSort(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--nyasa-surface-2)] rounded-xl text-xs text-gray-300 hover:text-white border border-[var(--nyasa-border)] whitespace-nowrap">
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{sortLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-xl shadow-xl z-30 min-w-[160px] py-1">
                  {SORT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => { setSort(o.value); setShowSort(false); }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-white/5 ${sort === o.value ? 'text-[#25D366] font-semibold' : 'text-gray-300'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* New contact */}
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white text-xs font-semibold rounded-xl hover:bg-[#20BA5A] shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Contact</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
          {/* Row 2: search bar (always on desktop, toggleable on mobile) */}
          <div className={`${searchOpen ? 'flex' : 'hidden md:flex'} mb-2`}>
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or company…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-[var(--nyasa-surface-2)] rounded-xl border border-[var(--nyasa-border)] text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
          {/* Row 3: stage filter tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {STAGES.map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0
                  ${stageFilter === s ? 'bg-[#25D366]/20 text-[#25D366] font-semibold' : 'text-gray-500 hover:text-gray-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── List ── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
              <UserCircle2 className="w-12 h-12 text-gray-700" />
              <p className="text-gray-400 font-medium">No contacts found</p>
              <p className="text-gray-600 text-sm">{search ? 'Try a different search term' : 'Add your first contact to get started'}</p>
              {!search && <button onClick={() => setShowNew(true)} className="mt-1 px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A]"><Plus className="w-4 h-4 inline mr-1" />New Contact</button>}
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-white/5">
                {canManage && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--nyasa-surface-1)]">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-[#25D366]" />
                    <span className="text-xs text-gray-500">Select all</span>
                  </div>
                )}
                {sorted.map(c => (
                  <div key={c.id} onClick={() => setDrawerContact(c)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 cursor-pointer transition-colors">
                    {canManage && (
                      <input type="checkbox" checked={selected.has(c.id)}
                        onChange={e => { e.stopPropagation(); toggleSelect(c.id); }}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-[#25D366] shrink-0" />
                    )}
                    <Avatar name={c.full_name} src={c.avatar_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.full_name || '—'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.company && <span className="text-xs text-gray-500 truncate max-w-[120px]">{c.company}</span>}
                        {c.company && c.deal_stage && <span className="text-gray-700 text-xs">·</span>}
                        {c.deal_stage && c.deal_stage !== 'New Lead' && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STAGE_COLORS[c.deal_stage] || 'text-gray-400 bg-white/5'}`}>
                            {c.deal_stage}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                        className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-[var(--nyasa-border)]">
                    {canManage && (
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-[#25D366]" />
                      </th>
                    )}
                    {['Name','Company','Stage',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => (
                    <tr key={c.id} onClick={() => setDrawerContact(c)}
                      className="border-b border-[var(--nyasa-border)] hover:bg-white/5 cursor-pointer transition-colors group">
                      {canManage && (
                        <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="w-4 h-4 rounded accent-[#25D366]" />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.full_name} src={c.avatar_url} size="sm" />
                          <span className="text-sm text-white font-medium">{c.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{c.company || '—'}</td>
                      <td className="px-4 py-3">
                        {c.deal_stage && (
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[c.deal_stage] || 'text-gray-400 bg-white/5'}`}>
                            {c.deal_stage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 w-12 text-right">
                        {canManage && (
                          <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* ── Bulk action bar ── */}
        {selected.size > 0 && (
          <div className="absolute bottom-[56px] md:bottom-0 left-0 right-0 md:left-[72px] flex items-center justify-between px-4 py-3 bg-[var(--nyasa-surface-2)] border-t border-[var(--nyasa-border)] shadow-xl z-20">
            <span className="text-sm text-white font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 rounded-lg">Cancel</button>
              <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg border border-red-500/30">
                <Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Contact drawer ── */}
      {drawerContact && (
        <ContactDrawer contact={drawerContact} workspaceId={workspaceId} onClose={() => setDrawerContact(null)} onSave={saveContact} />
      )}

      {/* ── New contact modal ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--nyasa-border)] flex items-center justify-between">
              <h2 className="font-semibold text-white">New Contact</h2>
              <button onClick={() => setShowNew(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[['full_name','Full name *'],['email','Email'],['phone','Phone'],['company','Company']].map(([k, ph]) => (
                <input key={k} className={inp} placeholder={ph} value={newForm[k] || ''} onChange={e => setNewForm(f => ({ ...f, [k]: e.target.value }))} />
              ))}
            </div>
            <div className="px-5 pb-5">
              <button onClick={handleCreate} disabled={!newForm.full_name.trim() || saving}
                className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop to close sort dropdown */}
      {showSort && <div className="fixed inset-0 z-20" onClick={() => setShowSort(false)} />}
    </div>
  );
}
