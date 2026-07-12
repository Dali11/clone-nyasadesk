import { useState, useEffect } from 'react';
import {
  Plus, Loader2, Mail, MoreVertical, Shield, UserMinus,
  Users, Crown, UserCog, User as UserIcon, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, X,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// ── Role meta ──────────────────────────────────────────────────────────────
const ROLES = {
  admin: {
    label: 'Admin',
    desc: 'Full access — manage team, channels, billing, and all conversations',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    icon: UserCog,
  },
  sales_manager: {
    label: 'Sales Manager',
    desc: 'Can view all chats, manage sales records, and approve commissions',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    icon: Shield,
  },
  user: {
    label: 'Agent',
    desc: 'Handles assigned conversations — cannot change settings or roles',
    color: 'text-[var(--nyasa-text-muted)]',
    bg: 'bg-[var(--nyasa-surface-4)]',
    icon: UserIcon,
  },
};

const PLAN_SEAT_LIMITS = { starter: 2, growth: 5, scale: Infinity };

// ── Seat usage bar ─────────────────────────────────────────────────────────
function SeatBar({ used, limit }) {
  if (limit === Infinity) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const full = used >= limit;
  return (
    <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--nyasa-text)]">Team seats</span>
        <span className={`text-xs font-bold ${full ? 'text-red-400' : 'text-[#25D366]'}`}>
          {used} / {limit} used
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--nyasa-surface-4)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${full ? 'bg-red-500' : 'bg-[#25D366]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {full && (
        <p className="text-[11px] text-red-400 mt-2">
          Seat limit reached — upgrade your plan to invite more teammates.
        </p>
      )}
    </div>
  );
}

// ── Role badge ─────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const r = ROLES[role] || ROLES.user;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${r.color} ${r.bg}`}>
      {r.label}
    </span>
  );
}

// ── Invite form ────────────────────────────────────────────────────────────
function InviteForm({ onCancel, onSuccess, workspaceId }) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'user' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.email.trim()) return;
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          workspace_id: workspaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      onSuccess(form.email.trim());
    } catch (e) {
      setError(e?.message || 'Failed to send invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-[var(--nyasa-surface-4)] text-[var(--nyasa-text)] text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border border-[var(--nyasa-border)] placeholder:text-[var(--nyasa-text-muted)]';

  return (
    <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[#25D366]/40 p-4 space-y-3 mb-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-[var(--nyasa-text)] text-sm">Add Team Member</h3>
          <p className="text-[11px] text-[var(--nyasa-text-muted)] mt-0.5">
            We'll create their account and email a password-set link.
          </p>
        </div>
        <button onClick={onCancel} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--nyasa-text-muted)] hover:bg-[var(--nyasa-surface-4)]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <input className={inputCls} placeholder="Full name" type="text"
        value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
      <input className={inputCls} placeholder="Email address *" type="email"
        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        onKeyDown={e => e.key === 'Enter' && submit()} />

      {/* Role picker with descriptions */}
      <div className="space-y-1.5">
        {Object.entries(ROLES).map(([key, r]) => (
          <button
            key={key}
            onClick={() => setForm(f => ({ ...f, role: key }))}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
              form.role === key
                ? 'border-[#25D366]/60 bg-[#25D366]/10'
                : 'border-[var(--nyasa-border)] bg-[var(--nyasa-surface-3)] hover:border-[var(--nyasa-border)]'
            }`}
          >
            <r.icon className={`w-4 h-4 shrink-0 ${form.role === key ? '#25D366' : ''} ${r.color}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${form.role === key ? 'text-[#25D366]' : 'text-[var(--nyasa-text)]'}`}>{r.label}</p>
              <p className="text-[10px] text-[var(--nyasa-text-muted)] leading-tight mt-0.5">{r.desc}</p>
            </div>
            {form.role === key && (
              <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-[var(--nyasa-border)] text-[var(--nyasa-text-muted)] rounded-xl text-sm hover:bg-[var(--nyasa-surface-3)] transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={!form.email.trim() || loading}
          className="flex-1 py-2.5 bg-[#25D366] text-white font-bold rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[#20BA5A] transition-colors">
          {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : <><Mail className="w-3.5 h-3.5" /> Send Invite</>}
        </button>
      </div>
    </div>
  );
}

// ── Member card ────────────────────────────────────────────────────────────
function MemberCard({ u, currentUserId, workspaceId, canManage, onRoleChange, onRemove, onResendInvite }) {
  const isOwner = u.id === workspaceId;
  const isSelf  = u.id === currentUserId;
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const doResend = async () => {
    setResending(true);
    await onResendInvite(u);
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 3000);
  };

  return (
    <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] px-4 py-3.5 flex items-center gap-3">
      <Avatar name={u.full_name || u.email || '?'} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-[var(--nyasa-text)] text-sm truncate">{u.full_name || u.email}</p>
          {isSelf && (
            <span className="text-[9px] text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-full shrink-0">You</span>
          )}
          {isOwner && (
            <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
              <Crown className="w-2.5 h-2.5" /> Owner
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--nyasa-text-muted)] mt-0.5 truncate">{u.email}</p>
      </div>

      <RoleBadge role={u.role} />

      {/* Resend invite (only for members who haven't logged in yet — no avatar, no last_sign_in) */}
      {canManage && !isOwner && !isSelf && u.never_signed_in && (
        <button onClick={doResend} disabled={resending || resent}
          className="text-[10px] text-[var(--nyasa-text-muted)] hover:text-[#25D366] flex items-center gap-1 shrink-0 transition-colors disabled:opacity-50"
          title="Resend invite email"
        >
          {resent ? <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366]" /> : resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </button>
      )}

      {canManage && !isOwner && !isSelf && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--nyasa-text-muted)] hover:bg-[var(--nyasa-surface-4)] hover:text-[var(--nyasa-text)] shrink-0 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-[var(--nyasa-surface-3)] border-[var(--nyasa-border)] text-[var(--nyasa-text)]">
            <div className="px-3 py-2 border-b border-[var(--nyasa-border)]">
              <p className="text-[11px] font-semibold text-[var(--nyasa-text-muted)]">Change role</p>
            </div>
            {Object.entries(ROLES).map(([key, r]) => (
              u.role !== key && (
                <DropdownMenuItem key={key}
                  onClick={() => onRoleChange(u.id, key)}
                  className="text-xs gap-2 cursor-pointer hover:bg-[var(--nyasa-surface-4)] focus:bg-[var(--nyasa-surface-4)]">
                  <r.icon className={`w-3.5 h-3.5 ${r.color}`} /> Make {r.label}
                </DropdownMenuItem>
              )
            ))}
            <DropdownMenuSeparator className="bg-[var(--nyasa-border)]" />
            <DropdownMenuItem onClick={() => onRemove(u)}
              className="text-xs gap-2 text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer">
              <UserMinus className="w-3.5 h-3.5" /> Remove from team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TeamSection() {
  const { user, profile, workspaceOwnerId, loadingProfile } = useNyasaAuth();
  const workspaceId = workspaceOwnerId || profile?.workspace_id || user?.id;
  const canManage   = !profile?.workspace_id || profile?.role === 'admin';

  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast]       = useState(null); // { type: 'success'|'error', msg }
  const [filter, setFilter]     = useState('all'); // 'all' | 'admin' | 'sales_manager' | 'user'

  const plan = profile?.plan || 'starter';
  const seatLimit = PLAN_SEAT_LIMITS[plan] ?? 2;

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = async () => {
    // Wait for profile to be fully loaded before fetching — avoids hitting the
    // API with a stale or missing workspaceId on first render.
    if (loadingProfile) return;
    if (!workspaceId) { setLoading(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/team?workspace_id=${encodeURIComponent(workspaceId)}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team');
      // Mark members who've never signed in (last_sign_in_at null) as pending
      setUsers((data.users || []).map(u => ({
        ...u,
        never_signed_in: !u.last_sign_in_at,
      })));
    } catch (e) {
      console.error('[TeamSection] load error:', e);
      showToast('error', 'Could not load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [workspaceId, loadingProfile]);

  const handleInviteSuccess = (email) => {
    setShowForm(false);
    showToast('success', `Invite sent to ${email}`);
    loadUsers();
  };

  const handleRoleChange = async (memberId, newRole) => {
    setUsers(prev => prev.map(u => u.id === memberId ? { ...u, role: newRole } : u));
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', memberId);
      if (error) throw error;
      showToast('success', `Role updated to ${ROLES[newRole]?.label}`);
    } catch (e) {
      showToast('error', 'Failed to update role — try again');
      loadUsers();
    }
  };

  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from the team?\n\nThey'll lose access to this inbox but keep their account.`)) return;
    setUsers(prev => prev.filter(u => u.id !== member.id));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/team?action=remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ member_id: member.id, workspace_id: workspaceOwnerId }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Remove failed');
      showToast('success', `${member.full_name || member.email} removed`);
    } catch (e) {
      showToast('error', 'Failed to remove member: ' + e.message);
      loadUsers();
    }
  };

  const handleResendInvite = async (member) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          email: member.email,
          full_name: member.full_name || '',
          role: member.role,
          workspace_id: workspaceId,
          resend: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Resend failed');
      showToast('success', `Invite resent to ${member.email}`);
    } catch (e) {
      showToast('error', 'Could not resend invite');
    }
  };

  // Filtered + sorted list: owner first, then by role weight, then name
  const ROLE_WEIGHT = { admin: 0, sales_manager: 1, user: 2 };
  const filteredUsers = users
    .filter(u => filter === 'all' || u.role === filter)
    .sort((a, b) => {
      if (a.id === workspaceId) return -1;
      if (b.id === workspaceId) return 1;
      return (ROLE_WEIGHT[a.role] ?? 3) - (ROLE_WEIGHT[b.role] ?? 3) || (a.full_name || '').localeCompare(b.full_name || '');
    });

  const pendingCount = users.filter(u => u.never_signed_in && u.id !== workspaceId).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-1 ${
          toast.type === 'success'
            ? 'bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366]'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Seat usage */}
      <SeatBar used={users.filter(u => u.id !== workspaceId).length} limit={seatLimit} />

      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <p className="text-sm font-semibold text-[var(--nyasa-text)]">
            {users.filter(u => u.id !== workspaceId && u.role !== 'admin').length} agent{users.filter(u => u.id !== workspaceId && u.role !== 'admin').length !== 1 ? 's' : ''}
            {pendingCount > 0 && (
              <span className="ml-2 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-bold">
                {pendingCount} pending
              </span>
            )}
          </p>
          {/* Filter tabs */}
          <div className="flex gap-1 ml-auto">
            {[['all', 'All'], ['admin', 'Admins'], ['sales_manager', 'Sales'], ['user', 'Agents']].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  filter === key
                    ? 'bg-[#25D366] text-white'
                    : 'bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)]'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {canManage && !showForm && users.filter(u => u.id !== workspaceId).length < seatLimit && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white text-xs font-bold rounded-xl hover:bg-[#20BA5A] transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add Agent
          </button>
        )}
      </div>

      {/* Invite form */}
      {showForm && (
        <InviteForm
          workspaceId={workspaceId}
          onCancel={() => setShowForm(false)}
          onSuccess={handleInviteSuccess}
        />
      )}

      {/* Member list */}
      {filteredUsers.length > 0 ? (
        <div className="space-y-2">
          {filteredUsers.map(u => (
            <MemberCard
              key={u.id}
              u={u}
              currentUserId={user?.id}
              workspaceId={workspaceId}
              canManage={canManage}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
              onResendInvite={handleResendInvite}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-14 text-[var(--nyasa-text-muted)] text-sm">
          {filter === 'all' ? 'No team members yet. Invite someone!' : `No ${ROLES[filter]?.label}s in this workspace.`}
        </div>
      )}

      {/* Role legend (collapsible) */}
      <details className="mt-4">
        <summary className="text-[11px] text-[var(--nyasa-text-muted)] cursor-pointer hover:text-[var(--nyasa-text)] transition-colors flex items-center gap-1 list-none select-none">
          <ChevronDown className="w-3 h-3" /> What can each role do?
        </summary>
        <div className="mt-2 space-y-2">
          {Object.entries(ROLES).map(([key, r]) => (
            <div key={key} className="flex items-start gap-2.5 bg-[var(--nyasa-surface-2)] rounded-xl border border-[var(--nyasa-border)] px-3 py-2.5">
              <r.icon className={`w-4 h-4 shrink-0 mt-0.5 ${r.color}`} />
              <div>
                <p className={`text-xs font-semibold ${r.color}`}>{r.label}</p>
                <p className="text-[11px] text-[var(--nyasa-text-muted)] mt-0.5 leading-relaxed">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
