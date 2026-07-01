import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, Users, MessageSquare, Calendar } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const PLAN_INFO = {
  starter: { label: 'Starter', price: '$10/mo', seats: 2 },
  growth:  { label: 'Growth',  price: '$20/mo', seats: 5 },
  scale:   { label: 'Scale',   price: '$99/mo', seats: 'Unlimited' },
};

// Platform-admin-only page (see platform_admin_emails table). Every request
// re-verifies the caller server-side in /api/admin/workspaces — the nav link
// being hidden for non-admins is just UX, not the real security boundary.
export default function AdminPanel() {
  useDocumentTitle('Admin Panel');
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
      console.error('[AdminPanel] load error:', e);
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
      console.error('[AdminPanel] plan update error:', e);
      await load();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#25D366]/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#25D366]" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-xs md:text-sm text-gray-400">All Nyasadesk workspaces &amp; plans</p>
            </div>
          </div>

          {deniedMsg && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">
              {deniedMsg}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-[#25D366] animate-spin" /></div>
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
                          className="bg-[#2A3942] text-white text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 disabled:opacity-50"
                        >
                          {Object.entries(PLAN_INFO).map(([key, p]) => (
                            <option key={key} value={key}>{p.label} — {p.price}</option>
                          ))}
                        </select>
                        {updating === w.id && <Loader2 className="w-3.5 h-3.5 text-[#25D366] animate-spin" />}
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
      </div>
    </div>
  );
}
