import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, MessageSquare, Calendar, Clock, Crown, Plus, Lock, Unlock, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

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
  useDocumentTitle('Admin · Workspaces');
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deniedMsg, setDeniedMsg] = useState('');
  const [updating, setUpdating] = useState(null);
  const [pricing, setPricing] = useState({}); // plan -> price_mwk, live from admin/pricing
  const [viewingId, setViewingId] = useState(null); // workspace_id currently open in the detail modal

  const authedHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  const load = async () => {
    setLoading(true);
    try {
      const headers = await authedHeaders();
      const res = await fetch('/api/admin/workspaces', { headers });
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
      fetch('/api/admin/workspaces?resource=pricing', { headers })
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

  const patchWorkspace = async (workspaceId, updates) => {
    setUpdating(workspaceId);
    try {
      const headers = await authedHeaders();
      const res = await fetch('/api/admin/workspaces', {
        method: 'PATCH', headers,
        body: JSON.stringify({ workspace_id: workspaceId, ...updates }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      await load();
    } catch (e) {
      console.error('[AdminWorkspaces] update error:', e);
      window.alert(e.message);
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
              <div key={w.id} className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
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
                      className="bg-[#2A3942] text-white text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 border-0 disabled:opacity-50"
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

                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/5">
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
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
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
                  <button onClick={() => setViewingId(w.id)}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition-colors ml-auto">
                    <Eye className="w-3 h-3" /> View details
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = { Authorization: `Bearer ${session?.access_token || ''}` };
        const res = await fetch(`/api/admin/workspaces?resource=workspace-detail&workspace_id=${workspaceId}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load workspace detail');
        setData(json);
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2530] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">
            {data?.workspace?.workspace_name || data?.workspace?.full_name || 'Workspace'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Team ({data.team.length})</p>
              <div className="space-y-1">
                {data.team.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white">{t.full_name || 'Unnamed'}</span>
                    <span className="text-gray-500 capitalize">{t.role}</span>
                  </div>
                ))}
                {data.team.length === 0 && <p className="text-xs text-gray-600">No team members</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Recent conversations</p>
              <div className="space-y-1">
                {data.recent_conversations.map(cvo => (
                  <div key={cvo.id} className="text-xs bg-white/5 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-semibold">{cvo.contact_name || 'Unknown'}</span>
                      <span className="text-gray-500 capitalize">{cvo.channel}</span>
                    </div>
                    <p className="text-gray-500 truncate mt-0.5">{cvo.last_message || '—'}</p>
                  </div>
                ))}
                {data.recent_conversations.length === 0 && <p className="text-xs text-gray-600">No conversations yet</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">AI agents</p>
              <div className="space-y-1">
                {data.ai_agents.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white">{a.name}</span>
                    <span className={a.status === 'active' ? 'text-[#25D366]' : 'text-yellow-400'}>{a.status}</span>
                  </div>
                ))}
                {data.ai_agents.length === 0 && <p className="text-xs text-gray-600">No AI agents configured</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Recent transactions</p>
              <div className="space-y-1">
                {data.recent_transactions.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white capitalize">{t.plan} · {t.currency} {Number(t.amount).toLocaleString()}</span>
                    <span className="text-gray-500 capitalize">{t.status}</span>
                  </div>
                ))}
                {data.recent_transactions.length === 0 && <p className="text-xs text-gray-600">No transactions yet</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
