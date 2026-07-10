import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, CheckCircle, AlertCircle, Clock, ExternalLink, Trash2, Loader2, X, ChevronDown, FileText, Download, DollarSign } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const API = '/api/channels';
const fmt = (n, cur = 'MWK') => `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_STYLES = {
  claimed:  { label: 'Pending', icon: Clock,         cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  verified: { label: 'Verified', icon: CheckCircle,  cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  disputed: { label: 'Disputed', icon: AlertCircle,  cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Sales() {
  const { user, workspaceOwnerId, isWorkspaceAdmin } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agents, setAgents] = useState([]);

  const load = useCallback(async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    setLoading(true); setLoadError('');
    try {
      const params = new URLSearchParams({ action: 'sales-list', workspace_id: workspaceOwnerId });
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${API}?${params}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const d = await r.json();
      if (d.ok) {
        setSales(d.sales);
        const seen = {};
        d.sales.forEach(s => { if (!seen[s.agent_id]) seen[s.agent_id] = s.agent_name; });
        setAgents(Object.entries(seen).map(([id, name]) => ({ id, name })));
      } else {
        setLoadError(d.error || 'Failed to load sales');
      }
    } catch (e) {
      setLoadError(e.message || 'Network error loading sales');
    } finally { setLoading(false); }
  }, [workspaceOwnerId]);

  // Re-run whenever workspaceOwnerId changes (null → real id after auth loads)
  useEffect(() => { load(); }, [load]);

  const verify = async (sale_id, status) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${API}?action=sales-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ sale_id, status }),
    });
    load();
  };

  const del = async (sale_id) => {
    if (!window.confirm('Delete this sale record?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${API}?action=sales-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ sale_id }),
    });
    load();
  };

  const filtered = sales.filter(s =>
    (agentFilter === 'all' || s.agent_id === agentFilter) &&
    (statusFilter === 'all' || s.status === statusFilter)
  );

  const totalValue = filtered.reduce((sum, s) => sum + Number(s.sale_value || 0), 0);
  const verifiedValue = filtered.filter(s => s.status === 'verified').reduce((sum, s) => sum + Number(s.sale_value || 0), 0);
  const currency = sales[0]?.currency || 'MWK';

  return (
    <div className="flex flex-col h-full bg-[#0B141A] pt-14 md:pt-0 pb-[56px] md:pb-0">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#25D366]" /> Sales
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCommissionModal(true)}
              className="flex items-center gap-1.5 bg-[#202C33] text-white text-xs font-semibold px-2.5 py-2 rounded-xl border border-white/10 hover:bg-[#2a3a42]">
              <FileText className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
              <span className="hidden sm:inline">Commission Report</span>
              <span className="sm:hidden">Report</span>
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-[#25D366] text-black text-xs font-semibold px-2.5 py-2 rounded-xl hover:bg-[#20b859]">
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Record sale</span>
              <span className="sm:hidden">Record</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-4 sm:px-6 py-4">
        <div className="bg-[#202C33] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Total claimed</p>
          <p className="text-white font-bold text-base">{fmt(totalValue, currency)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} sale{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-[#202C33] rounded-xl p-4 border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Verified</p>
          <p className="text-[#25D366] font-bold text-base">{fmt(verifiedValue, currency)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.filter(s => s.status === 'verified').length} sale{filtered.filter(s => s.status === 'verified').length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 sm:px-6 pb-3 overflow-x-auto">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#202C33] text-white text-xs rounded-lg px-3 py-1.5 border border-white/10 outline-none">
          <option value="all">All statuses</option>
          <option value="claimed">Pending</option>
          <option value="verified">Verified</option>
          <option value="disputed">Disputed</option>
        </select>
        {isWorkspaceAdmin && agents.length > 1 && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="bg-[#202C33] text-white text-xs rounded-lg px-3 py-1.5 border border-white/10 outline-none">
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 space-y-3 pb-4 md:pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-red-400 text-sm font-medium">Failed to load sales</p>
            <p className="text-gray-500 text-xs">{loadError}</p>
            <button onClick={load} className="mt-2 text-xs text-[#25D366] underline">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <TrendingUp className="w-10 h-10 text-gray-700" />
            <p className="text-gray-500 text-sm">No sales recorded yet</p>
            <button onClick={() => setShowModal(true)} className="text-[#25D366] text-sm font-semibold">Record your first sale →</button>
          </div>
        ) : filtered.map(s => {
          const st = STATUS_STYLES[s.status] || STATUS_STYLES.claimed;
          const Icon = st.icon;
          return (
            <div key={s.id} className="bg-[#202C33] rounded-xl p-4 border border-white/5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-base">{fmt(s.sale_value, s.currency)}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
                      <Icon className="w-3 h-3" />{st.label}
                    </span>
                  </div>
                  {s.contact_name && <p className="text-sm text-gray-300 mt-0.5">{s.contact_name}{s.contact_phone ? ` · ${s.contact_phone}` : ''}</p>}
                  {s.document_number && <p className="text-xs text-gray-500 mt-0.5">Linked: {s.document_number}</p>}
                  {s.notes && <p className="text-xs text-gray-500 mt-1 italic">"{s.notes}"</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.conversation_id && (
                    <a href={`/inbox?conv=${s.conversation_id}`} title="View conversation"
                      className="p-1.5 text-gray-500 hover:text-[#25D366] rounded-lg hover:bg-white/5">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {(isWorkspaceAdmin || s.agent_id === user?.id) && s.status === 'claimed' && (
                    <button onClick={() => del(s.id)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-white/5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div>
                  <p className="text-xs text-gray-500">{s.agent_name} · {fmtDate(s.created_at)}</p>
                </div>
                {isWorkspaceAdmin && s.status === 'claimed' && (
                  <div className="flex gap-2">
                    <button onClick={() => verify(s.id, 'disputed')}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">Dispute</button>
                    <button onClick={() => verify(s.id, 'verified')}
                      className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-[#25D366] border border-green-500/20 hover:bg-green-500/20">Verify ✓</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <RecordSaleModal
          workspaceId={workspaceOwnerId}
          currency={currency}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {showCommissionModal && (
        <CommissionReportModal
          workspaceId={workspaceOwnerId}
          agents={agents}
          currency={currency}
          isWorkspaceAdmin={isWorkspaceAdmin}
          onClose={() => setShowCommissionModal(false)}
        />
      )}
    </div>
  );
}

function RecordSaleModal({ workspaceId, currency, onClose, onSaved, prefillConversation }) {
  const [form, setForm] = useState({
    contact_name: prefillConversation?.contact_name || '',
    contact_phone: prefillConversation?.contact_phone || '',
    sale_value: '',
    notes: '',
    document_id: '',
    document_type: '',
    document_number: '',
    conversation_id: prefillConversation?.id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    // Load recent quotations/invoices to link
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/channels?action=quotation-list&workspace_id=${workspaceId}&limit=20`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      const d = await r.json();
      if (d.ok) setDocs(d.quotations || []);
    })();
  }, [workspaceId]);

  const save = async () => {
    if (!form.sale_value) { setError('Enter a sale value'); return; }
    setSaving(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/channels?action=sales-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ workspace_id: workspaceId, ...form }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      onSaved(d.sale);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-[#0B141A] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 outline-none focus:border-[#25D366]/50 placeholder-gray-600';
  const labelCls = 'block text-xs text-gray-400 mb-1.5 font-medium';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#111B21] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-bold text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#25D366]" /> Record a Sale</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Customer name</label><input className={inputCls} placeholder="John Doe" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} /></div>
            <div><label className={labelCls}>Phone / contact</label><input className={inputCls} placeholder="+265..." value={form.contact_phone} onChange={e => setForm(f => ({...f, contact_phone: e.target.value}))} /></div>
          </div>

          <div>
            <label className={labelCls}>Sale value <span className="text-[#25D366]">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">{currency}</span>
              <input className={inputCls + ' pl-14'} type="number" min="0" placeholder="0.00" value={form.sale_value}
                onChange={e => setForm(f => ({...f, sale_value: e.target.value}))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Link to quotation / invoice <span className="text-gray-600">(optional — makes it auditable)</span></label>
            <select className={inputCls} value={form.document_id}
              onChange={e => {
                const doc = docs.find(d => d.id === e.target.value);
                setForm(f => ({...f, document_id: e.target.value, document_type: doc ? 'quotation' : '', document_number: doc?.quotation_number || ''}));
              }}>
              <option value="">— no linked document —</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.quotation_number} · {d.customer_name} · {currency} {Number(d.total_amount||0).toLocaleString()}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-gray-600">(what was sold)</span></label>
            <textarea className={inputCls} rows={2} placeholder="e.g. 3-month social media management package" value={form.notes}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>

          <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-3">
            <p className="text-xs text-[#25D366]/80 leading-relaxed">
              <strong className="text-[#25D366]">Auditable record.</strong> This sale is saved with your name, timestamp, and the linked conversation/document. Admins can click through to review the full chat before verifying.
            </p>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold text-black bg-[#25D366] hover:bg-[#20b859] disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Record sale'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommissionReportModal({ workspaceId, agents, currency, isWorkspaceAdmin, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(); firstOfMonth.setDate(1);
  const [form, setForm] = useState({
    date_from: firstOfMonth.toISOString().slice(0, 10),
    date_to: today,
    commission_rate: '10',
    agent_id: 'all',
    business_name: '',
    report_title: 'Sales Commission Report',
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill business name from doc settings
  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`/api/channels?action=doc-settings-get&workspace_id=${workspaceId}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const d = await r.json();
        if (d.ok && d.settings?.company_name) {
          setForm(f => ({ ...f, business_name: d.settings.company_name }));
        }
      } catch { /* ignore — optional */ }
    })();
  }, [workspaceId]);

  // Fetch preview data (debounced via simple effect)
  useEffect(() => {
    if (!workspaceId) return;
    const timer = setTimeout(() => { fetchReport(); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date_from, form.date_to, form.commission_rate, form.agent_id, workspaceId]);

  const fetchReport = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        action: 'sales-commission-report',
        workspace_id: workspaceId,
        commission_rate: (parseFloat(form.commission_rate) / 100).toString(),
      });
      if (form.date_from) params.set('date_from', form.date_from);
      if (form.date_to) params.set('date_to', form.date_to + 'T23:59:59');
      if (form.agent_id !== 'all') params.set('agent_id', form.agent_id);

      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${API}?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = await r.json();
      if (d.ok) setReport(d);
      else setError(d.error || 'Failed to load report');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const downloadPdf = async () => {
    setDownloading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/channels?action=sales-commission-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          workspace_id: workspaceId,
          date_from: form.date_from || undefined,
          date_to: form.date_to ? form.date_to + 'T23:59:59' : undefined,
          commission_rate: parseFloat(form.commission_rate) / 100,
          agent_id: form.agent_id !== 'all' ? form.agent_id : undefined,
          business_name: form.business_name || undefined,
          report_title: form.report_title || undefined,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      // Trigger browser download
      const a = window.document.createElement('a');
      a.href = d.pdf_url;
      a.download = `commission-report-${form.date_from || 'all'}-${form.date_to || 'now'}.pdf`;
      a.target = '_blank';
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
    } catch (e) { setError(e.message); } finally { setDownloading(false); }
  };

  const inputCls = 'w-full bg-[#0B141A] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 outline-none focus:border-[#25D366]/50 placeholder-gray-600';
  const labelCls = 'block text-xs text-gray-400 mb-1.5 font-medium';
  const ratePct = parseFloat(form.commission_rate) || 0;
  const rptCur = report?.currency || currency;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#111B21] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#111B21] z-10">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#25D366]" /> Commission Report
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date from</label>
              <input type="date" className={inputCls} value={form.date_from}
                onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Date to</label>
              <input type="date" className={inputCls} value={form.date_to}
                onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Commission rate (%)</label>
              <input type="number" min="0" step="0.5" className={inputCls} value={form.commission_rate}
                onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Agent</label>
              <select className={inputCls} value={form.agent_id}
                onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}>
                <option value="all">All agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Business name</label>
              <input className={inputCls} placeholder="Your Business Ltd" value={form.business_name}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Report title</label>
              <input className={inputCls} value={form.report_title}
                onChange={e => setForm(f => ({ ...f, report_title: e.target.value }))} />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-[#1F2C34] rounded-xl border border-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Preview</span>
              {loading && <Loader2 className="w-4 h-4 text-[#25D366] animate-spin" />}
            </div>
            {error ? (
              <div className="px-4 py-6 text-center text-red-400 text-sm">{error}</div>
            ) : !report ? (
              <div className="px-4 py-6 text-center text-gray-600 text-sm">Adjust filters to preview commission…</div>
            ) : report.agent_summaries.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-600 text-sm">No verified sales in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-white/5">
                      <th className="text-left font-medium px-4 py-2.5">Agent</th>
                      <th className="text-right font-medium px-2 py-2.5">Sales</th>
                      <th className="text-right font-medium px-2 py-2.5">Total Value</th>
                      <th className="text-right font-medium px-2 py-2.5">Rate</th>
                      <th className="text-right font-medium px-4 py-2.5">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.agent_summaries.map((a, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-4 py-2.5 text-white font-medium">{a.agent_name}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300">{a.total_sales_count}</td>
                        <td className="px-2 py-2.5 text-right text-gray-300">{fmt(a.total_value, rptCur)}</td>
                        <td className="px-2 py-2.5 text-right text-gray-500">{ratePct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-right text-[#25D366] font-semibold">{fmt(a.commission_amount, rptCur)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#25D366]/5">
                      <td className="px-4 py-3 text-white font-bold" colSpan={1}>Grand Total</td>
                      <td className="px-2 py-3 text-right text-gray-300 font-semibold">{report.agent_summaries.reduce((s, a) => s + a.total_sales_count, 0)}</td>
                      <td className="px-2 py-3 text-right text-white font-bold">{fmt(report.grand_total_value, rptCur)}</td>
                      <td className="px-2 py-3"></td>
                      <td className="px-4 py-3 text-right text-[#25D366] font-bold">{fmt(report.grand_total_commission, rptCur)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 text-sm font-semibold text-gray-400 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5">
              Close
            </button>
            <button onClick={downloadPdf} disabled={downloading || !report || report.agent_summaries.length === 0}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-[#25D366] text-black px-4 py-2.5 rounded-xl hover:bg-[#20b859] disabled:opacity-40 disabled:cursor-not-allowed">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { RecordSaleModal };
