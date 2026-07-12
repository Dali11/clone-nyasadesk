import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, MessageSquare, Calendar, Clock, Crown, Plus, Lock, Unlock, Eye, X, LogIn } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { enterGodMode } from '@/lib/godMode';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/components/ui/use-toast';

const PLAN_INFO = {
  starter: { label: 'Starter', seats: 2 },
  growth:  { label: 'Growth',  seats: 5 },
  scale:   { label: 'Scale',   seats: 'Unlimited' },
};

const SUB_BADGE = {
  trialing:  { label: 'Trial', cls: 'bg-yellow-500/15 text-yellow-400' },
  active:    { label: 'Active', cls: 'bg-[#25D366]/15 text-[#25D366]' },
  past_due:  { label: 'Past Due', cls: 'bg-red-500/15 text-red-400' },
  canceled:  { label: 'Canceled', cls: 'bg-gray-500/15 text-gray-400' },
  suspended: { label: 'Suspended', cls: 'bg-red-600/20 text-red-500' },
};

// Formerly the whole of AdminPanel.jsx — now lives inside AdminLayout's
// shell, so it only renders its own content, not a full-page wrapper.
export default function AdminWorkspaces() {
  const { toast } = useToast();
  useDocumentTitle('Admin · Workspaces');
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deniedMsg, setDeniedMsg] = useState('');
  const [updating, setUpdating] = useState(null);
  const [pricing, setPricing] = useState({}); // plan -> price_mwk, live from admin/pricing
  const [viewingId, setViewingId] = useState(null); // workspace_id currently open in the detail modal

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/workspaces');
      const data = await res.json();
      if (res.status === 403) {
        setDeniedMsg(data.error || 'Admin access required');
        setTimeout(() => navigate('/'), 2000);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
      setWorkspaces(data.workspaces || []);

      // Live per-plan pricing for the plan-change dropdown -- best-effort,
      // dropdown just omits prices if this fails for any reason.
      adminFetch('/api/admin/workspaces?resource=pricing')
        .then(r => r.json())
        .then(d => setPricing(Object.fromEntries((d.plans || []).map(p => [p.plan, p.price_mwk]))))
        .catch(() => {});
    } catch (e) {
      console.error('[AdminWorkspaces] load error:', e);
      setDeniedMsg(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const enterWorkspace = (workspaceId, workspaceName) => {
    enterGodMode({ workspaceId, workspaceName });
    navigate('/'); // navigate to inbox as that workspace
    window.location.reload();
  };

  const patchWorkspace = async (workspaceId, updates) => {
    setUpdating(workspaceId);
    try {
      const res = await adminFetch('/api/admin/workspaces', {
        method: 'PATCH',
        body: JSON.stringify({ workspace_id: workspaceId, ...updates }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      await load();
    } catch (e) {
      console.error('[AdminWorkspaces] update error:', e);
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setUpdating(null);
    }
  };

  const changePlan = (workspaceId, plan) => {
    setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, plan } : w));
    patchWorkspace(workspaceId, { plan });
  };

  const extendTrial = (workspaceId, days) => patchWorkspace(workspaceId, { extend_trial_days: days });
  const setSubStatus = (workspaceId, subscription_status) => patchWorkspace(workspaceId, { subscription_status });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Workspaces</h1>
        <p className="text-xs md:text-sm text-gray-400">All Nyasadesk workspaces, plans & subscriptions</p>
      </div>

      {deniedMsg && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">
          {deniedMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {workspaces.length === 0 && !deniedMsg && (
            <p className="text-center text-gray-600 py-20">No workspaces yet.</p>
          )}
          {workspaces.map(w => {
            const plan = PLAN_INFO[w.plan] || PLAN_INFO.starter;
            const subBadge = SUB_BADGE[w.subscription_status] || SUB_BADGE.trialing;
            const trialDaysLeft = w.trial_ends_at ? Math.max(0, Math.ceil((new Date(w.trial_ends_at) - new Date()) / 86400000)) : null;
            return (
              <div key={w.id} className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">{w.workspace_name || w.full_name || 'Untitled workspace'}</p>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${subBadge.cls}`}>{subBadge.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{w.email}</p>
                    {w.signed_up_at && (
                      <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Signed up {new Date(w.signed_up_at).toLocaleDateString()}
                      </p>
                    )}
                    {w.subscription_status === 'trialing' && trialDaysLeft !== null && (
                      <p className="text-[11px] text-yellow-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {trialDaysLeft} days left
                      </p>
                    )}
                    {w.subscription_status === 'active' && w.current_period_end && (
                      <p className="text-[11px] text-[#25D366] mt-1 flex items-center gap-1">
                        <Crown className="w-3 h-3" /> Renews {new Date(w.current_period_end).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={w.plan}
                      disabled={updating === w.id}
                      onChange={e => changePlan(w.id, e.target.value)}
                      className="bg-[var(--nyasa-surface-4)] text-white text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 border-0 disabled:opacity-50"
                    >
                      {Object.entries(PLAN_INFO).map(([key, p]) => (
                        <option key={key} value={key}>
                          {p.label}{pricing[key] != null ? ` — K${pricing[key].toLocaleString()}/mo` : ''}
                        </option>
                      ))}
                    </select>
                    {updating === w.id && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[var(--nyasa-border)]">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users className="w-3.5 h-3.5" />
                    {w.team_count} / {plan.seats === 'Unlimited' ? '∞' : plan.seats} seats
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {w.conversation_count} conversations · {w.message_count} messages
                  </div>
                </div>

                {/* Subscription management controls */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--nyasa-border)]">
                  {w.subscription_status === 'trialing' && (
                    <>
                      <button onClick={() => extendTrial(w.id, 7)}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors">
                        +7 days trial
                      </button>
                      <button onClick={() => extendTrial(w.id, 30)}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors">
                        +30 days trial
                      </button>
                    </>
                  )}
                  {w.subscription_status !== 'active' && (
                    <button onClick={() => setSubStatus(w.id, 'active')}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors">
                      Mark Active
                    </button>
                  )}
                  {w.subscription_status !== 'canceled' && (
                    <button onClick={() => setSubStatus(w.id, 'canceled')}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => enterWorkspace(w.id, w.workspace_name || w.full_name || w.email)}
                    title="Enter workspace as God Mode"
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                  >
                    <LogIn className="w-3 h-3" /> Enter workspace
                  </button>
                  {w.subscription_status === 'canceled' && (
                    <button onClick={() => setSubStatus(w.id, 'trialing')}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors">
                      Reactivate Trial
                    </button>
                  )}
                  {w.subscription_status === 'suspended' ? (
                    <button onClick={() => setSubStatus(w.id, 'active')}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors">
                      <Unlock className="w-3 h-3" /> Reactivate
                    </button>
                  ) : (
                    <button onClick={() => { if (window.confirm(`Suspend ${w.workspace_name || w.email}? This immediately blocks their entire team from logging in.`)) setSubStatus(w.id, 'suspended'); }}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-red-600/10 text-red-500 hover:bg-red-600/20 transition-colors">
                      <Lock className="w-3 h-3" /> Suspend
                    </button>
                  )}
                  <button onClick={() => setViewingId(w.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 text-xs font-medium transition-colors ml-auto">
                    <Eye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Open</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewingId && <WorkspaceDetailModal workspaceId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
}

// ── Workspace detail modal ("view as", read-only) ──────────────────────────
function WorkspaceDetailModal({ workspaceId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    adminFetch(`/api/admin/workspaces?resource=workspace-detail&workspace_id=${workspaceId}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setDetail(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (!workspaceId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[var(--nyasa-surface-1)] border border-[var(--nyasa-border)] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl z-10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[var(--nyasa-surface-1)] border-b border-[var(--nyasa-border)] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-white">{detail?.workspace?.workspace_name || 'Workspace'}</p>
            <p className="text-[11px] text-gray-500">{detail?.workspace?.email}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/8 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        {loading && <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>}
        {error && <div className="m-4 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm">{error}</div>}

        {detail && (
          <div className="p-5 space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-white">{detail.stats?.conversations ?? '—'}</p>
                <p className="text-[10px] text-gray-500">Conversations</p>
              </div>
              <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-white">{detail.stats?.messages ?? '—'}</p>
                <p className="text-[10px] text-gray-500">Messages</p>
              </div>
              <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-white">{detail.team?.length ?? '—'}</p>
                <p className="text-[10px] text-gray-500">Members</p>
              </div>
            </div>

            {/* WhatsApp status */}
            {detail.channels?.whatsapp && (
              <div className="bg-[#25D366]/8 border border-[#25D366]/20 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white">WhatsApp Connected</p>
                  <p className="text-[11px] text-gray-400 truncate">{detail.channels.whatsapp.config?.phone_number || detail.channels.whatsapp.config?.phone_number_id}</p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#25D366]/15 text-[#25D366]">Live</span>
              </div>
            )}

            {/* Team members */}
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Team Members</p>
              <div className="space-y-2">
                {(detail.team || []).length === 0 && <p className="text-xs text-gray-600">No members found.</p>}
                {(detail.team || []).map(m => (
                  <div key={m.id} className="flex items-center gap-3 bg-[var(--nyasa-surface-2)] rounded-xl px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-indigo-400">{(m.full_name || m.email || '?')[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{m.full_name || m.email}</p>
                      <p className="text-[10px] text-gray-500 truncate">{m.email}</p>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-gray-400 capitalize">{m.role || 'agent'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent conversations */}
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Recent Conversations</p>
              <div className="space-y-1.5">
                {(detail.recent_conversations || []).length === 0 && <p className="text-xs text-gray-600">No conversations yet.</p>}
                {(detail.recent_conversations || []).slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-[var(--nyasa-surface-2)] rounded-xl px-3 py-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.status === 'open' ? '#25D366' : c.status === 'resolved' ? '#6366F1' : '#F59E0B' }} />
                    <p className="text-xs text-white truncate flex-1">{c.contact_name}</p>
                    <p className="text-[10px] text-gray-600 shrink-0">{c.last_message ? c.last_message.slice(0, 30) + '…' : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
