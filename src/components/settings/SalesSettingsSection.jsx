import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { BadgeDollarSign, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';

export default function SalesSettingsSection({ workspaceOwnerId }) {
  const [enabled,  setEnabled]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [confirm,  setConfirm]  = useState(false);   // show disable confirmation
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!workspaceOwnerId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/billing?action=get-commission-settings`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const d = await res.json();
      setEnabled(!!d.enabled);
      setLoading(false);
    })();
  }, [workspaceOwnerId]);

  const save = async (val) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'save-commission-settings', enabled: val }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEnabled(val);
      setConfirm(false);
      toast({ title: val ? 'Commissions enabled' : 'Commissions disabled', description: val ? 'Your team can now earn commissions.' : 'Commission tracking is paused.' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = () => {
    if (enabled) {
      setConfirm(true);    // ask before disabling
    } else {
      save(true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--nyasa-text)] flex items-center gap-2">
          <BadgeDollarSign className="w-5 h-5 text-[#6366F1]" /> Sales
        </h2>
        <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">Configure sales commission settings for your workspace</p>
      </div>

      {/* Commission toggle card */}
      <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[var(--nyasa-text)]">Sales Commissions</p>
            <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">
              Automatically calculate and track agent commissions based on deal wins, invoices, and payments.
            </p>
          </div>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#6366F1] shrink-0" />
          ) : (
            <button
              onClick={handleToggle}
              disabled={saving}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-[#25D366]' : 'bg-[var(--nyasa-surface-3)]'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${enabled ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          {!enabled && <span className="text-xs text-[var(--nyasa-text-muted)]">Commission tracking is off. No records are being created.</span>}
        </div>
      </div>

      {/* Disable confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(false)} />
          <div className="relative bg-[var(--nyasa-surface-1)] border border-[var(--nyasa-border)] rounded-2xl p-6 max-w-sm w-full shadow-2xl z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              </div>
              <h3 className="font-bold text-[var(--nyasa-text)]">Disable Commissions?</h3>
            </div>
            <p className="text-sm text-[var(--nyasa-text-muted)] mb-5">
              Commission tracking will stop. Existing records are preserved but no new commissions will be generated. You can re-enable at any time.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(false)} className="px-4 py-2 rounded-xl text-sm text-[var(--nyasa-text-muted)] hover:bg-[var(--nyasa-surface-3)]">Cancel</button>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-3 h-3 animate-spin" />} Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link to manage policies when enabled */}
      {enabled && (
        <button onClick={() => navigate('/admin/commissions')}
          className="w-full flex items-center justify-between rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-4 hover:bg-[var(--nyasa-surface-3)] transition-colors group">
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--nyasa-text)]">Manage Commission Policies</p>
            <p className="text-xs text-[var(--nyasa-text-muted)]">Create tiers, assign policies to agents, approve payouts</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--nyasa-text-muted)] group-hover:text-[#6366F1] transition-colors" />
        </button>
      )}
    </div>
  );
}
