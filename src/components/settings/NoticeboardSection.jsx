import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Pin, PinOff, Trash2, Edit2, Plus, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/Avatar';

/* ─── helpers ─────────────────────────────────────────────── */
function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TAG_COLORS = {
  rule:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Rule'    },
  update:  { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Update'  },
  urgent:  { bg: 'bg-red-500/10',    text: 'text-red-400',    label: 'Urgent'  },
  info:    { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Info'    },
  general: { bg: 'bg-gray-500/10',   text: 'text-gray-400',   label: 'General' },
};

/* ─── PostForm ─────────────────────────────────────────────── */
function PostForm({ workspaceOwnerId, currentUser, onSave, onCancel, initial }) {
  const [body, setBody]     = useState(initial?.body || '');
  const [tag,  setTag]      = useState(initial?.tag  || 'general');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const handle = async () => {
    if (!body.trim()) { setErr('Write something first.'); return; }
    setSaving(true); setErr('');
    try {
      if (initial?.id) {
        const { error } = await supabase.from('workspace_notices')
          .update({ body: body.trim(), tag, updated_at: new Date().toISOString() })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workspace_notices').insert({
          workspace_id: workspaceOwnerId,
          body: body.trim(),
          tag,
          author_id:   currentUser?.id,
          author_name: currentUser?.full_name || currentUser?.email || 'Admin',
          pinned: false,
        });
        if (error) throw error;
      }
      onSave();
    } catch (e) {
      setErr(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(TAG_COLORS).map(([key, val]) => (
          <button key={key} onClick={() => setTag(key)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all
              ${tag === key
                ? `${val.bg} ${val.text} border-current`
                : 'border-[var(--nyasa-border)] text-[var(--nyasa-text-muted)] hover:border-gray-500'}`}>
            {val.label}
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        placeholder="Write your notice, rule or update…"
        value={body}
        onChange={e => setBody(e.target.value)}
        className="w-full bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--nyasa-text)] placeholder-[var(--nyasa-text-muted)] resize-none focus:outline-none focus:border-[#6366F1]"
      />

      {err && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs text-[var(--nyasa-text-muted)] hover:bg-[var(--nyasa-surface-3)] transition-colors flex items-center gap-1">
          <X className="w-3 h-3" /> Cancel
        </button>
        <button onClick={handle} disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors flex items-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {initial?.id ? 'Save' : 'Post'}
        </button>
      </div>
    </div>
  );
}

/* ─── NoticeCard ───────────────────────────────────────────── */
function NoticeCard({ notice, canPost, onPin, onDelete, onEdit }) {
  const tc = TAG_COLORS[notice.tag] || TAG_COLORS.general;

  return (
    <div className={`rounded-2xl border bg-[var(--nyasa-surface-2)] p-4 space-y-2 transition-all
      ${notice.pinned ? 'border-[#6366F1]/50 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]' : 'border-[var(--nyasa-border)]'}`}>

      {/* top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tc.bg} ${tc.text}`}>
            {tc.label}
          </span>
          {notice.pinned && (
            <span className="flex items-center gap-1 text-[10px] text-[#6366F1] font-semibold">
              <Pin className="w-2.5 h-2.5" /> Pinned
            </span>
          )}
        </div>

        {canPost && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onPin(notice)} title={notice.pinned ? 'Unpin' : 'Pin to top'}
              className="p-1.5 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-[#6366F1] transition-colors">
              {notice.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onEdit(notice)} title="Edit"
              className="p-1.5 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-blue-400 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(notice.id)} title="Delete"
              className="p-1.5 rounded-lg hover:bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* body */}
      <p className="text-sm text-[var(--nyasa-text)] whitespace-pre-wrap leading-relaxed">{notice.body}</p>

      {/* footer */}
      <div className="flex items-center gap-2 pt-1">
        <Avatar name={notice.author_name} size="xs" />
        <span className="text-xs text-[var(--nyasa-text-muted)]">
          {notice.author_name} · {timeAgo(notice.created_at)}
          {notice.updated_at && notice.updated_at !== notice.created_at && ' · edited'}
        </span>
      </div>
    </div>
  );
}

/* ─── NoticeboardSection ───────────────────────────────────── */
export default function NoticeboardSection({ workspaceOwnerId, canPost, currentUser }) {
  const [notices,  setNotices]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);   // notice being edited

  const load = useCallback(async () => {
    if (!workspaceOwnerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('workspace_notices')
      .select('*')
      .eq('workspace_id', workspaceOwnerId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error) setNotices(data || []);
    setLoading(false);
  }, [workspaceOwnerId]);

  useEffect(() => { load(); }, [load]);

  // Real-time updates
  useEffect(() => {
    if (!workspaceOwnerId) return;
    const sub = supabase
      .channel('notices:' + workspaceOwnerId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_notices',
        filter: `workspace_id=eq.${workspaceOwnerId}` }, () => load())
      .subscribe();
    return () => sub.unsubscribe();
  }, [workspaceOwnerId, load]);

  const handlePin = async (notice) => {
    await supabase.from('workspace_notices')
      .update({ pinned: !notice.pinned })
      .eq('id', notice.id);
    load();
  };

  const handleDelete = async (id) => {
    await supabase.from('workspace_notices').delete().eq('id', id);
    load();
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--nyasa-text)] flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#6366F1]" /> Noticeboard
          </h2>
          <p className="text-sm text-[var(--nyasa-text-muted)] mt-0.5">
            {canPost ? 'Post workspace updates, rules, and announcements for your team.' : 'Workspace updates and rules from your managers.'}
          </p>
        </div>
        {canPost && !showForm && !editing && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6366F1] text-white text-sm font-semibold hover:bg-[#4F46E5] transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Post
          </button>
        )}
      </div>

      {/* new post form */}
      {showForm && (
        <PostForm
          workspaceOwnerId={workspaceOwnerId}
          currentUser={currentUser}
          onSave={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* notices list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Megaphone className="w-10 h-10 mx-auto text-[var(--nyasa-text-muted)] opacity-30" />
          <p className="text-sm text-[var(--nyasa-text-muted)]">No notices yet.</p>
          {canPost && <p className="text-xs text-[var(--nyasa-text-muted)]">Post the first one for your team.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => (
            editing?.id === n.id ? (
              <PostForm
                key={n.id}
                workspaceOwnerId={workspaceOwnerId}
                currentUser={currentUser}
                initial={n}
                onSave={handleSaved}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <NoticeCard
                key={n.id}
                notice={n}
                canPost={canPost}
                onPin={handlePin}
                onDelete={handleDelete}
                onEdit={setEditing}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
