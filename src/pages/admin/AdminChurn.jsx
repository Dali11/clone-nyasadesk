import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const URGENCY_STYLE = {
  3: 'bg-red-500/15 text-red-400 border-red-500/20',
  2: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  1: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

// At-risk workspace radar — surfaces expired/expiring trials, past-due
// billing, and gone-quiet paying workspaces so an admin can proactively
// reach out before they churn, instead of finding out after cancellation.
export default function AdminChurn() {
  useDocumentTitle('Admin · Churn');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = { Authorization: `Bearer ${session?.access_token || ''}` };
        const res = await fetch('/api/admin/workspaces?resource=churn', { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setRows(data.at_risk || []);
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
        <h1 className="text-xl md:text-2xl font-bold text-white">Churn &amp; at-risk</h1>
        <p className="text-xs md:text-sm text-gray-400">Workspaces likely to lapse or cancel — reach out before they do</p>
      </div>

      {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <AlertTriangle className="w-8 h-8 text-gray-700" />
          <p className="text-sm text-gray-500">Nothing at risk right now — clean bill of health.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className={`flex items-center justify-between rounded-xl border p-4 ${URGENCY_STYLE[r.urgency] || URGENCY_STYLE[1]}`}>
              <div>
                <p className="text-sm font-semibold text-white">{r.workspace_name}</p>
                <p className="text-xs mt-0.5 opacity-80">{r.reason}</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-black/20 shrink-0">{r.plan}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
