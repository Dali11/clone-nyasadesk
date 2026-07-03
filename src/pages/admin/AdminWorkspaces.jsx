import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, MessageSquare, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const PLAN_INFO = {
  starter: { label: 'Starter', price: '$10/mo', seats: 2 },
  growth:  { label: 'Growth',  price: '$20/mo', seats: 5 },
  scale:   { label: 'Scale',   price: '$99/mo', seats: 'Unlimited' },
};

// Formerly the whole of AdminPanel.jsx — now lives inside AdminLayout's
// shell (see src/pages/admin/AdminLayout.jsx), so it only renders its own
// content, not a full-page Sidebar wrapper.
export default function AdminWorkspaces() {
  useDocumentTitle('Admin · Workspaces');
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deniedMsg, setDeniedMsg] = useState('');
  const [updating, setUpdating] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/workspaces', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      if (res.status === 403) {
        setDeniedMsg(data.error || 'Admin access required');
        setTimeout(() => navigate('/'), 2000);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
      setWorkspaces(data.workspaces || []);
    } catch (e) {
      console.error('[AdminWorkspaces] load error:', e);
      setDeniedMsg(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changePlan = async (workspaceId, plan) => {
    setUpdating(workspaceId);
    setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, plan, seat_limit: PLAN_INFO[plan].seats } : w));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/workspaces', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ workspace_id: workspaceId, plan }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update plan');
    } catch (e) {
      console.error('[AdminWorkspaces] plan update error:', e);
      await load();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Workspaces</h1>
        <p className="text-xs md:text-sm text-gray-400">All Nyasadesk workspaces &amp; plans</p>
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
            return (
              <div key={w.id} className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{w.workspace_name || w.full_name || 'Untitled workspace'}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{w.email}</p>
                    {w.signed_up_at && (
                      <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Signed up {new Date(w.signed_up_at).toLocaleDateString()}
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
                        <option key={key} value={key}>{p.label} — {p.price}</option>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
