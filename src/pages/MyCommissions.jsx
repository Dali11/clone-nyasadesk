import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  BadgeDollarSign, Clock, CheckCircle2, DollarSign, X,
  Check, Loader2, TrendingUp, AlertCircle, Eye
} from 'lucide-react';

const STATUS_COLORS = {
  pending:           'bg-yellow-500/15 text-yellow-400',
  awaiting_approval: 'bg-orange-500/15 text-orange-400',
  approved:          'bg-green-500/15 text-green-400',
  paid:              'bg-emerald-500/15 text-emerald-400',
  rejected:          'bg-red-500/15 text-red-400',
  cancelled:         'bg-gray-500/15 text-gray-400',
  reversed:          'bg-purple-500/15 text-purple-400',
};
const STATUS_LABELS = {
  pending:'Pending', awaiting_approval:'Awaiting Approval',
  approved:'Approved', paid:'Paid', rejected:'Rejected',
  cancelled:'Cancelled', reversed:'Reversed',
};
const METHOD_LABELS = { fixed:'Fixed Amount', percentage:'Percentage', tiered:'Tiered', formula:'Formula' };
const TRIGGER_LABELS = { deal_won:'Deal Won', invoice_paid:'Invoice Paid', payment_received:'Payment Received', manual:'Manual Approval' };

function fmtMoney(n)  { return `MK${Number(n||0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d)   { return d ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'; }

async function apiFetch(path, session) {
  const headers = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || res.statusText);
  return res.json();
}

// ── Stat Tile ─────────────────────────────────────────────────────────────
function Tile({ label, value, icon: Icon, color }) {
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

// ── Breakdown Modal ───────────────────────────────────────────────────────
function BreakdownModal({ commission, onClose }) {
  if (!commission) return null;
  const bd = commission.calc_breakdown || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[var(--nyasa-surface-1)] border border-[var(--nyasa-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl z-10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--nyasa-text)]">Commission Details</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Customer</span><span className="text-[var(--nyasa-text)]">{commission.contact_name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Sale Amount</span><span className="font-medium text-[var(--nyasa-text)]">{fmtMoney(commission.sale_amount)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Trigger</span><span className="text-[var(--nyasa-text)]">{TRIGGER_LABELS[commission.trigger_event] || commission.trigger_event}</span></div>
          <hr className="border-[var(--nyasa-border)]" />
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Method</span><span className="font-semibold text-[#6366F1]">{METHOD_LABELS[bd.method] || bd.method}</span></div>
          {bd.formula && (
            <div className="rounded-lg bg-[var(--nyasa-surface-3)] p-3 text-[var(--nyasa-text-muted)] font-mono text-xs">{bd.formula}</div>
          )}
          {bd.method === 'tiered' && bd.tiersEvaluated && (
            <div className="rounded-lg border border-[var(--nyasa-border)] overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-[var(--nyasa-surface-3)]">
                  <th className="p-2 text-left text-[var(--nyasa-text-muted)]">Min</th>
                  <th className="p-2 text-left text-[var(--nyasa-text-muted)]">Max</th>
                  <th className="p-2 text-left text-[var(--nyasa-text-muted)]">Rate</th>
                  <th className="p-2 text-center text-[var(--nyasa-text-muted)]">✓</th>
                </tr></thead>
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
            <span className="text-2xl font-bold text-[#25D366]">{fmtMoney(commission.commission_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--nyasa-text-muted)]">Status</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[commission.status]}`}>{STATUS_LABELS[commission.status]}</span>
          </div>
          <div className="flex justify-between"><span className="text-[var(--nyasa-text-muted)]">Date</span><span className="text-[var(--nyasa-text)]">{fmtDate(commission.created_at)}</span></div>
          {commission.notes && <p className="text-xs text-[var(--nyasa-text-muted)] italic">Note: {commission.notes}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function MyCommissions() {
  useDocumentTitle('My Commissions – Nyasadesk');
  const { user, workspaceOwnerId } = useNyasaAuth();
  const [commissions, setCommissions] = useState([]);
  const [policies,    setPolicies]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statusTab,   setStatusTab]   = useState('all');
  const [breakdown,   setBreakdown]   = useState(null);

  const load = useCallback(async () => {
    if (!workspaceOwnerId || !user?.id) return;
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const [commRes, polRes] = await Promise.all([
        apiFetch(`/api/billing?action=list-commissions`, session),
        apiFetch(`/api/billing?action=list-policies&agent_id=${user.id}`, session),
      ]);
      setCommissions(commRes.commissions || []);
      setPolicies((polRes.policies || []).filter(p => p.status === 'active'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [workspaceOwnerId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Refresh when window regains focus
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  // Stats
  const sum = (filter) => commissions.filter(filter).reduce((a, c) => a + Number(c.commission_amount), 0);
  const now = new Date();
  const thisMonthTotal = sum(c => {
    const d = new Date(c.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const filtered = statusTab === 'all' ? commissions : commissions.filter(c => c.status === statusTab);

  // My policy (most relevant — individual first, then workspace)
  const myPolicy = policies.find(p => p.applies_to === 'individual' && p.applies_to_id === user?.id)
                || policies.find(p => p.applies_to === 'workspace');

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-bg)]">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-[var(--nyasa-text)] flex items-center gap-2">
              <BadgeDollarSign className="w-6 h-6 text-[#6366F1]" /> My Commissions
            </h1>
            <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">Track your earnings and commission history</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" /></div>
          ) : (
            <>
              {/* Stat tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile label="This Month" value={fmtMoney(thisMonthTotal)} icon={TrendingUp} color="#6366F1" />
                <Tile label="Lifetime Total" value={fmtMoney(sum(c => ['approved','paid'].includes(c.status)))} icon={BadgeDollarSign} color="#25D366" />
                <Tile label="Pending" value={fmtMoney(sum(c => ['pending','awaiting_approval'].includes(c.status)))} icon={Clock} color="#F59E0B" />
                <Tile label="Paid Out" value={fmtMoney(sum(c => c.status === 'paid'))} icon={DollarSign} color="#10B981" />
              </div>

              {/* My Policy */}
              <div>
                <h2 className="text-sm font-semibold text-[var(--nyasa-text)] mb-3">My Commission Policy</h2>
                {myPolicy ? (
                  <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--nyasa-text)]">{myPolicy.name}</p>
                        {myPolicy.description && <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">{myPolicy.description}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6366F1]/15 text-indigo-400">{METHOD_LABELS[myPolicy.calc_method]}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#25D366]/15 text-[#25D366]">{TRIGGER_LABELS[myPolicy.trigger_event]}</span>
                      </div>
                    </div>

                    {/* Tiered breakdown table */}
                    {myPolicy.calc_method === 'tiered' && myPolicy.tiers?.length > 0 && (
                      <div className="rounded-xl border border-[var(--nyasa-border)] overflow-hidden">
                        <div className="bg-[var(--nyasa-surface-3)] px-4 py-2 text-xs font-semibold text-[var(--nyasa-text-muted)]">Commission Rules</div>
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-[var(--nyasa-border)] bg-[var(--nyasa-surface-3)]/50">
                            <th className="px-4 py-2 text-left text-xs text-[var(--nyasa-text-muted)]">Sale Amount</th>
                            <th className="px-4 py-2 text-left text-xs text-[var(--nyasa-text-muted)]">You Earn</th>
                          </tr></thead>
                          <tbody>
                            {myPolicy.tiers.map((t, i) => (
                              <tr key={i} className="border-b border-[var(--nyasa-border)] last:border-0">
                                <td className="px-4 py-2.5 text-[var(--nyasa-text-muted)]">
                                  {t.max ? `MK${t.min} – MK${t.max}` : `MK${t.min} and above`}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-[#25D366]">
                                  {t.type === 'fixed' ? fmtMoney(t.value) : `${t.value}%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {myPolicy.calc_method === 'fixed' && (
                      <p className="text-sm text-[var(--nyasa-text-muted)]">Fixed commission: <span className="text-[#25D366] font-semibold">{fmtMoney(myPolicy.calc_value)}</span> per qualifying sale</p>
                    )}
                    {myPolicy.calc_method === 'percentage' && (
                      <p className="text-sm text-[var(--nyasa-text-muted)]">Commission rate: <span className="text-[#25D366] font-semibold">{myPolicy.calc_value}%</span> of sale value</p>
                    )}
                    <p className="text-xs text-[var(--nyasa-text-muted)]">Effective from {fmtDate(myPolicy.effective_date)}{myPolicy.expiry_date ? ` · Expires ${fmtDate(myPolicy.expiry_date)}` : ''}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-8 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[var(--nyasa-text-muted)] opacity-40" />
                    <p className="text-sm text-[var(--nyasa-text-muted)]">No commission policy assigned yet.</p>
                    <p className="text-xs text-[var(--nyasa-text-muted)] mt-1">Contact your admin to get set up.</p>
                  </div>
                )}
              </div>

              {/* Commission history */}
              <div>
                <h2 className="text-sm font-semibold text-[var(--nyasa-text)] mb-3">Commission History</h2>

                {/* Status filter tabs */}
                <div className="flex gap-1.5 flex-wrap mb-4">
                  {[['all','All'],['pending','Pending'],['approved','Approved'],['paid','Paid'],['rejected','Rejected']].map(([v,l]) => (
                    <button key={v} onClick={() => setStatusTab(v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${statusTab===v ? 'border-[#6366F1] bg-[#6366F1]/15 text-indigo-400' : 'border-[var(--nyasa-border)] text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)]'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-[var(--nyasa-text-muted)]">
                    <DollarSign className="w-10 h-10 mx-auto opacity-20 mb-2" />
                    <p className="text-sm">No commissions yet.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--nyasa-border)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--nyasa-surface-3)] border-b border-[var(--nyasa-border)]">
                          {['Date','Customer','Sale Amount','Commission','Status',''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--nyasa-text-muted)]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(c => (
                          <tr key={c.id} className="border-b border-[var(--nyasa-border)] last:border-0 hover:bg-[var(--nyasa-surface-3)]/40">
                            <td className="px-4 py-3 text-[var(--nyasa-text-muted)] text-xs">{fmtDate(c.created_at)}</td>
                            <td className="px-4 py-3 text-[var(--nyasa-text)]">{c.contact_name || '—'}</td>
                            <td className="px-4 py-3 text-[var(--nyasa-text)]">{fmtMoney(c.sale_amount)}</td>
                            <td className="px-4 py-3 font-bold text-[#25D366]">{fmtMoney(c.commission_amount)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setBreakdown(c)} className="p-1.5 rounded-lg hover:bg-[var(--nyasa-surface-2)] text-[var(--nyasa-text-muted)] hover:text-[#6366F1]">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {breakdown && <BreakdownModal commission={breakdown} onClose={() => setBreakdown(null)} />}
    </div>
  );
}
