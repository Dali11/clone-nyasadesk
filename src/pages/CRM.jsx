import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Trash2, X, Loader2, ChevronDown, Upload, Download,
  Ban, MessageSquare, Check, AlertCircle, Tag, Building2,
  KanbanSquare, List, TrendingUp, Users, Trophy, Clock,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import ChannelBadge from '@/components/ChannelBadge';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import {
  getContacts, createContact, updateContact, deleteContact,
  getConversations, importContactsCSV, blockContact,
  startConversationWithContact,
} from '@/lib/channels';
import { useNavigate } from 'react-router-dom';

/* ── CRM constants ──────────────────────────────────────────────────── */
const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];
const STAGE_ACCENTS = {
  'New Lead': '#8b93a5',
  'Contacted': '#60a5fa',
  'Qualified': '#a78bfa',
  'Proposal Sent': '#fbbf24',
  'Negotiation': '#fb923c',
  'Closed Won': '#34d399',
  'Closed Lost': '#f87171',
};
const LABEL_COLORS = ['#25D366', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const SEGMENTS = [
  { key: 'all', label: 'All contacts' },
  { key: 'hot', label: 'Hot deals' },
  { key: 'due', label: 'Follow-ups due' },
  { key: 'new', label: 'New this week' },
  { key: 'vip', label: 'VIP' },
  { key: 'untagged', label: 'Untagged' },
];

const inp = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';
const fmtK = (v) => v == null || isNaN(v) ? '—' : 'K' + Number(v).toLocaleString();
const daysAgo = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

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

/* ── KPI strip ─────────────────────────────────────────────────────── */
function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-2xl bg-[var(--nyasa-surface-2)] border border-white/5 px-3 md:px-4 py-3 flex items-center gap-2.5 md:gap-3 w-full md:w-auto md:min-w-[170px]">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + '1f', color: accent }}>
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold">{label}</p>
        <p className="text-white font-semibold leading-tight truncate">{value}</p>
        {sub ? <p className="text-[11px] text-[#8696A0] truncate">{sub}</p> : null}
      </div>
    </div>
  );
}

/* ── Pipeline card ──────────────────────────────────────────────────── */
function ContactCard({ c, onOpen, onDragStart, onDragEnd, dragging }) {
  const due = c.next_followup && new Date(c.next_followup) < new Date() && !['Closed Won', 'Closed Lost'].includes(c.deal_stage);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(c)}
      className={`group rounded-xl bg-[var(--nyasa-surface-4)] border border-white/5 hover:border-[#25D366]/40 p-3 cursor-pointer transition
        ${dragging ? 'opacity-40' : 'opacity-100'}`}
    >
      <div className="flex items-center gap-2">
        <Avatar name={c.full_name || '?'} size="sm" src={c.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-medium truncate leading-tight">{c.full_name || 'Unnamed'}</p>
          <p className="text-[11px] text-[#8696A0] truncate leading-tight">{c.company || c.phone || c.email || '—'}</p>
        </div>
        {c.deal_value != null && (
          <span className="text-xs font-semibold text-[#a3e635] shrink-0">{fmtK(c.deal_value)}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <ChannelBadge channel={c.channel || 'whatsapp'} dot />
        {(c.tags || []).slice(0, 2).map((t, i) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: LABEL_COLORS[i % LABEL_COLORS.length] + '2a', color: LABEL_COLORS[i % LABEL_COLORS.length] }}>{t}</span>
        ))}
        {due && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 ml-auto">due</span>}
      </div>
    </div>
  );
}

/* ── CSV import modal ───────────────────────────────────────────────── */
function CSVImportModal({ onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);

  const parse = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1, 6).map(l => {
        const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
        const obj = {};
        headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
        return obj;
      });
      setPreview(rows);
    };
    reader.readAsText(f);
    setFile(f);
  };

  const run = () => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = String(e.target.result);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) { setLoading(false); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const contacts = lines.slice(1).map(l => {
        const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
        const obj = {};
        headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
        return {
          full_name: obj.name || obj.full_name || obj['full name'] || '',
          phone: obj.phone || obj['phone number'] || '',
          email: obj.email || '',
          company: obj.company || obj.organization || '',
          deal_stage: obj.stage || obj['deal stage'] || 'New Lead',
        };
      }).filter(c => c.full_name || c.phone || c.email);
      try {
        await onImport(contacts);
        setLoading(false);
        onClose();
      } catch (err) { setLoading(false); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Import contacts (CSV)</h3>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-[#25D366]/40 transition">
          <Upload className="w-8 h-8 text-[#8696A0] mx-auto mb-2" />
          <p className="text-sm text-white">{file ? file.name : 'Choose a CSV file'}</p>
          <p className="text-xs text-[#8696A0] mt-1">Columns: name, phone, email, company, stage</p>
          <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files[0] && parse(e.target.files[0])} />
        </label>
        {preview.length > 0 && (
          <div className="mt-3 text-xs text-[#8696A0]">
            First row: <span className="text-white">{preview[0].name || preview[0].full_name || '—'}</span> · {preview.length === 5 ? '5+ rows detected' : `${preview.length} row(s)`}
          </div>
        )}
        <button onClick={run} disabled={!file || loading}
          className="mt-4 w-full bg-[#25D366] text-[#0B141A] font-semibold rounded-xl py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Import
        </button>
      </div>
    </div>
  );
}

/* ── New contact modal ──────────────────────────────────────────────── */
function NewContactModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', company: '', deal_stage: 'New Lead', deal_value: '' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">New contact</h3>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input className={inp} placeholder="Full name *" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inp} placeholder="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} />
            <input className={inp} placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <input className={inp} placeholder="Company" value={form.company} onChange={e => set('company', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className={inp} value={form.deal_stage} onChange={e => set('deal_stage', e.target.value)}>
              {PIPELINE_STAGES.map(s => <option key={s} value={s} className="bg-[#111b21]">{s}</option>)}
            </select>
            <input className={inp} placeholder="Deal value (K)" inputMode="numeric" value={form.deal_value} onChange={e => set('deal_value', e.target.value)} />
          </div>
        </div>
        <button
          onClick={async () => {
            if (!form.full_name.trim()) return;
            setLoading(true);
            try {
              await onCreate({
                ...form,
                deal_value: form.deal_value ? Number(String(form.deal_value).replace(/[^0-9.]/g, '')) : null,
              });
              onClose();
            } catch (e) { /* parent toast on next load */ }
            finally { setLoading(false); }
          }}
          disabled={!form.full_name.trim() || loading}
          className="mt-4 w-full bg-[#25D366] text-[#0B141A] font-semibold rounded-xl py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add contact
        </button>
      </div>
    </div>
  );
}

/* ── Contact 360 drawer ─────────────────────────────────────────────── */
function Contact360({ contact, conversations, onClose, onSave, onDelete, onBlock, onMessage, canManage }) {
  const [draft, setDraft] = useState(contact);
  const [saving, setSaving] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  useEffect(() => setDraft(contact), [contact]);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(contact);

  const save = async () => {
    setSaving(true);
    try { await onSave({ ...draft }); }
    finally { setSaving(false); }
  };

  const addLabel = () => {
    const t = labelInput.trim();
    if (!t) return;
    if (!(draft.tags || []).includes(t)) set('tags', [...(draft.tags || []), t]);
    setLabelInput('');
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/50" onClick={onClose}>
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-[var(--nyasa-surface-2)] border-l border-white/10 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--nyasa-surface-2)] z-10 px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <Avatar name={draft.full_name || '?'} size="lg" src={draft.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{draft.full_name || 'Unnamed'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <ChannelBadge channel={draft.channel || 'whatsapp'} dot />
              {draft.lead_source && <span className="text-[11px] text-[#8696A0] truncate">via {draft.lead_source}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* deal panel */}
          <div className="rounded-2xl bg-[var(--nyasa-surface-4)] border border-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold mb-3">Deal</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {PIPELINE_STAGES.map(s => (
                <button key={s}
                  onClick={() => set('deal_stage', s)}
                  className="text-xs rounded-lg px-2 py-1.5 transition"
                  style={{
                    background: draft.deal_stage === s ? STAGE_ACCENTS[s] : 'rgba(255,255,255,0.04)',
                    color: draft.deal_stage === s ? '#0B141A' : '#8696A0',
                  }}>
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold">Value</label>
                <input className={inp + ' mt-1'} inputMode="numeric" placeholder="K"
                  value={draft.deal_value ?? ''}
                  onChange={e => set('deal_value', e.target.value ? Number(String(e.target.value).replace(/[^0-9.]/g, '')) : null)} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold">Follow-up</label>
                <input type="date" className={inp + ' mt-1 [color-scheme:dark]'}
                  value={draft.next_followup ? String(draft.next_followup).slice(0, 10) : ''}
                  onChange={e => set('next_followup', e.target.value || null)} />
              </div>
            </div>
          </div>

          {/* details */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold">Details</p>
            <input className={inp} placeholder="Full name" value={draft.full_name || ''} onChange={e => set('full_name', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inp} placeholder="Phone" value={draft.phone || ''} onChange={e => set('phone', e.target.value)} />
              <input className={inp} placeholder="Email" value={draft.email || ''} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className={inp} placeholder="Company" value={draft.company || ''} onChange={e => set('company', e.target.value)} />
              <input className={inp} placeholder="Territory / city" value={draft.territory || ''} onChange={e => set('territory', e.target.value)} />
            </div>
          </div>

          {/* tags */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(draft.tags || []).map((t, i) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                  style={{ background: LABEL_COLORS[i % LABEL_COLORS.length] + '2a', color: LABEL_COLORS[i % LABEL_COLORS.length] }}>
                  {t}
                  <button onClick={() => set('tags', (draft.tags || []).filter(x => x !== t))}><X className="w-3 h-3" /></button>
                </span>
              ))}
              {!(draft.tags || []).length && <span className="text-xs text-[#8696A0]">No tags yet</span>}
            </div>
            <div className="flex gap-2">
              <input className={inp} placeholder="Add a tag…" value={labelInput} onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLabel())} />
              <button onClick={addLabel} className="px-3 rounded-xl bg-white/5 text-white hover:bg-white/10"><Tag className="w-4 h-4" /></button>
            </div>
          </div>

          {/* notes */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold mb-2">Notes</p>
            <textarea className={inp + ' min-h-[90px] resize-y'} placeholder="Anything worth remembering…" value={draft.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>

          {/* activity: conversations */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold mb-2">
              Conversations ({conversations.length})
            </p>
            {conversations.length === 0 && <p className="text-xs text-[#8696A0]">No conversations linked yet.</p>}
            <div className="space-y-1.5">
              {conversations.slice(0, 5).map(cv => (
                <button key={cv.id} onClick={() => onMessage(cv.id)}
                  className="w-full text-left rounded-xl bg-[var(--nyasa-surface-4)] border border-white/5 hover:border-[#25D366]/40 px-3 py-2 transition">
                  <div className="flex items-center gap-2">
                    <ChannelBadge channel={cv.channel || 'whatsapp'} dot />
                    <span className="text-xs text-white truncate flex-1">{cv.subject || (cv.last_message || '').slice(0, 40) || 'Chat'}</span>
                    <span className="text-[10px] text-[#8696A0] shrink-0">
                      {cv.last_message_at ? new Date(cv.last_message_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button onClick={() => onMessage(draft)}
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-[#0B141A] rounded-xl py-2.5 text-sm font-semibold">
                <MessageSquare className="w-4 h-4" /> Message
              </button>
              <button onClick={() => onBlock(draft)} disabled={!draft.phone}
                className="px-3 py-2.5 rounded-xl bg-white/5 text-[#8696A0] hover:text-white disabled:opacity-30" title="Block / unblock">
                <Ban className="w-4 h-4" />
              </button>
              <button onClick={() => {
              const n = conversations.length;
              const msg = n > 0
                ? `Delete this contact?\n\nThey have ${n} conversation${n > 1 ? 's' : ''} in the inbox — deleting will permanently remove the contact AND all their chat history and messages. This cannot be undone.`
                : 'Delete this contact? This cannot be undone.';
              if (confirm(msg)) onDelete(draft.id);
            }}
                className="px-3 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {dirty && (
            <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-[var(--nyasa-surface-2)] border-t border-white/5 flex gap-2">
              <button onClick={save} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-[#0B141A] rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save changes
              </button>
              <button onClick={() => setDraft(contact)} className="px-4 rounded-xl bg-white/5 text-[#8696A0] hover:text-white text-sm">Undo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main CRM page ──────────────────────────────────────────────────── */
export default function CRM() {
  document.title = 'CRM · Nyasadesk';
  const { user, profile, isWorkspaceAdmin } = useNyasaAuth();
  const canManage = isWorkspaceAdmin || profile?.role === 'sales_manager';
  const workspaceId = profile?.workspace_id || user?.id;
  const navigate = useNavigate();

  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('pipeline');
  const [segment, setSegment] = useState('all');
  const [sort, setSort] = useState('value_desc');
  const [showSort, setShowSort] = useState(false);
  const [openContact, setOpenContact] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const [cs, convs] = await Promise.all([
        getContacts(workspaceId).catch(() => []),
        getConversations(workspaceId).catch(() => []),
      ]);
      setContacts(cs);
      setConversations(convs);
    } catch (e) { console.error('[CRM] load:', e); }
    finally { setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { load(); }, [load]);

  /* ── derived data ── */
  const openPipeline = contacts.filter(c => c.deal_stage && c.deal_stage !== 'Closed Won' && c.deal_stage !== 'Closed Lost');
  const pipelineValue = openPipeline.reduce((s, c) => s + (Number(c.deal_value) || 0), 0);
  const won = contacts.filter(c => c.deal_stage === 'Closed Won').length;
  const lost = contacts.filter(c => c.deal_stage === 'Closed Lost').length;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) + '%' : '—';
  const dueCount = contacts.filter(c => c.next_followup && new Date(c.next_followup) < new Date() && c.deal_stage !== 'Closed Won' && c.deal_stage !== 'Closed Lost').length;

  const matchesSegment = (c, key) => {
    switch (key) {
      case 'hot': return ['Proposal Sent', 'Negotiation'].includes(c.deal_stage);
      case 'due': return c.next_followup && new Date(c.next_followup) < new Date() && !['Closed Won', 'Closed Lost'].includes(c.deal_stage);
      case 'new': { const d = daysAgo(c.created_at); return d !== null && d <= 7; }
      case 'vip': return (c.tags || []).some(t => String(t).toLowerCase() === 'vip');
      case 'untagged': return !(c.tags || []).length;
      default: return true;
    }
  };
  const filtered = contacts.filter(c => {
    if (!matchesSegment(c, segment)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.full_name || '').toLowerCase().includes(q)
      || (c.company || '').toLowerCase().includes(q)
      || (c.phone || '').includes(q)
      || (c.email || '').toLowerCase().includes(q)
      || (c.tags || []).some(t => String(t).toLowerCase().includes(q));
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'value_desc') return (Number(b.deal_value) || 0) - (Number(a.deal_value) || 0);
    if (sort === 'value_asc') return (Number(a.deal_value) || 0) - (Number(b.deal_value) || 0);
    if (sort === 'name_asc') return (a.full_name || '').localeCompare(b.full_name || '');
    if (sort === 'name_desc') return (b.full_name || '').localeCompare(a.full_name || '');
    if (sort === 'due') return (a.next_followup || '9999').localeCompare(b.next_followup || '9999');
    return new Date(b.created_at) - new Date(a.created_at);
  });

  /* ── actions ── */
  const patchLocal = (id, updates) =>
    setContacts(cs => cs.map(c => (c.id === id ? { ...c, ...updates } : c)));

  const handleSave = async (data) => {
    try {
      const { id, ...updates } = data;
      const updated = await updateContact(id, updates);
      patchLocal(id, updated || updates);
      setOpenContact(oc => (oc && oc.id === id ? { ...oc, ...updated, ...updates } : oc));
      showToast('Saved');
    } catch (e) { showToast(e.message || 'Save failed', 'error'); }
  };

  const moveStage = async (contactId, stage) => {
    const c = contacts.find(x => x.id === contactId);
    if (!c || c.deal_stage === stage) return;
    patchLocal(contactId, { deal_stage: stage });
    try { await updateContact(contactId, { deal_stage: stage }); }
    catch (e) {
      patchLocal(contactId, { deal_stage: c.deal_stage });
      showToast('Could not move deal', 'error');
    }
  };

  const handleCreate = async (data) => {
    try {
      const c = await createContact(workspaceId, data);
      setContacts(cs => [c, ...cs]);
      showToast('Contact added');
    } catch (e) { showToast(e.message || 'Could not add contact', 'error'); }
  };

  const handleImport = async (rows) => {
    try {
      await importContactsCSV(workspaceId, rows);
      await load();
      showToast(`${rows.length} contacts imported`);
    } catch (e) { showToast(e.message || 'Import failed', 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteContact(id);
      setContacts(cs => cs.filter(c => c.id !== id));
      setOpenContact(null);
      showToast('Contact deleted');
    } catch (e) { showToast(e.message || 'Delete failed', 'error'); }
  };

  const handleBlock = async (c) => {
    try {
      await blockContact(c.id, !c.blocked);
      patchLocal(c.id, { blocked: !c.blocked });
      showToast(c.blocked ? 'Contact unblocked' : 'Contact blocked');
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  const handleMessage = async (c) => {
    try {
      const convId = typeof c === 'string' ? c : await startConversationWithContact(workspaceId, c);
      navigate('/?c=' + convId);
    } catch (e) { showToast(e.message || 'Could not open chat', 'error'); }
  };

  const exportCsv = () => {
    const rows = [['Name', 'Phone', 'Email', 'Company', 'Stage', 'Value', 'Follow-up', 'Tags']];
    sorted.forEach(c => rows.push([
      c.full_name, c.phone, c.email, c.company, c.deal_stage || '',
      c.deal_value ?? '', c.next_followup ? String(c.next_followup).slice(0, 10) : '',
      (c.tags || []).join(' | '),
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `nyasadesk-crm-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const contactConversations = (c) =>
    conversations.filter(cv => cv.contact_id === c.id
      || (c.phone && cv.contact_phone === c.phone))
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

  const SORTS = [
    { value: 'value_desc', label: 'Value high→low' },
    { value: 'value_asc', label: 'Value low→high' },
    { value: 'name_asc', label: 'Name A→Z' },
    { value: 'name_desc', label: 'Name Z→A' },
    { value: 'due', label: 'Follow-up soonest' },
    { value: 'newest', label: 'Newest first' },
  ];
  const sortLabel = SORTS.find(s => s.value === sort)?.label || 'Sort';

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B141A] pt-14 pb-[56px] md:pt-0 md:pb-0">
      <Sidebar active="/contacts" />
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto md:overflow-hidden">
        {/* header */}
        <div className="px-4 pt-4 pb-3 md:px-6 md:pt-5 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                CRM
                <span className="text-[11px] font-medium text-[#8696A0] bg-white/5 rounded-full px-2 py-0.5">{contacts.length} contacts</span>
              </h1>
              <p className="text-xs text-[#8696A0] mt-0.5">Pipeline, deals and every conversation in one place.</p>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className={inp + ' pl-9 w-full'}
                placeholder="Search name, company, tag…"
                value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="p-2.5 rounded-xl bg-white/5 text-[#8696A0] hover:text-white" title="Export CSV"><Download className="w-4 h-4" /></button>
              {canManage && <>
                <button onClick={() => setShowImport(true)} className="p-2.5 rounded-xl bg-white/5 text-[#8696A0] hover:text-white" title="Import CSV"><Upload className="w-4 h-4" /></button>
                <button onClick={() => setShowNew(true)}
                  className="flex items-center gap-2 bg-[#25D366] text-[#0B141A] font-semibold rounded-xl px-4 py-2.5 text-sm hover:brightness-110">
                  <Plus className="w-4 h-4" /> New contact
                </button>
              </>}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:flex gap-2 md:gap-3 mt-4 md:overflow-x-auto pb-1">
            <Kpi icon={TrendingUp} label="Open pipeline" value={fmtK(pipelineValue)} sub={`${openPipeline.length} active deals`} accent="#6366f1" />
            <Kpi icon={Users} label="Contacts" value={contacts.length.toLocaleString()} sub={`${filtered.length} in view`} accent="#60a5fa" />
            <Kpi icon={Trophy} label="Win rate" value={winRate} sub={`${won} won · ${lost} lost`} accent="#a3e635" />
            <Kpi icon={Clock} label="Follow-ups due" value={dueCount} sub={dueCount ? 'Needs attention' : 'All clear'} accent="#fbbf24" />
          </div>

          {/* segments + view switch + sort */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 mt-3">
            <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto -mx-4 px-4 md:mx-0 md:px-0 md:shrink">
              {SEGMENTS.map(s => (
                <button key={s.key} onClick={() => setSegment(s.key)}
                  className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-full transition ${segment === s.key ? 'bg-[#25D366] text-[#0B141A] font-semibold' : 'bg-white/5 text-[#8696A0] hover:text-white'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="hidden md:block flex-1" />
            <div className="flex bg-white/5 rounded-xl p-0.5">
              <button onClick={() => setView('pipeline')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition ${view === 'pipeline' ? 'bg-[#25D366] text-[#0B141A] font-semibold' : 'text-[#8696A0]'}`}>
                <KanbanSquare className="w-3.5 h-3.5" /> Pipeline
              </button>
              <button onClick={() => setView('list')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition ${view === 'list' ? 'bg-[#25D366] text-[#0B141A] font-semibold' : 'text-[#8696A0]'}`}>
                <List className="w-3.5 h-3.5" /> List
              </button>
            </div>
            {view === 'list' && (
              <div className="relative">
                <button onClick={() => setShowSort(v => !v)} className="flex items-center gap-1.5 text-xs bg-white/5 text-[#8696A0] hover:text-white px-3 py-2 rounded-xl">
                  {sortLabel} <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showSort && (
                  <div className="absolute right-0 top-full mt-1 bg-[var(--nyasa-surface-4)] border border-white/10 rounded-xl py-1 z-50 min-w-[170px]">
                    {SORTS.map(s => (
                      <button key={s.value} onClick={() => { setSort(s.value); setShowSort(false); }}
                        className={`w-full text-left text-xs px-3 py-2 hover:bg-white/5 ${sort === s.value ? 'text-[#25D366]' : 'text-[#8696A0]'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* body */}
        <div className="flex-1 px-4 md:px-6 pb-6 md:overflow-auto min-h-[55vh] md:min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#25D366] animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <Building2 className="w-12 h-12 text-white/10" />
              <p className="text-white font-medium">Your CRM starts with your first contact</p>
              <p className="text-xs text-[#8696A0] max-w-xs">Every chat that comes in creates a contact automatically. Import a list or add one by hand.</p>
              {canManage && <button onClick={() => setShowNew(true)} className="mt-1 flex items-center gap-2 bg-[#25D366] text-[#0B141A] font-semibold rounded-xl px-4 py-2.5 text-sm">
                <Plus className="w-4 h-4" /> New contact
              </button>}
            </div>
          ) : view === 'pipeline' ? (
            <div className="flex gap-3 h-full min-h-[300px] overflow-x-auto pb-2">
              {PIPELINE_STAGES.map(stage => {
                const col = sorted.filter(c => (c.deal_stage || 'New Lead') === stage);
                const colValue = col.reduce((s, c) => s + (Number(c.deal_value) || 0), 0);
                return (
                  <div
                    key={stage}
                    onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
                    onDragLeave={() => setDragOverStage(s => (s === stage ? null : s))}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverStage(null);
                      // DataTransfer payload is authoritative; dragId state is the
                      // fallback (covers fast drags before React re-renders)
                      let id = null;
                      try { id = e.dataTransfer.getData('text/plain'); } catch {}
                      const target = (id && contacts.some(c => c.id === id)) ? id : dragId;
                      if (target) moveStage(target, stage);
                      setDragId(null);
                    }}
                    className={`w-[240px] md:w-[260px] shrink-0 rounded-2xl border transition flex flex-col
                      ${dragOverStage === stage ? 'border-[#25D366]/60 bg-[#25D366]/5' : 'border-white/5 bg-[var(--nyasa-surface-2)]'}`}
                  >
                    <div className="px-3 py-2.5 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_ACCENTS[stage] }} />
                        <p className="text-xs font-semibold text-white truncate flex-1">{stage}</p>
                        <span className="text-[10px] text-[#8696A0]">{col.length}</span>
                      </div>
                      {colValue > 0 && <p className="text-[10px] text-[#a3e635] mt-0.5 font-medium">{fmtK(colValue)}</p>}
                    </div>
                    <div className="p-2 space-y-2 overflow-y-auto flex-1">
                      {col.length === 0 && (
                        <div className="text-center text-[11px] text-[#8696A0] py-6 border border-dashed border-white/5 rounded-xl">
                          Drag deals here
                        </div>
                      )}
                      {col.map(c => (
                        <ContactCard
                          key={c.id}
                          c={c}
                          dragging={dragId === c.id}
                          onOpen={setOpenContact}
                          onDragStart={(e, contact) => { setDragId(contact.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', contact.id); } catch {} }}
                          onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden">
              <div className="grid grid-cols-[1.7fr_1fr_1fr] md:grid-cols-[2fr_1.2fr_0.8fr_1fr_0.9fr_0.9fr] gap-2 px-3 md:px-4 py-2.5 bg-[var(--nyasa-surface-2)] text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold">
                <span>Contact</span><span className="hidden md:block">Company</span><span>Stage</span><span>Value</span><span className="hidden md:block">Follow-up</span><span className="hidden md:block text-right">Updated</span>
              </div>
              {sorted.length === 0 && <p className="text-sm text-[#8696A0] text-center py-10">No contacts match this view.</p>}
              {sorted.map(c => {
                const due = c.next_followup && new Date(c.next_followup) < new Date() && !['Closed Won', 'Closed Lost'].includes(c.deal_stage);
                return (
                  <button key={c.id} onClick={() => setOpenContact(c)}
                    className="w-full grid grid-cols-[1.7fr_1fr_1fr] md:grid-cols-[2fr_1.2fr_0.8fr_1fr_0.9fr_0.9fr] gap-2 items-center px-3 md:px-4 py-2.5 text-left border-t border-white/5 hover:bg-white/[0.03] transition">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={c.full_name || '?'} size="sm" src={c.avatar_url} />
                      <span className="min-w-0">
                        <span className="block text-sm text-white truncate">{c.full_name || 'Unnamed'}</span>
                        <span className="block text-[11px] text-[#8696A0] truncate">{c.phone || c.email || ''}</span>
                      </span>
                    </span>
                    <span className="hidden md:block text-xs text-[#8696A0] truncate">{c.company || '—'}</span>
                    <span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-block"
                        style={{ background: STAGE_ACCENTS[c.deal_stage || 'New Lead'] + '22', color: STAGE_ACCENTS[c.deal_stage || 'New Lead'] }}>
                        {c.deal_stage || 'New Lead'}
                      </span>
                    </span>
                    <span className={`text-xs font-semibold ${c.deal_value != null ? 'text-[#a3e635]' : 'text-[#8696A0]'}`}>{fmtK(c.deal_value)}</span>
                    <span className={`hidden md:block text-xs ${due ? 'text-amber-300' : 'text-[#8696A0]'}`}>
                      {c.next_followup ? new Date(c.next_followup).toLocaleDateString() : '—'}
                    </span>
                    <span className="hidden md:block text-[11px] text-[#8696A0] text-right">{daysAgo(c.updated_at) === 0 ? 'today' : `${daysAgo(c.updated_at)}d ago`}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* overlays */}
      {openContact && (
        <Contact360
          contact={contacts.find(c => c.id === openContact.id) || openContact}
          conversations={contactConversations(openContact)}
          onClose={() => setOpenContact(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onBlock={handleBlock}
          onMessage={handleMessage}
          canManage={canManage}
        />
      )}
      {showNew && <NewContactModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
