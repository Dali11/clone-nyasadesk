import { useState, useEffect } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const ACTION_LABEL = {
  workspace_update: 'Workspace updated',
  admin_added: 'Admin added',
  admin_removed: 'Admin removed',
};

function describeEntry(e) {
  if (e.action === 'workspace_update') {
    const u = e.details?.updates || {};
    const parts = [];
    if (u.plan) parts.push(`plan → ${u.plan}`);
    if (u.subscription_status) parts.push(`status → ${u.subscription_status}`);
    if (e.details?.extend_trial_days) parts.push(`+${e.details.extend_trial_days}d trial`);
    return parts.join(', ') || 'changes applied';
  }
  if (e.action === 'admin_added' || e.action === 'admin_removed') return e.details?.email || '';
  return '';
}

// Every suspend/reactivate, plan change, and admin-allowlist edit gets
// logged here — a plain accountability trail of who did what, when.
export default function AdminAuditLog() {
  useDocumentTitle('Admin · Audit Log');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/workspaces?resource=audit-log');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setEntries(data.entries || []);
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Audit log</h1>
        <p className="text-xs md:text-sm text-gray-400">Every admin action, most recent first</p>
      </div>

      {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <ScrollText className="w-8 h-8 text-gray-700" />
          <p className="text-sm text-gray-500">No admin actions logged yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(e => (
            <div key={e.id} className="flex items-center justify-between bg-[#202C33] rounded-xl border border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">
                  {ACTION_LABEL[e.action] || e.action}
                  {e.target_workspace_name && <span className="text-gray-500 font-normal"> · {e.target_workspace_name}</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{describeEntry(e)}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-[11px] text-gray-400">{e.admin_email}</p>
                <p className="text-[10px] text-gray-600">{new Date(e.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
