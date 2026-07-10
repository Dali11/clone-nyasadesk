import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, DollarSign, Check } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/components/ui/use-toast';

// Admin-editable monthly pricing per plan, backed by the plan_pricing DB
// table (see api/admin/workspaces.js ?resource=pricing). Changing a price
// here takes effect immediately everywhere that reads it: the public
// Pricing page, new checkouts, and the Overview MRR calc -- no deploy needed.
export default function AdminPricing() {
  const { toast } = useToast();
  useDocumentTitle('Admin · Pricing');
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deniedMsg, setDeniedMsg] = useState('');
  const [drafts, setDrafts] = useState({}); // plan -> string being edited
  const [saving, setSaving] = useState(null); // plan currently saving
  const [savedFlash, setSavedFlash] = useState(null); // plan that just saved (brief checkmark)

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=pricing');
      const data = await res.json();
      if (res.status === 403) {
        setDeniedMsg(data.error || 'Admin access required');
        setTimeout(() => navigate('/'), 2000);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load pricing');
      setPlans(data.plans || []);
      setDrafts(Object.fromEntries((data.plans || []).map(p => [p.plan, String(p.price_mwk)])));
    } catch (e) {
      console.error('[AdminPricing] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (plan) => {
    const raw = drafts[plan];
    const price_mwk = Number(raw);
    if (!Number.isFinite(price_mwk) || price_mwk < 0 || !Number.isInteger(price_mwk)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Enter a whole number (MWK), e.g. 30000' });
      return;
    }
    setSaving(plan);
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=pricing', {
        method: 'PATCH', body: JSON.stringify({ plan, price_mwk }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setPlans(prev => prev.map(p => p.plan === plan ? { ...p, price_mwk } : p));
      setSavedFlash(plan);
      setTimeout(() => setSavedFlash(cur => cur === plan ? null : cur), 1800);
    } catch (e) {
      console.error('[AdminPricing] save error:', e);
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to save price' });
    } finally {
      setSaving(null);
    }
  };

  if (deniedMsg) {
    return <div className="text-sm text-red-400 py-10 text-center">{deniedMsg}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-400" /> Pricing
        </h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          Set the monthly price per plan (MWK). Changes apply immediately to the public Pricing page, new checkouts, and MRR reporting.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(p => {
            const dirty = drafts[p.plan] !== String(p.price_mwk);
            return (
              <div key={p.plan} className="bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl p-5 flex flex-col gap-3">
                <div>
                  <p className="text-white font-semibold text-sm">{p.label}</p>
                  <p className="text-[11px] text-gray-500">Monthly price, in Malawi Kwacha</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm font-medium">K</span>
                  <input
                    type="number" min="0" step="1"
                    value={drafts[p.plan] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [p.plan]: e.target.value }))}
                    className="flex-1 bg-[var(--nyasa-surface-5)] border border-[var(--nyasa-border)] rounded-lg px-3 py-2 text-[var(--nyasa-text)] text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-gray-500 text-xs">/mo</span>
                </div>
                <button
                  onClick={() => save(p.plan)}
                  disabled={!dirty || saving === p.plan}
                  className="flex items-center justify-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  {saving === p.plan ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  ) : savedFlash === p.plan ? (
                    <><Check className="w-3.5 h-3.5" /> Saved</>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
