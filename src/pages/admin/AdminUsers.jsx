// src/pages/admin/AdminUsers.jsx
// User management — all individual users across all workspaces.
// Separated from AdminWorkspaces which handles workspace-level (owner) data.
import { useState, useEffect } from 'react';
import { Loader2, Search, Mail, Trash2, KeyRound, Users, Building2, ShieldCheck } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/components/ui/use-toast';

const ROLE_BADGE = {
  owner:         { label: 'Owner',         cls: 'bg-indigo-500/15 text-indigo-400' },
  admin:         { label: 'Admin',         cls: 'bg-purple-500/15 text-purple-400' },
  sales_manager: { label: 'Sales Mgr',     cls: 'bg-blue-500/15 text-blue-400'    },
  agent:         { label: 'Agent',         cls: 'bg-gray-500/15 text-gray-400'     },
};

export default function AdminUsers() {
  useDocumentTitle('Admin · Users');
  const { toast } = useToast();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [acting, setActing]   = useState(null); // userId currently being actioned

  const load = async () => {
    setLoading(true);
    try {
      const res  = await adminFetch('/api/admin/workspaces?resource=users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendPasswordReset = async (userId, email) => {
    setActing(userId);
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=users', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset_password', user_id: userId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reset');
      toast({ title: 'Reset email sent', description: `Sent to ${email}` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActing(null);
    }
  };

  const removeUser = async (userId, email) => {
    if (!window.confirm(`Remove ${email}? This cannot be undone.`)) return;
    setActing(userId);
    try {
      const res = await adminFetch('/api/admin/workspaces?resource=users', {
        method: 'DELETE',
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove user');
      toast({ title: 'User removed', description: email });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActing(null);
    }
  };

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.workspace_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Users</h1>
        <p className="text-xs md:text-sm text-gray-400">All individual users across every workspace</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">{error}</div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or workspace…"
          className="w-full bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-gray-600 py-20">No users found.</p>
          )}
          {filtered.map(u => {
            const roleBadge = ROLE_BADGE[u.role] || ROLE_BADGE.agent;
            const isActing  = acting === u.id;
            return (
              <div key={u.id} className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm">{u.full_name || '—'}</p>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${roleBadge.cls}`}>{roleBadge.label}</span>
                      {u.is_platform_admin && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 flex items-center gap-0.5">
                          <ShieldCheck className="w-2.5 h-2.5" /> Platform Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {u.email}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {u.workspace_name && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {u.workspace_name}
                        </p>
                      )}
                      {u.joined_at && (
                        <p className="text-[11px] text-gray-600">
                          Joined {new Date(u.joined_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={isActing}
                      onClick={() => sendPasswordReset(u.id, u.email)}
                      title="Send password reset email"
                      className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                    >
                      {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      disabled={isActing || u.is_platform_admin}
                      onClick={() => removeUser(u.id, u.email)}
                      title={u.is_platform_admin ? 'Cannot remove platform admins' : 'Remove user'}
                      className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
