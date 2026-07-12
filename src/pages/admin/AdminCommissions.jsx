import {useState, useEffect, useCallback}from 'react';
import AdminLayout from './AdminLayout';
import {useNyasaAuth}from '@/lib/NyasaAuth';
import {supabase}from '@/lib/supabase';
import {useToast}from '@/components/ui/use-toast';
import {
  BadgeDollarSign,
  Plus,
  Edit2,
  Archive,
  Copy,
  Check,
  X,
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  Eye,
  AlertCircle,
}from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  pending:            'bg-yellow-500/15 text-yellow-400',
  awaiting_approval:  'bg-orange-500/15 text-orange-400',
  approved:           'bg-green-500/15 text-green-400',
  paid:               'bg-emerald-500/15 text-emerald-400',
  rejected:           'bg-red-500/15 text-red-400',
  cancelled:          'bg-gray-500/15 text-gray-400',
  reversed:           'bg-purple-500/15 text-purple-400',
};
const STATUS_LABELS = {
  pending:'Pending', awaiting_approval:'Awaiting Approval',
  approved:'Approved', paid:'Paid', rejected:'Rejected',
  cancelled:'Cancelled', reversed:'Reversed',
};
const METHOD_LABELS = { fixed:'Fixed', percentage:'Percentage', tiered:'Tiered', formula:'Formula' };
const TRIGGER_LABELS = { deal_won:'Deal Won', invoice_paid:'Invoice Paid', payment_received:'Payment Received', manual:'Manual' };

function fmtMoney(n) { return `MK${Number(n||0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'; }

async function apiFetch(path, { method = 'GET', body, session } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

// ── StatTile ──────────────────────────────────────────────────────────────
function StatTile({ label, value, icon: Icon, color = '#6366F1' }) {
  return (
    <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '22' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-[var(--nyasa-text-muted)]">{label}</p>
        <p className="text-lg font-bold text-[var(--nyasa-text)]">{value}</p>
      </div>
    </div>
  );
}

// ── BreakdownModal ────────────────────────────────────────────────────────
function BreakdownModal({ commission, onClose }) {
  if (!commission) return null;
  const bd = commission.calc_breakdown || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[var(--nyasa-surface-1)] border border-[var(--nyasa-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl z-10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--nyasa-text)]">Calculation Breakdown</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Agent</span><span className="text-[var(--nyasa-text)] font-medium">{commission.agent_name}</span></div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Customer</span><span className="text-[var(--nyasa-text)]">{commission.contact_name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Sale Amount</span><span className="text-[var(--nyasa-text)] font-medium">{fmtMoney(commission.sale_amount)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Trigger</span><span className="text-[var(--nyasa-text)]">{TRIGGER_LABELS[commission.trigger_event] || commission.trigger_event}</span></div>
          <hr className="border-[var(--nyasa-border)]" />
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Method</span><span className="font-semibold" style={{ color:'#6366F1' }}>{METHOD_LABELS[bd.method] || bd.method}</span></div>
          {bd.formula && <div className="rounded-lg bg-[var(--nyasa-surface-3)] p-3 text-[var(--nyasa-text-muted)] font-mono text-xs">{bd.formula}</div>}
          {bd.method === 'tiered' && bd.tiersEvaluated && (
            <div className="rounded-lg border border-[var(--nyasa-border)] overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-[var(--nyasa-surface-3)]"><th className="p-2 text-left text-[var(--nyasa-text-muted)]">Min</th><th className="p-2 text-left text-[var(--nyasa-text-muted)]">Max</th><th className="p-2 text-left text-[var(--nyasa-text-muted)]">Rate</th><th className="p-2 text-center text-[var(--nyasa-text-muted)]">Hit</th></tr></thead>
                <tbody>
                  {bd.tiersEvaluated.map((t, i) => (
                    <tr key={i} className={t.matched ? 'bg-green-500/10' : ''}>
                      <td className="p-2 text-[var(--nyasa-text)]">{t.min}</td>
                      <td className="p-2 text-[var(--nyasa-text)]">{t.max}</td>
                      <td className="p-2 text-[var(--nyasa-text)]">{t.type === 'fixed' ? fmtMoney(t.value) : `${t.value}%`}</td>
                      <td className="p-2 text-center">{t.matched && <Check className="w-3 h-3 text-green-400 mx-auto" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <hr className="border-[var(--nyasa-border)]" />
          <div className="flex justify-between items-center">
            <span className="text-[var(--nyasa-text-muted)]">Commission Earned</span>
            <span className="text-xl font-bold text-[#25D366]">{fmtMoney(commission.commission_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--nyasa-text-muted)]">Status</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[commission.status]}`}>{STATUS_LABELS[commission.status]}</span>
          </div>
          {commission.notes && <p className="text-xs text-[var(--nyasa-text-muted)] italic">{commission.notes}</p>}
        </div>
      </div>
    </div>
  );
}

// ── PolicyModal ───────────────────────────────────────────────────────────
function PolicyModal({ policy, teamUsers, workspaceOwnerId, onSave, onClose }) {
  const [form, setForm] = useState({
    name: policy?.name || '',
    description: policy?.description || '',
    status: policy?.status || 'active',
    effective_date: policy?.effective_date || new Date().toISOString().split('T')[0],
    expiry_date: policy?.expiry_date || '',
    applies_to: policy?.applies_to || 'workspace',
    applies_to_id: policy?.applies_to_id || '',
    calc_method: policy?.calc_method || 'fixed',
    calc_value: policy?.calc_value ?? '',
    tiers: policy?.tiers || [{ min: 0, max: '', type: 'fixed', value: '' }],
    trigger_event: policy?.trigger_event || 'deal_won',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { toast } = useToast();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setTier = (i, k, v) => setForm(f => {
    const t = [...f.tiers]; t[i] = { ...t[i], [k]: v }; return { ...f, tiers: t };
  });
  const addTier = () => setForm(f => ({ ...f, tiers: [...f.tiers, { min: '', max: '', type: 'fixed', value: '' }] }));
  const removeTier = i => setForm(f => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name.trim()) { setErr('Policy name is required'); return; }
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = { ...form, id: policy?.id };
      if (form.calc_method !== 'tiered') payload.tiers = null;
      if (form.calc_method !== 'fixed' && form.calc_method !== 'percentage') payload.calc_value = null;
      if (form.applies_to !== 'individual') payload.applies_to_id = null;
      await apiFetch('/api/billing', { method: 'POST', body: { action: 'save-policy', ...payload }, session });
      toast({ title: policy?.id ? 'Policy updated' : 'Policy created', variant: 'default' });
      onSave();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const inp = "w-full bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl px-3 py-2 text-sm text-[var(--nyasa-text)] focus:outline-none focus:border-[#6366F1]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[var(--nyasa-surface-1)] border border-[var(--nyasa-border)] rounded-2xl p-6 w-full max-w-xl shadow-2xl z-10 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg text-[var(--nyasa-text)]">{policy?.id ? 'Edit Policy' : 'New Commission Policy'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Policy Name *</label>
              <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Brandfletch Ads Commission" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Description</label>
              <textarea className={inp} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
            </div>
            <div>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Status</label>
              <select className={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Trigger Event</label>
              <select className={inp} value={form.trigger_event} onChange={e => set('trigger_event', e.target.value)}>
                <option value="deal_won">Deal Won</option>
                <option value="invoice_paid">Invoice Paid</option>
                <option value="payment_received">Payment Received</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Effective Date</label>
              <input type="date" className={inp} value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Expiry Date (optional)</label>
              <input type="date" className={inp} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Applies To</label>
              <select className={inp} value={form.applies_to} onChange={e => set('applies_to', e.target.value)}>
                <option value="workspace">Entire Workspace</option>
                <option value="individual">Individual Agent</option>
              </select>
            </div>
            {form.applies_to === 'individual' && (
              <div>
                <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Select Agent</label>
                <select className={inp} value={form.applies_to_id} onChange={e => set('applies_to_id', e.target.value)}>
                  <option value="">— choose agent —</option>
                  {teamUsers.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select>
              </div>
            )}
            <div className={form.applies_to === 'individual' ? '' : 'col-span-2'}>
              <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Calculation Method</label>
              <select className={inp} value={form.calc_method} onChange={e => set('calc_method', e.target.value)}>
                <option value="fixed">Fixed Amount</option>
                <option value="percentage">Percentage</option>
                <option value="tiered">Tiered Rules</option>
              </select>
            </div>
            {form.calc_method === 'fixed' && (
              <div className="col-span-2">
                <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Fixed Amount (MK)</label>
                <input type="number" className={inp} value={form.calc_value} onChange={e => set('calc_value', e.target.value)} placeholder="e.g. 500" />
              </div>
            )}
            {form.calc_method === 'percentage' && (
              <div className="col-span-2">
                <label className="text-xs text-[var(--nyasa-text-muted)] mb-1 block">Commission Rate (%)</label>
                <input type="number" className={inp} value={form.calc_value} onChange={e => set('calc_value', e.target.value)} placeholder="e.g. 10" />
              </div>
            )}
            {form.calc_method === 'tiered' && (
              <div className="col-span-2 space-y-2">
                <label className="text-xs text-[var(--nyasa-text-muted)] block">Commission Tiers</label>
                {form.tiers.map((tier, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[var(--nyasa-surface-3)] rounded-xl p-2">
                    <input type="number" className="flex-1 bg-transparent text-sm text-[var(--nyasa-text)] focus:outline-none" placeholder="Min" value={tier.min} onChange={e => setTier(i, 'min', e.target.value)} />
                    <span className="text-[var(--nyasa-text-muted)] text-xs">–</span>
                    <input type="number" className="flex-1 bg-transparent text-sm text-[var(--nyasa-text)] focus:outline-none" placeholder="Max (blank=∞)" value={tier.max} onChange={e => setTier(i, 'max', e.target.value)} />
                    <select className="bg-transparent text-xs text-[var(--nyasa-text)] focus:outline-none" value={tier.type} onChange={e => setTier(i, 'type', e.target.value)}>
                      <option value="fixed">Fixed</option>
                      <option value="percentage">%</option>
                    </select>
                    <input type="number" className="flex-1 bg-transparent text-sm text-[var(--nyasa-text)] focus:outline-none" placeholder="Value" value={tier.value} onChange={e => setTier(i, 'value', e.target.value)} />
                    <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                <button onClick={addTier} className="text-xs text-[#6366F1] hover:text-indigo-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add tier
                </button>
              </div>
            )}
          </div>
          {err && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}
        </div>
        <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-[var(--nyasa-border)]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--nyasa-text-muted)] hover:bg-[var(--nyasa-surface-3)]">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#6366F1] text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save Policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function AdminCommissions() {
  const { workspaceOwnerId } = useNyasaAuth();
  const { toast } = useToast();
  const [tab,        setTab]        = useState('overview');
  const [stats,      setStats]      = useState(null);
  const [policies,   setPolicies]   = useState([]);
  const [commissions,setCommissions]= useState([]);
  const [teamUsers,  setTeamUsers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [policyModal,setPolicyModal]= useState(null);  // null | 'new' | policy obj
  const [breakdown,  setBreakdown]  = useState(null);  // commission obj
  const [statusFilter, setStatusFilter] = useState('');

  const getSession = async () => (await supabase.auth.getSession()).data.session;

  const loadAll = useCallback(async () => {
    if (!workspaceOwnerId) return;
    setLoading(true);
    try {
      const session = await getSession();
      const [statsRes, policiesRes, commissionsRes, teamRes] = await Promise.all([
        apiFetch(`/api/billing?action=commission-stats`, { session }),
        apiFetch(`/api/billing?action=list-policies`, { session }),
        apiFetch(`/api/billing?action=list-commissions`, { session }),
        fetch(`/api/team?workspace_id=${workspaceOwnerId}`, { headers: { Authorization: `Bearer ${session?.access_token}` } }).then(r => r.json()),
      ]);
      setStats(statsRes);
      setPolicies(policiesRes.policies || []);
      setCommissions(commissionsRes.commissions || []);
      setTeamUsers((teamRes.users || []).map(u => ({ id: u.id, full_name: u.full_name || u.email })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [workspaceOwnerId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleStatusChange = async (commission, newStatus) => {
    try {
      const session = await getSession();
      await apiFetch('/api/billing', { method: 'POST', body: { action: 'update-commission-status', id: commission.id, status: newStatus }, session });
      toast({ title: `Commission ${STATUS_LABELS[newStatus]}` });
      loadAll();
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleArchive = async (policy) => {
    if (!confirm(`Archive "${policy.name}"?`)) return;
    try {
      const session = await getSession();
      await apiFetch('/api/billing', { method: 'POST', body: { action: 'archive-policy', id: policy.id }, session });
      toast({ title: 'Policy archived' });
      loadAll();
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDuplicate = (policy) => {
    const dup = { ...policy, id: undefined, name: policy.name + ' (copy)', status: 'inactive' };
    setPolicyModal(dup);
  };

  const filteredCommissions = statusFilter
    ? commissions.filter(c => c.status === statusFilter)
    : commissions;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--nyasa-text)] flex items-center gap-2">
              <BadgeDollarSign className="w-6 h-6 text-[#6366F1]" /> Commissions
            </h1>
            <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">Manage policies, track earnings, and approve payouts</p>
          </div>
          <button onClick={loadAll} className="p-2 rounded-xl hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)]">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--nyasa-surface-2)] p-1 rounded-xl w-fit border border-[var(--nyasa-border)]">
          {[['overview','Overview'],['policies','Policies'],['history','History']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===id ? 'bg-[#6366F1] text-white' : 'text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)]'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" /></div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {tab === 'overview' && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatTile label="Total" value={fmtMoney(stats.stats?.total)} icon={BadgeDollarSign} color="#6366F1" />
                  <StatTile label="Pending" value={fmtMoney(stats.stats?.pending)} icon={Clock} color="#F59E0B" />
                  <StatTile label="Approved" value={fmtMoney(stats.stats?.approved)} icon={CheckCircle2} color="#22C55E" />
                  <StatTile label="Paid" value={fmtMoney(stats.stats?.paid)} icon={DollarSign} color="#10B981" />
                  <StatTile label="Reversed" value={fmtMoney(stats.stats?.reversed)} icon={RefreshCw} color="#A855F7" />
                </div>

                {/* Monthly chart */}
                <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--nyasa-text)] mb-4">Monthly Commissions</h3>
                  <div className="flex items-end gap-3 h-32">
                    {(stats.monthly || []).map((m, i) => {
                      const max = Math.max(...(stats.monthly || []).map(x => x.total), 1);
                      const pct = Math.max((m.total / max) * 100, 4);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-[var(--nyasa-text-muted)]">{fmtMoney(m.total).replace('MK','')}</span>
                          <div className="w-full rounded-t-lg bg-[#6366F1]/80 transition-all" style={{ height: `${pct}%` }} title={`${m.label}: ${fmtMoney(m.total)}`} />
                          <span className="text-[10px] text-[var(--nyasa-text-muted)]">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top agents */}
                {stats.topAgents?.length > 0 && (
                  <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-5">
                    <h3 className="text-sm font-semibold text-[var(--nyasa-text)] mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#25D366]" /> Top Earning Agents</h3>
                    <div className="space-y-2">
                      {stats.topAgents.map((a, i) => (
                        <div key={a.agent_id} className="flex items-center gap-3">
                          <span className="text-xs text-[var(--nyasa-text-muted)] w-5 text-right">#{i+1}</span>
                          <div className="w-8 h-8 rounded-full bg-[#6366F1]/20 flex items-center justify-center text-xs font-bold text-[#6366F1] shrink-0">
                            {(a.agent_name || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[var(--nyasa-text)]">{a.agent_name}</p>
                            <p className="text-xs text-[var(--nyasa-text-muted)]">{a.count} commission{a.count !== 1 ? 's' : ''}</p>
                          </div>
                          <span className="text-sm font-bold text-[#25D366]">{fmtMoney(a.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── POLICIES ── */}
            {tab === 'policies' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button onClick={() => setPolicyModal('new')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6366F1] text-white text-sm font-semibold hover:bg-indigo-500">
                    <Plus className="w-4 h-4" /> New Policy
                  </button>
                </div>
                {policies.length === 0 ? (
                  <div className="text-center py-16 text-[var(--nyasa-text-muted)]">
                    <BadgeDollarSign className="w-10 h-10 mx-auto opacity-20 mb-2" />
                    <p className="text-sm">No policies yet. Create one to start tracking commissions.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {policies.map(p => (
                      <div key={p.id} className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm text-[var(--nyasa-text)]">{p.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status==='active'?'bg-green-500/15 text-green-400':p.status==='archived'?'bg-gray-500/15 text-gray-400':'bg-yellow-500/15 text-yellow-400'}`}>
                              {p.status.toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6366F1]/15 text-indigo-400">
                              {METHOD_LABELS[p.calc_method]}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--nyasa-text-muted)]">{p.description || '—'}</p>
                          <p className="text-xs text-[var(--nyasa-text-muted)] mt-1">
                            {p.applies_to === 'individual' ? `Agent: ${teamUsers.find(u=>u.id===p.applies_to_id)?.full_name || p.applies_to_id}` : 'Entire workspace'} · Trigger: {TRIGGER_LABELS[p.trigger_event]} · From {fmtDate(p.effective_date)}
                          </p>
                        </div>
                        {p.status !== 'archived' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setPolicyModal(p)} className="p-2 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-blue-400" title="Edit"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDuplicate(p)} className="p-2 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-[#25D366]" title="Duplicate"><Copy className="w-4 h-4" /></button>
                            <button onClick={() => handleArchive(p)} className="p-2 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-red-400" title="Archive"><Archive className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORY ── */}
            {tab === 'history' && (
              <div className="space-y-4">
                {/* Filter bar */}
                <div className="flex gap-2 flex-wrap">
                  {[['','All'],['pending','Pending'],['approved','Approved'],['paid','Paid'],['rejected','Rejected'],['reversed','Reversed']].map(([v,l]) => (
                    <button key={v} onClick={() => setStatusFilter(v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${statusFilter===v ? 'border-[#6366F1] bg-[#6366F1]/15 text-indigo-400' : 'border-[var(--nyasa-border)] text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)]'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {filteredCommissions.length === 0 ? (
                  <div className="text-center py-16 text-[var(--nyasa-text-muted)]">
                    <DollarSign className="w-10 h-10 mx-auto opacity-20 mb-2" />
                    <p className="text-sm">No commissions yet.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--nyasa-border)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--nyasa-surface-3)] border-b border-[var(--nyasa-border)]">
                          {['Agent','Customer','Sale Amount','Commission','Policy','Status','Date','Actions'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--nyasa-text-muted)]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCommissions.map(c => (
                          <tr key={c.id} className="border-b border-[var(--nyasa-border)] hover:bg-[var(--nyasa-surface-3)]/40 transition-colors">
                            <td className="px-4 py-3 text-[var(--nyasa-text)] font-medium">{c.agent_name}</td>
                            <td className="px-4 py-3 text-[var(--nyasa-text-muted)]">{c.contact_name || '—'}</td>
                            <td className="px-4 py-3 text-[var(--nyasa-text)]">{fmtMoney(c.sale_amount)}</td>
                            <td className="px-4 py-3 font-bold text-[#25D366]">{fmtMoney(c.commission_amount)}</td>
                            <td className="px-4 py-3 text-[var(--nyasa-text-muted)] text-xs">
                              {policies.find(p => p.id === c.policy_id)?.name || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[c.status]}`}>
                                {STATUS_LABELS[c.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--nyasa-text-muted)] text-xs">{fmtDate(c.created_at)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setBreakdown(c)} className="p-1 rounded hover:bg-[var(--nyasa-surface-2)] text-[var(--nyasa-text-muted)] hover:text-[#6366F1]" title="View"><Eye className="w-3.5 h-3.5" /></button>
                                {c.status === 'pending' && <button onClick={() => handleStatusChange(c,'approved')} className="p-1 rounded hover:bg-green-500/10 text-[var(--nyasa-text-muted)] hover:text-green-400" title="Approve"><Check className="w-3.5 h-3.5" /></button>}
                                {['pending','approved'].includes(c.status) && <button onClick={() => handleStatusChange(c,'rejected')} className="p-1 rounded hover:bg-red-500/10 text-[var(--nyasa-text-muted)] hover:text-red-400" title="Reject"><X className="w-3.5 h-3.5" /></button>}
                                {c.status === 'approved' && <button onClick={() => handleStatusChange(c,'paid')} className="p-1 rounded hover:bg-emerald-500/10 text-[var(--nyasa-text-muted)] hover:text-emerald-400" title="Mark Paid"><DollarSign className="w-3.5 h-3.5" /></button>}
                                {!['reversed','cancelled'].includes(c.status) && <button onClick={() => handleStatusChange(c,'reversed')} className="p-1 rounded hover:bg-purple-500/10 text-[var(--nyasa-text-muted)] hover:text-purple-400" title="Reverse"><RefreshCw className="w-3.5 h-3.5" /></button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {policyModal && (
        <PolicyModal
          policy={policyModal === 'new' ? null : policyModal}
          teamUsers={teamUsers}
          workspaceOwnerId={workspaceOwnerId}
          onSave={() => { setPolicyModal(null); loadAll(); }}
          onClose={() => setPolicyModal(null)}
        />
      )}
      {breakdown && <BreakdownModal commission={breakdown} onClose={() => setBreakdown(null)} />}
    </AdminLayout>
  );
}
