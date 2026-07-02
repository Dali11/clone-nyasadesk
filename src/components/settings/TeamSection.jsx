import { useState, useEffect } from 'react';
import { Plus, Loader2, Mail, MoreVertical, Shield, UserMinus } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export default function TeamSection() {
  const { user, profile, workspaceOwnerId } = useNyasaAuth();
  const workspaceId = workspaceOwnerId || profile?.workspace_id || user?.id;
  // Only the original workspace owner (no external workspace_id set on their
  // own profile) or someone explicitly given the 'admin' role can invite new
  // members, change roles, or remove people — matches the same check now
  // enforced server-side in /api/team/invite and via RLS (profiles_admin_manage),
  // so agents don't see controls that will just fail.
  const canManage = !profile?.workspace_id || profile?.role === 'admin';
  const canInvite = canManage;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'user' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadUsers = async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/team?workspace_id=${encodeURIComponent(workspaceId)}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team');
      setUsers(data.users || []);
    } catch (e) {
      console.error('[TeamSection] load error:', e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [workspaceId]);

  const handleInvite = async () => {
    if (!form.email.trim() || !workspaceId) return;
    setInviting(true);
    setError('');
    setSuccessMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ email: form.email.trim(), role: form.role, workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setSuccessMsg(`Invitation sent to ${form.email.trim()}`);
      setForm({ email: '', role: 'user' });
      setShowForm(false);
      await loadUsers();
    } catch (e) {
      setError(e?.message || 'Failed to send invite. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (memberId, newRole) => {
    setUsers(prev => prev.map(u => u.id === memberId ? { ...u, role: newRole } : u));
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', memberId);
      if (error) throw error;
    } catch (e) {
      console.error('[TeamSection] change role failed:', e);
      setError('Failed to update role — try again.');
      await loadUsers();
    }
  };

  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from the team? They'll keep their account but lose access to this shared inbox.`)) return;
    setUsers(prev => prev.filter(u => u.id !== member.id));
    try {
      // "Removing" someone just cuts them loose from this workspace — they
      // become the owner of their own (empty) workspace again, rather than
      // deleting their whole account.
      const { error } = await supabase.from('profiles').update({ workspace_id: null, role: 'admin' }).eq('id', member.id);
      if (error) throw error;
    } catch (e) {
      console.error('[TeamSection] remove member failed:', e);
      setError('Failed to remove member — try again.');
      await loadUsers();
    }
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-300">{users.length} member{users.length !== 1 ? 's' : ''}</p>
        {canInvite && (
          <button
            onClick={() => { setShowForm(true); setError(''); setSuccessMsg(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white text-xs font-bold rounded-xl hover:bg-[#20BA5A] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Invite
          </button>
        )}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 rounded-xl px-4 py-3 text-sm text-[#25D366]">
          <Mail className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {showForm && canInvite && (
        <div className="bg-[#202C33] rounded-2xl border border-[#25D366]/40 p-4 space-y-3">
          <h3 className="font-semibold text-white text-sm">Invite Team Member</h3>
          <input
            className={inputCls}
            placeholder="Email address *"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
          />
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0"
          >
            <option value="user">Agent</option>
            <option value="admin">Admin</option>
          </select>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setShowForm(false); setError(''); }}
              className="flex-1 py-2 border border-white/10 text-gray-300 rounded-xl text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={!form.email.trim() || inviting}
              className="flex-1 py-2 bg-[#25D366] text-white font-bold rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {inviting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : 'Send Invite'}
            </button>
          </div>
        </div>
      )}

      {users.map(u => {
        const isOwnerRow = u.id === workspaceId; // the row whose id === the workspace's own id is the original owner
        return (
        <div key={u.id} className="bg-[#202C33] rounded-2xl border border-white/10 px-4 py-3.5 flex items-center gap-3">
          <Avatar name={u.full_name || u.email || '?'} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white text-sm truncate">{u.full_name || u.email}</p>
              {u.id === user?.id && (
                <span className="text-[9px] text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-full shrink-0">You</span>
              )}
              {isOwnerRow && (
                <span className="text-[9px] text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded-full shrink-0">Owner</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{u.email}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${
            u.role === 'admin' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 bg-white/5'
          }`}>
            {u.role === 'admin' ? 'Admin' : 'Agent'}
          </span>
          {canManage && !isOwnerRow && u.id !== user?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white/10 hover:text-gray-300 shrink-0">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-[#233138] border-white/10 text-gray-200">
                {u.role === 'admin' ? (
                  <DropdownMenuItem onClick={() => handleChangeRole(u.id, 'user')} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                    <Shield className="w-3.5 h-3.5" />Make Agent
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleChangeRole(u.id, 'admin')} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                    <Shield className="w-3.5 h-3.5" />Make Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => handleRemove(u)} className="text-xs gap-2 text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer">
                  <UserMinus className="w-3.5 h-3.5" />Remove from team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        );
      })}

      {users.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">No team members yet. Invite someone!</div>
      )}
    </div>
  );
}
