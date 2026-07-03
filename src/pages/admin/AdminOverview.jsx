import { useEffect, useState } from 'react';
import { Loader2, Building2, Users, MessageSquare, DollarSign, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
      <div className="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/overview', {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load overview');
        setData(json);
      } catch (e) {
        console.error('[AdminOverview] load error:', e);
        setError(e.message || 'Failed to load overview');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>;
  }
  if (error) {
    return <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>;
  }

  const { totals, plan_breakdown, recent_workspaces } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Overview</h1>
        <p className="text-xs md:text-sm text-gray-400">Platform-wide stats across all Nyasadesk workspaces</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Building2} label="Workspaces" value={totals.workspaces} />
        <StatCard icon={Users} label="Users" value={totals.users} />
        <StatCard icon={MessageSquare} label="Conversations" value={totals.conversations} sub={`${totals.messages} messages`} />
        <StatCard icon={DollarSign} label="Est. MRR" value={`$${totals.mrr.toLocaleString()}`} />
      </div>

      <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 mb-8">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" /> Plan breakdown
        </h2>
        <div className="space-y-3">
          {Object.entries(plan_breakdown).map(([plan, info]) => (
            <div key={plan}>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{PLAN_LABEL[plan] || plan} · {info.count} workspace{info.count === 1 ? '' : 's'}</span>
                <span>${info.mrr}/mo</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${totals.workspaces ? (info.count / totals.workspaces) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Recent workspaces</h2>
          <Link to="/admin/workspaces" className="text-xs text-indigo-400 hover:underline">View all →</Link>
        </div>
        <div className="space-y-2">
          {recent_workspaces.length === 0 && <p className="text-xs text-gray-600">No workspaces yet.</p>}
          {recent_workspaces.map(w => (
            <div key={w.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{w.workspace_name || 'Untitled workspace'}</p>
                <p className="text-[11px] text-gray-500 capitalize">{w.subscription_status || 'active'}</p>
              </div>
              <span className="text-xs font-semibold text-gray-400">{PLAN_LABEL[w.plan] || w.plan}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
