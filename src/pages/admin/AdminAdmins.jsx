import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// Manage the platform_admin_emails allowlist that api/_lib/adminAuth.js
// checks on every /api/admin/* request. An admin can never remove their own
// email here — server-side guarded too, see api/admin/admins.js.
export default function AdminAdmins() {
  useDocumentTitle('Admin · Admins');
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [myEmail, setMyEmail] = useState('');



  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setMyEmail(user?.email || '');
      const res = await adminFetch('/api/admin/workspaces?resource=admins');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load admins');
      setAdmins(data.admins || []);
    } catch (e) {
      console.error('[AdminAdmins] load error:', e);
      setError(e.message || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addAdmin = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=admins', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add admin');
      setNewEmail('');
      await load();
    } catch (e2) {
      console.error('[AdminAdmins] add error:', e2);
      setError(e2.message || 'Failed to add admin');
    } finally {
      setSaving(false);
    }
  };

  const removeAdmin = async (email) => {
    setRemoving(email);
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=admins', {
        method: 'DELETE',
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove admin');
      await load();
    } catch (e) {
      console.error('[AdminAdmins] remove error:', e);
      setError(e.message || 'Failed to remove admin');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Admins</h1>
        <p className="text-xs md:text-sm text-gray-400">Who has platform-admin access to Nyasadesk</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>
      )}

      <form onSubmit={addAdmin} className="flex gap-2 mb-6">
        <input
          type="email"
          required
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 bg-[#202C33] text-white text-sm rounded-xl px-4 py-2.5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-gray-600"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : (
        <div className="bg-[#202C33] rounded-2xl border border-white/10 divide-y divide-white/5">
          {admins.length === 0 && <p className="text-center text-gray-600 py-10 text-sm">No admins yet.</p>}
          {admins.map(a => (
            <div key={a.email} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{a.email}</p>
                  {a.created_at && <p className="text-[11px] text-gray-500">Added {new Date(a.created_at).toLocaleDateString()}</p>}
                </div>
              </div>
              <button
                onClick={() => removeAdmin(a.email)}
                disabled={removing === a.email || a.email === myEmail}
                title={a.email === myEmail ? "You can't remove yourself" : 'Remove admin access'}
                className="text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors p-1.5"
              >
                {removing === a.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
