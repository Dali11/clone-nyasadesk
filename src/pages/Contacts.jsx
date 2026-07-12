import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Trash2, X, Loader2, SlidersHorizontal, ChevronDown,
  UserCircle2, Phone, Mail, MessageSquare, Upload, Download, Ban,
  Star, Tag, Globe, MoreVertical, Check, AlertCircle,
  ArrowLeft, Edit2, Smartphone,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import ChannelBadge from '@/components/ChannelBadge';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import {
  getContacts, createContact, updateContact, deleteContact,
  getConversations, importContactsCSV, blockContact,
  uploadContactAvatar, startConversationWithContact,
} from '@/lib/channels';
import { useNavigate } from 'react-router-dom';

/* ── Constants ──────────────────────────────────────────────────────── */
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
const LABEL_COLORS = ['#25D366','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

const inp = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

/* ── Toast ──────────────────────────────────────────────────────────── */
function Toast({ msg, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl text-sm font-medium
      ${type === 'success' ? 'bg-[#25D366] text-white' : 'bg-red-500 text-white'}`}>
      {type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

/* ── CSV Import Modal ───────────────────────────────────────────────── */
function CSVImportModal({ onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);

  const parse = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
      const rows = lines.slice(1).map(l => {
        const vals = l.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        // Normalize common header variants
        return {
          full_name: obj.full_name || obj.name || obj['contact name'] || '',
          phone:     obj.phone || obj['phone number'] || obj.mobile || '',
          email:     obj.email || obj['email address'] || '',
          company:   obj.company || obj.organization || '',
        };
      }).filter(r => r.full_name || r.phone);
      setPreview(rows);
    };
    reader.readAsText(f);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)] flex items-center justify-between">
          <h2 className="font-semibold text-white">Import Contacts (CSV)</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">CSV should have columns: <span className="text-gray-300">name, phone, email, company</span> (any order)</p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--nyasa-border)] rounded-xl py-8 cursor-pointer hover:border-[#25D366]/50 transition-colors">
            <Upload className="w-6 h-6 text-gray-500" />
            <span className="text-sm text-gray-400">{file ? file.name : 'Click to choose CSV file'}</span>
            <input type="file" accept=".csv" className="hidden" onChange={e => { setFile(e.target.files[0]); parse(e.target.files[0]); }} />
          </label>
          {preview.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">{preview.length} contacts found — preview:</p>
              <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                {preview.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--nyasa-surface-4)] rounded-lg text-xs text-gray-300">
                    <span className="font-medium text-white truncate w-28">{c.full_name}</span>
                    <span className="text-gray-500 truncate">{c.phone}</span>
                    <span className="text-gray-500 truncate">{c.email}</span>
                  </div>
                ))}
                {preview.length > 5 && <p className="text-xs text-gray-600 px-3">+{preview.length - 5} more</p>}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-[var(--nyasa-border)] flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 rounded-xl">Cancel</button>
          <button
            disabled={!preview.length || loading}
            onClick={async () => { setLoading(true); await onImport(preview); setLoading(false); onClose(); }}
            className="px-4 py-2 text-sm font-semibold bg-[#25D366] text-white rounded-xl hover:bg-[#20BA5A] disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import {preview.length || ''} contacts
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Contact Profile (full WhatsApp-style) ──────────────────────────── */
function ContactProfile({ contact: initial, workspaceId, onClose, onSave, onDelete, onStartChat }) {
  const [contact, setContact]       = useState({ ...initial });
  const [editing, setEditing]       = useState(false);
  const [conversations, setConvs]   = useState([]);
  const [avatarLoading, setAvLoading] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [tab, setTab]               = useState('info'); // info | activity
  const [showMenu, setShowMenu]     = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const avatarRef = useRef();
  const set = (k, v) => setContact(c => ({ ...c, [k]: v }));

  useEffect(() => {
    if (!workspaceId || !contact?.id) return;
    getConversations(workspaceId)
      .then(all => setConvs(all.filter(c => c.contact_id === contact.id)))
      .catch(() => {});
  }, [workspaceId, contact?.id]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvLoading(true);
    try {
      const url = await uploadContactAvatar(workspaceId, contact.id, file);
      setContact(c => ({ ...c, avatar_url: url }));
      onSave({ ...contact, avatar_url: url });
    } catch (err) { console.error(err); }
    finally { setAvLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(contact); setEditing(false); }
    finally { setSaving(false); }
  };

  const addLabel = () => {
    if (!labelInput.trim()) return;
    const tags = [...(contact.tags || [])];
    if (!tags.includes(labelInput.trim())) tags.push(labelInput.trim());
    set('tags', tags);
    setLabelInput('');
  };

  const removeLabel = (tag) => set('tags', (contact.tags || []).filter(t => t !== tag));

  const handleBlock = async () => {
    const blocked = !contact.blocked;
    await blockContact(contact.id, blocked);
    setContact(c => ({ ...c, blocked }));
    setShowMenu(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-sm md:w-[420px] bg-[var(--nyasa-surface-1)] border-l border-[var(--nyasa-border)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--nyasa-border)] flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-white flex-1">Contact info</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(e => !e)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400">
              <Edit2 className="w-4 h-4" />
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(m => !m)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400">
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-xl shadow-xl z-30 min-w-[180px] py-1">
                  <button onClick={handleBlock} className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 flex items-center gap-2 text-red-400">
                    <Ban className="w-4 h-4" />{contact.blocked ? 'Unblock contact' : 'Block contact'}
                  </button>
                  <button onClick={() => { onDelete(contact.id); onClose(); }} className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 flex items-center gap-2 text-red-400">
                    <Trash2 className="w-4 h-4" />Delete contact
                  </button>
                </div>
              )}
            </div>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Name + action buttons — no avatar/initials */}
          <div className="flex flex-col items-center px-5 pt-5 pb-4 border-b border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)]">
            {/* Hidden avatar input still available for future use */}
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

            {/* Name & company — tap to edit inline */}
            <div className="text-center w-full">
              {editing ? (
                <div className="space-y-2 px-2">
                  <input autoFocus className={inp + ' text-center font-semibold'} placeholder="Full name *"
                    value={contact.full_name || ''} onChange={e => set('full_name', e.target.value)} />
                  <input className={inp + ' text-center text-sm'} placeholder="Company"
                    value={contact.company || ''} onChange={e => set('company', e.target.value)} />
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="group w-full">
                  <h2 className="text-white font-bold text-xl leading-tight group-active:text-[#25D366] transition-colors">
                    {contact.full_name || '—'}
                  </h2>
                  {contact.company && (
                    <p className="text-gray-400 text-sm mt-0.5">{contact.company}</p>
                  )}
                </button>
              )}
              {contact.blocked && (
                <span className="inline-flex items-center gap-1 mt-2 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                  <Ban className="w-3 h-3" />Blocked
                </span>
              )}
            </div>

            {/* Action buttons — hide during edit */}
            {!editing && <div className="flex gap-8 mt-5">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex flex-col items-center gap-1.5 group">
                  <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center group-hover:bg-[#25D366]/30 transition-colors">
                    <Phone className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <span className="text-[11px] text-gray-500">Call</span>
                </a>
              )}
              <button onClick={() => onStartChat(contact)} className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center group-hover:bg-[#25D366]/30 transition-colors">
                  <MessageSquare className="w-5 h-5 text-[#25D366]" />
                </div>
                <span className="text-[11px] text-gray-500">Message</span>
              </button>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex flex-col items-center gap-1.5 group">
                  <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center group-hover:bg-[#25D366]/30 transition-colors">
                    <Mail className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <span className="text-[11px] text-gray-500">Email</span>
                </a>
              )}
            </div>}
          </div>

          {/* Info sections */}
          <div className="divide-y divide-[var(--nyasa-border)]">

            {/* Phone — tap to edit */}
            <div className="px-5 py-3.5 flex items-start gap-3 cursor-pointer" onClick={() => setEditing(true)}>
              <Phone className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {editing
                  ? <input autoFocus className={inp} placeholder="Phone number" value={contact.phone || ''} onChange={e => set('phone', e.target.value)} onClick={e => e.stopPropagation()} />
                  : <p className="text-sm text-[#25D366] font-medium">{contact.phone || <span className="text-gray-600 italic">Add phone number</span>}</p>
                }
                <p className="text-[10px] text-gray-600 mt-0.5">Mobile</p>
              </div>
              {!editing && <Edit2 className="w-3.5 h-3.5 text-gray-700 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100" />}
            </div>

            {/* Email — tap to edit */}
            <div className="px-5 py-3.5 flex items-start gap-3 cursor-pointer" onClick={() => setEditing(true)}>
              <Mail className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {editing
                  ? <input className={inp} placeholder="Email address" value={contact.email || ''} onChange={e => set('email', e.target.value)} onClick={e => e.stopPropagation()} />
                  : <p className="text-sm text-white truncate">{contact.email || <span className="text-gray-600 italic">Add email</span>}</p>
                }
                <p className="text-[10px] text-gray-600 mt-0.5">Email</p>
              </div>
            </div>

            {/* Deal Stage — always shows select (tap badge opens it) */}
            <div className="px-5 py-3.5 flex items-start gap-3">
              <Star className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-gray-600 mb-1.5">Deal Stage</p>
                <select
                  value={contact.deal_stage || 'New Lead'}
                  onChange={async e => { const v = e.target.value; set('deal_stage', v); await onSave({ ...contact, deal_stage: v }); }}
                  className="bg-transparent text-xs font-semibold border border-[var(--nyasa-border)] rounded-full px-3 py-1 focus:outline-none focus:ring-1 focus:ring-[#25D366] cursor-pointer appearance-none"
                  style={{ color: 'inherit' }}>
                  {STAGES.slice(1).map(s => <option key={s} value={s} className="bg-[#1a1a1a] text-white">{s}</option>)}
                </select>
              </div>
            </div>

            {/* Labels / Tags */}
            <div className="px-5 py-3 flex items-start gap-3">
              <Tag className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-gray-600 mb-2">Labels</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(contact.tags || []).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[11px] bg-[#25D366]/15 text-[#25D366] px-2 py-0.5 rounded-full">
                      {tag}
                      {editing && <button onClick={() => removeLabel(tag)}><X className="w-2.5 h-2.5" /></button>}
                    </span>
                  ))}
                </div>
                {editing && (
                  <div className="flex gap-2">
                    <input value={labelInput} onChange={e => setLabelInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addLabel()}
                      placeholder="Add label…"
                      className="flex-1 bg-[var(--nyasa-surface-4)] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600" />
                    <button onClick={addLabel} className="px-2 py-1.5 text-xs bg-[#25D366]/20 text-[#25D366] rounded-lg hover:bg-[#25D366]/30">Add</button>
                  </div>
                )}
              </div>
            </div>

            {/* Lead Source */}
            {(contact.lead_source || editing) && (
              <div className="px-5 py-3 flex items-start gap-3">
                <Globe className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[10px] text-gray-600 mb-1">Lead Source</p>
                  {editing ? (
                    <select value={contact.lead_source || ''} onChange={e => set('lead_source', e.target.value)}
                      className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-3 py-2 border-0 focus:outline-none">
                      <option value="">— None —</option>
                      {['email','whatsapp','chat','phone','referral','website','other'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm text-white capitalize">{contact.lead_source}</p>
                  )}
                </div>
              </div>
            )}

            {/* Notes — tap to edit */}
            <div className="px-5 py-3.5 flex items-start gap-3 cursor-pointer" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-gray-600 mb-1">Notes</p>
                {editing ? (
                  <textarea autoFocus rows={3} value={contact.notes || ''} onChange={e => set('notes', e.target.value)}
                    placeholder="Add notes…"
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 resize-none placeholder:text-gray-600" />
                ) : (
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{contact.notes || <span className="text-gray-600 italic">Tap to add notes</span>}</p>
                )}
              </div>
            </div>

            {/* Conversations */}
            {conversations.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Conversations ({conversations.length})
                </p>
                <div className="space-y-2">
                  {conversations.map(cv => (
                    <div key={cv.id} className="bg-[var(--nyasa-surface-4)] rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                      <ChannelBadge channel={cv.channel} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 truncate">{cv.last_message_preview || cv.last_message || 'No messages yet'}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5 capitalize">{cv.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {editing && (
          <div className="px-5 py-4 border-t border-[var(--nyasa-border)] flex gap-2">
            <button onClick={() => { setContact({ ...initial }); setEditing(false); }}
              className="flex-1 py-2.5 bg-white/5 text-gray-300 font-medium rounded-xl hover:bg-white/10 text-sm">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !contact.full_name}
              className="flex-1 py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── New Contact Modal ──────────────────────────────────────────────── */
function NewContactModal({ onClose, onSave }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', company: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.full_name.trim() || form.phone.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--nyasa-border)] flex items-center justify-between">
          <h2 className="font-semibold text-white">New Contact</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {[['full_name','Full name *'],['phone','Phone number'],['email','Email'],['company','Company']].map(([k, ph]) => (
            <input key={k} className={inp} placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)} />
          ))}
        </div>
        <div className="px-5 py-4 border-t border-[var(--nyasa-border)] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10 text-sm">Cancel</button>
          <button
            disabled={!valid || saving}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); onClose(); }}
            className="flex-1 py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Contact
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function Contacts() {
  document.title = 'Contacts · Nyasadesk';
  const { user, profile, isWorkspaceAdmin } = useNyasaAuth();
  const canManage = isWorkspaceAdmin || profile?.role === 'sales_manager';
  const workspaceId = profile?.workspace_id || user?.id;
  const navigate = useNavigate();

  const [contacts, setContacts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [sort, setSort]               = useState('name_asc');
  const [showSort, setShowSort]       = useState(false);
  const [profileContact, setProfile]  = useState(null);
  const [selected, setSelected]       = useState(() => new Set());
  const [showNew, setShowNew]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [toast, setToast]             = useState(null);
  const [searchOpen, setSearchOpen]   = useState(false);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    try { setContacts(await getContacts(workspaceId)); }
    catch (e) { console.error('[Contacts] load:', e); }
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived list ── */
  const filtered = contacts.filter(c => {
    if (stageFilter !== 'All' && c.deal_stage !== stageFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.full_name || '').toLowerCase().includes(q)
      || (c.company || '').toLowerCase().includes(q)
      || (c.phone || '').includes(q)
      || (c.email || '').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name_asc')    return (a.full_name || '').localeCompare(b.full_name || '');
    if (sort === 'name_desc')   return (b.full_name || '').localeCompare(a.full_name || '');
    if (sort === 'newest')      return new Date(b.created_at) - new Date(a.created_at);
    if (sort === 'oldest')      return new Date(a.created_at) - new Date(b.created_at);
    if (sort === 'company_asc') return (a.company || '').localeCompare(b.company || '');
    return 0;
  });

  // Alphabetical grouping (WhatsApp style)
  const grouped = sorted.reduce((acc, c) => {
    const letter = (c.full_name || '#')[0].toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort();

  /* ── Actions ── */
  const handleSave = async (data) => {
    try {
      const updated = await updateContact(data.id, data);
      setContacts(cs => cs.map(c => c.id === updated.id ? updated : c));
      setProfile(updated);
      showToast('Contact saved');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleCreate = async (data) => {
    try {
      const c = await createContact(workspaceId, data);
      setContacts(cs => [c, ...cs]);
      showToast('Contact added');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await deleteContact(id);
      setContacts(cs => cs.filter(c => c.id !== id));
      setSelected(sel => { const s = new Set(sel); s.delete(id); return s; });
      showToast('Contact deleted');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} contacts?`)) return;
    try {
      await Promise.all([...selected].map(id => deleteContact(id)));
      setContacts(cs => cs.filter(c => !selected.has(c.id)));
      setSelected(new Set());
      showToast(`${selected.size} contacts deleted`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleImport = async (rows) => {
    try {
      await importContactsCSV(workspaceId, rows);
      await load();
      showToast(`${rows.length} contacts imported`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleStartChat = async (contact) => {
    try {
      const convId = await startConversationWithContact(workspaceId, contact);
      navigate(`/inbox?conversation=${convId}`);
    } catch (e) { showToast('Could not start conversation', 'error'); }
  };

  const handleExport = () => {
    const rows = [['Name','Phone','Email','Company','Stage','Notes']];
    sorted.forEach(c => rows.push([c.full_name,c.phone,c.email,c.company,c.deal_stage,c.notes].map(v => `"${(v||'').replace(/"/g,'""')}"`)));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'contacts.csv';
    a.click();
    showToast('Contacts exported');
  };

  const toggleSelect = (id) => setSelected(sel => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const allSelected  = sorted.length > 0 && sorted.every(c => selected.has(c.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(sorted.map(c => c.id)));

  /* ── Sort label ── */
  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label || 'Sort';

  return (
    <div className="flex h-screen bg-[var(--nyasa-bg)] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative pt-14 pb-[56px] md:pt-0 md:pb-0">

        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b border-[var(--nyasa-border)] space-y-2 shrink-0">
          {/* Row 1: title + actions */}
          <div className="flex items-center gap-2">
            <h1 className="text-white font-semibold text-lg flex-1">
              Contacts
              {contacts.length > 0 && <span className="ml-2 text-xs text-gray-500 font-normal">{contacts.length}</span>}
            </h1>

            {/* Search toggle */}
            <button onClick={() => setSearchOpen(o => !o)}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <Search className="w-5 h-5" />
            </button>

            {/* Overflow menu — export, import, sync, sort */}
            <div className="relative">
              <button onClick={() => setShowSort(s => !s)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-xl shadow-xl z-30 min-w-[190px] py-1"
                  onClick={e => e.stopPropagation()}>

                  {/* Sort options */}
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sort by</p>
                  {SORT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => { setSort(o.value); setShowSort(false); }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-white/5 flex items-center justify-between ${sort === o.value ? 'text-[#25D366] font-semibold' : 'text-gray-300'}`}>
                      {o.label}
                      {sort === o.value && <Check className="w-3 h-3" />}
                    </button>
                  ))}

                  <div className="my-1 border-t border-[var(--nyasa-border)]" />

                  {/* Export */}
                  {contacts.length > 0 && (
                    <button onClick={() => { handleExport(); setShowSort(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-3">
                      <Download className="w-4 h-4 text-gray-400" /> Export CSV
                    </button>
                  )}

                  {/* Import CSV */}
                  {canManage && (
                    <button onClick={() => { setShowImport(true); setShowSort(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-3">
                      <Upload className="w-4 h-4 text-gray-400" /> Import CSV
                    </button>
                  )}

                  {/* Sync phone contacts */}
                  {canManage && (
                    <button onClick={() => { setShowSyncModal(true); setShowSort(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-3">
                      <Smartphone className="w-4 h-4 text-gray-400" /> Sync phone contacts
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* New contact FAB */}
            {canManage && (
              <button onClick={() => setShowNew(true)}
                className="w-9 h-9 flex items-center justify-center bg-[#25D366] text-white rounded-full hover:bg-[#20BA5A] shrink-0 shadow-md transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className={`${searchOpen ? 'flex' : 'hidden md:flex'} mb-1`}>
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, phone, company…"
                autoFocus={searchOpen}
                className="w-full pl-8 pr-8 py-2 text-sm bg-[var(--nyasa-surface-2)] rounded-xl border border-[var(--nyasa-border)] text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          {/* Stage filter tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {STAGES.map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0
                  ${stageFilter === s ? 'bg-[#25D366]/20 text-[#25D366] font-semibold' : 'text-gray-500 hover:text-gray-300'}`}>
                {s}
                {s !== 'All' && contacts.filter(c => c.deal_stage === s).length > 0 && (
                  <span className="ml-1 text-[9px] opacity-60">
                    {contacts.filter(c => c.deal_stage === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
              <UserCircle2 className="w-12 h-12 text-gray-700" />
              <p className="text-gray-400 font-medium">No contacts found</p>
              <p className="text-gray-600 text-sm">{search ? 'Try a different search' : 'Add your first contact to get started'}</p>
              {!search && canManage && (
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A]">
                    <Plus className="w-4 h-4 inline mr-1" />New Contact
                  </button>
                  <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-white/5 text-gray-300 text-sm font-medium rounded-xl hover:bg-white/10">
                    <Upload className="w-4 h-4 inline mr-1" />Import CSV
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Bulk select bar (desktop) */}
              {canManage && (
                <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-[var(--nyasa-surface-2)] border-b border-[var(--nyasa-border)]">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-[#25D366]" />
                  <span className="text-xs text-gray-500">
                    {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                  </span>
                </div>
              )}

              {/* Mobile: flat list with alpha group headers */}
              <div className="md:hidden divide-y divide-white/5">
                {groupKeys.map(letter => (
                  <div key={letter}>
                    <div className="px-4 py-1.5 bg-[var(--nyasa-surface-2)] sticky top-0 z-10">
                      <span className="text-[11px] font-semibold text-[#25D366]">{letter}</span>
                    </div>
                    {grouped[letter].map(c => (
                      <div key={c.id} onClick={() => setProfile(c)}
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
                            <span className="text-xs text-gray-500 truncate">{c.phone || c.email || c.company || ''}</span>
                            {c.deal_stage && c.deal_stage !== 'New Lead' && (
                              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STAGE_COLORS[c.deal_stage] || 'text-gray-400 bg-white/5'}`}>
                                {c.deal_stage}
                              </span>
                            )}
                          </div>
                        </div>
                        {c.blocked && <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Desktop: table with alpha group rows */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-[var(--nyasa-border)]">
                    {canManage && <th className="px-4 py-3 w-10" />}
                    {['Name','Phone','Email','Company','Stage',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupKeys.map(letter => (
                    <>
                      <tr key={`hdr-${letter}`} className="bg-[var(--nyasa-surface-2)]">
                        {canManage && <td />}
                        <td colSpan={5} className="px-4 py-1">
                          <span className="text-[11px] font-semibold text-[#25D366]">{letter}</span>
                        </td>
                      </tr>
                      {grouped[letter].map(c => (
                        <tr key={c.id} onClick={() => setProfile(c)}
                          className="border-b border-[var(--nyasa-border)] hover:bg-white/5 cursor-pointer transition-colors group">
                          {canManage && (
                            <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="w-4 h-4 rounded accent-[#25D366]" />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.full_name} src={c.avatar_url} size="sm" />
                              <div>
                                <span className="text-sm text-white font-medium">{c.full_name || '—'}</span>
                                {c.blocked && <Ban className="w-3 h-3 text-red-400 inline ml-1.5" />}
                                {(c.tags || []).slice(0,2).map(t => (
                                  <span key={t} className="ml-1.5 text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full">{t}</span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {c.phone ? <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="text-sm text-gray-300 hover:text-[#25D366]">{c.phone}</a> : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {c.email ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="text-sm text-gray-300 hover:text-[#25D366] truncate max-w-[180px] block">{c.email}</a> : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">{c.company || '—'}</td>
                          <td className="px-4 py-3">
                            {c.deal_stage && (
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[c.deal_stage] || 'text-gray-400 bg-white/5'}`}>
                                {c.deal_stage}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 w-20 text-right">
                            {canManage && (
                              <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-1 transition-opacity">
                                <button onClick={e => { e.stopPropagation(); handleStartChat(c); }}
                                  className="p-1.5 text-gray-500 hover:text-[#25D366] transition-colors" title="Message">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                                  className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="absolute bottom-0 left-0 right-0 md:left-[72px] flex items-center justify-between px-4 py-3 bg-[var(--nyasa-surface-2)] border-t border-[var(--nyasa-border)] shadow-xl z-20">
            <span className="text-sm text-white font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 rounded-lg">Cancel</button>
              <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg border border-red-500/30">
                <Trash2 className="w-3.5 h-3.5" />Delete {selected.size}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals / Drawers */}
      {profileContact && (
        <ContactProfile
          contact={profileContact}
          workspaceId={workspaceId}
          onClose={() => setProfile(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onStartChat={handleStartChat}
        />
      )}
      {showNew    && <NewContactModal onClose={() => setShowNew(false)}    onSave={handleCreate} />}
      {showImport && <CSVImportModal  onClose={() => setShowImport(false)} onImport={handleImport} />}

      {/* Phone Contact Sync modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
             onClick={() => setShowSyncModal(false)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-sm font-semibold text-white">Sync phone contacts</p>
              <button onClick={() => setShowSyncModal(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <PhoneContactSync onSynced={() => { load(); setShowSyncModal(false); }} />
          </div>
        </div>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
