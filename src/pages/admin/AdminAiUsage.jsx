import { useState, useEffect } from 'react';
import { Loader2, Bot, DollarSign } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// Platform-wide AI cost monitoring — Scale plan is flat-rate to the
// customer, so this exists purely so Nyasadesk itself can see if any one
// workspace's real OpenAI spend is disproportionate to what they're paying.
export default function AdminAiUsage() {
  useDocumentTitle('Admin · AI Usage');
  const [usage, setUsage] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/workspaces?resource=ai-usage');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setUsage(data.usage || []);
        setTotals(data.totals || null);
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
        <h1 className="text-xl md:text-2xl font-bold text-white">AI usage &amp; cost</h1>
        <p className="text-xs md:text-sm text-gray-400">Real OpenAI spend per workspace, last 30 days</p>
      </div>

      {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-4">
                <p className="text-[11px] text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total cost (30d)</p>
                <p className="text-xl font-bold text-white mt-1">${totals.cost_usd.toFixed(2)}</p>
              </div>
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-4">
                <p className="text-[11px] text-gray-500 flex items-center gap-1"><Bot className="w-3 h-3" /> AI replies (30d)</p>
                <p className="text-xl font-bold text-white mt-1">{totals.calls.toLocaleString()}</p>
              </div>
            </div>
          )}

          {usage.length === 0 ? (
            <p className="text-center text-gray-600 py-16">No AI usage in the last 30 days.</p>
          ) : (
            <div className="space-y-2">
              {usage.map(u => (
                <div key={u.workspace_id} className="flex items-center justify-between bg-[#202C33] rounded-xl border border-white/10 p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{u.workspace_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{u.calls} replies · {u.tokens.toLocaleString()} tokens</p>
                  </div>
                  <p className="text-sm font-bold text-[#25D366]">${u.cost.toFixed(3)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
