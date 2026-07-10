import { useState, useEffect } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUS_CLS = {
  success: 'bg-[#25D366]/15 text-[#25D366]',
  pending: 'bg-yellow-500/15 text-yellow-400',
  failed:  'bg-red-500/15 text-red-400',
};

// Payment reconciliation view — the backend (?resource=transactions) has
// existed since the pricing-controls work; this is just its first frontend.
export default function AdminTransactions() {
  useDocumentTitle('Admin · Transactions');
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/workspaces?resource=transactions');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setTxns(data.transactions || []);
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
        <h1 className="text-xl md:text-2xl font-bold text-white">Transactions</h1>
        <p className="text-xs md:text-sm text-gray-400">Last 100 PayChangu payments across all workspaces</p>
      </div>

      {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : txns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <Receipt className="w-8 h-8 text-gray-700" />
          <p className="text-sm text-gray-500">No transactions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {txns.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-[var(--nyasa-surface-2)] rounded-xl border border-white/10 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t.workspace_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.plan_label} · {t.tx_ref}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{new Date(t.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-sm font-bold text-white">{t.currency} {Number(t.amount).toLocaleString()}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[t.status] || 'bg-gray-500/15 text-gray-400'}`}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
