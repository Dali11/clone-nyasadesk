import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, Loader2, MessageSquareOff, Pin, Pencil } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ConvList from '@/components/inbox/ConvList';
import ChatHeader from '@/components/inbox/ChatHeader';
import MessageThread from '@/components/inbox/MessageThread';
import ContactPanel from '@/components/inbox/ContactPanel';
import NewConvModal from '@/components/inbox/NewConvModal';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { useToast } from '@/components/ui/use-toast';
import { getConversations, updateConversation, deleteConversation, subscribeToConversations, getPinnedConvs, createInternalConv, pinConversation, unpinConversation, getTeamMembers, resolveUnknownContacts } from '@/lib/channels';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUS_TABS = [
  { key: 'all',        label: 'All'        },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'open',       label: 'Open'       },
  { key: 'snoozed',    label: 'Snoozed'    },
  { key: 'closed',     label: 'Closed'     },
  { key: 'mine',       label: 'Mine'       },
];

const CHANNELS_FILTER = ['all', 'whatsapp', 'website'];

export default function Inbox() {
  useDocumentTitle('Inbox');
  const { user, profile, workspaceOwnerId, canViewAllChats } = useNyasaAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null);
  const [filter, setFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [pinnedConvs, setPinnedConvs] = useState([]);
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxTimeout = useRef(null);

  // Deep-link from push notification: ?conv=<id> → auto-open that conversation
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('conv');
    if (!convId || !conversations.length) return;
    const target = conversations.find(c => c.id === convId);
    if (target && (!activeConv || activeConv.id !== convId)) {
      setActiveConv(target);
    }
  }, [location.search, conversations]);
  const [showInternalMsg, setShowInternalMsg] = useState(false);
  const [dmMembers, setDmMembers] = useState([]);
  const [internalRecipient, setInternalRecipient] = useState('');
  const [internalMessage, setInternalMessage] = useState('');
  const [sendingInternal, setSendingInternal] = useState(false);
  const [pinPickerConv, setPinPickerConv] = useState(null); // conv being pinned
  // Real team roster for the "Assign to" menu — this used to just be the
  // current user, so you could never actually assign a conversation to a
  // teammate from the chat header, only to yourself.
  const [teamUsers, setTeamUsers] = useState([]);

  const loadConversations = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      // Agents only see their assigned chats — pass their userId as agentId filter.
      // Admins and Sales Managers get everything (no agentId filter).
      const filters = canViewAllChats ? {} : { agentId: user?.id };
      const data = await getConversations(workspaceOwnerId, filters);
      // Auto-resolve: match phone numbers against saved contacts for proper names
      const resolved = await resolveUnknownContacts(workspaceOwnerId, data).catch(() => data);
      setConversations(resolved);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceOwnerId, canViewAllChats, user?.id]);

  // Initial load
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load the real team roster once, for the chat header's "Assign to" menu
  useEffect(() => {
    if (!workspaceOwnerId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/team?workspace_id=${encodeURIComponent(workspaceOwnerId)}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        if (res.ok) {
          setTeamUsers((data.users || []).map(u => ({ id: u.id, full_name: u.full_name || u.email || 'Teammate' })));
        }
      } catch (e) {
        console.error('[Inbox] failed to load team roster:', e);
      }
    })();
  }, [workspaceOwnerId]);

  // Load pinned conversations for the current user
  const loadPinnedConversations = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const pins = await getPinnedConvs(workspaceOwnerId, session?.access_token);
      setPinnedConvs(pins);
    } catch (e) {
      console.error('[Inbox] failed to load pinned conversations:', e);
    }
  }, [workspaceOwnerId]);

  useEffect(() => { loadPinnedConversations(); }, [loadPinnedConversations]);

  // Realtime subscription. IMPORTANT: don't blindly refetch the whole list
  // on every event -- opening a chat itself writes unread_count/last_read_at
  // (see handleSelect below), which fires this exact subscription right as
  // you tap into a conversation. A full loadConversations() there re-fetches
  // + re-renders (with AnimatePresence fade) the ENTIRE list at that exact
  // moment, which is what caused chats to visibly "jam"/flash open instead
  // of opening instantly. For UPDATE events we just merge the changed row
  // into local state directly (the raw DB row still has every field the
  // list/header render off -- contact_name etc. come from the join done at
  // load time, and merging only overwrites matching keys, so they're kept).
  // Full reloads are reserved for INSERT/DELETE, which are rare and do need
  // the joined contact data (or removal) a merge can't provide.
  useEffect(() => {
    if (!workspaceOwnerId) return;
    const sub = subscribeToConversations(workspaceOwnerId, (payload) => {
      if (payload?.eventType === 'UPDATE' && payload.new?.id) {
        // For agents: if a conversation gets assigned away from them, remove it from the list.
        // If it gets assigned to them, trigger a full reload to pull in the joined contact data.
        if (!canViewAllChats) {
          const isNowMine = payload.new?.assigned_to === user?.id;
          // Check if this conv is already in our local list
          const isInList = (prev) => prev.some(c => c.id === payload.new.id);
          if (!isNowMine) {
            // Not assigned to me — remove from list if it was there (reassigned away)
            setConversations(prev => {
              if (!isInList(prev)) return prev; // wasn't in list anyway
              return prev.filter(c => c.id !== payload.new.id);
            });
            setActiveConv(prev => (prev?.id === payload.new.id ? null : prev));
            return;
          }
          // isNowMine — if not in list yet, reload to get full joined contact data
          setConversations(prev => {
            if (!isInList(prev)) { loadConversations(); return prev; }
            return prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c);
          });
          setActiveConv(prev => (prev?.id === payload.new.id ? { ...prev, ...payload.new } : prev));
          return;
        }
        setConversations(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
        setActiveConv(prev => (prev?.id === payload.new.id ? { ...prev, ...payload.new } : prev));
      } else {
        loadConversations();
      }
    });
    return () => sub?.unsubscribe?.();
  }, [workspaceOwnerId, loadConversations, canViewAllChats, user?.id]);

  const filtered = conversations.filter(c => {
    // Exclude internal conversations from the main list — they only appear
    // in the Pinned section or when explicitly navigated to
    if (c.channel === 'internal' && !(activeConv?.channel === 'internal' && activeConv?.id === c.id)) return false;
    if (filter === 'unassigned' && c.assigned_to) return false;
    if (filter === 'mine' && c.assigned_to !== user?.id) return false;
    if (filter === 'open' && c.status !== 'open' && c.status !== 'unassigned') return false;
    if (filter === 'snoozed' && c.status !== 'snoozed') return false;
    if (filter === 'closed' && c.status !== 'closed') return false;
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (c.contact?.full_name || c.subject || '').toLowerCase();
      return name.includes(q) || (c.last_message || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Keep the installed PWA's home-screen icon badge in sync with the real
  // unread count whenever the list changes (new message arrives, or the
  // user opens a chat and it gets marked read) -- not just when a push
  // notification fires, so the badge reflects reality even if you never
  // left the app open through a background push at all.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const unread = conversations.filter(c => c.unread_count > 0).length;
    (unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
  }, [conversations]);

  const counts = {
    all:        conversations.length,
    unassigned: conversations.filter(c => !c.assigned_to).length,
    open:       conversations.filter(c => c.status === 'open' || c.status === 'unassigned').length,
    snoozed:    conversations.filter(c => c.status === 'snoozed').length,
    closed:     conversations.filter(c => c.status === 'closed').length,
    mine:       conversations.filter(c => c.assigned_to === user?.id).length,
  };

  const handleConvUpdate = (updates) => {
    setActiveConv(prev => {
      // Fire a toast when a conversation is assigned to someone
      if (updates.assigned_to_name && updates.assigned_to_name !== prev?.assigned_to_name) {
        toast({
          title: `Assigned to ${updates.assigned_to_name.split(' ')[0]}`,
          description: `${prev?.contact_name || 'This chat'} is now handled by ${updates.assigned_to_name}`,
          duration: 4000,
        });
      } else if (updates.assigned_to === null && prev?.assigned_to) {
        toast({ title: 'AI automation resumed', duration: 3000 });
      }
      return { ...prev, ...updates };
    });
    setConversations(prev => prev.map(c => c.id === updates.id ? { ...c, ...updates } : c));
    updateConversation(updates.id, updates).catch(e => console.error('[Inbox] failed to update conversation:', e));
  };

  const handleBulkAction = async ({ ids, action, payload }) => {
    if (!ids.length) return;
    try {
      if (action === 'assign') {
        await Promise.all(ids.map(id =>
          updateConversation(id, { assigned_to: payload.userId, assigned_to_name: payload.userName, status: 'open' })
        ));
        setConversations(prev => prev.map(c =>
          ids.includes(c.id) ? { ...c, assigned_to: payload.userId, assigned_to_name: payload.userName, status: 'open' } : c
        ));
        toast({ title: `${ids.length} chat${ids.length !== 1 ? 's' : ''} assigned to ${payload.userName.split(' ')[0]}`, duration: 3500 });
      } else if (action === 'status') {
        await Promise.all(ids.map(id => updateConversation(id, { status: payload.status })));
        setConversations(prev => prev.map(c =>
          ids.includes(c.id) ? { ...c, status: payload.status } : c
        ));
        toast({ title: `${ids.length} chat${ids.length !== 1 ? 's' : ''} marked ${payload.status}`, duration: 3000 });
      } else if (action === 'delete') {
        await Promise.all(ids.map(id => deleteConversation(id)));
        setConversations(prev => prev.filter(c => !ids.includes(c.id)));
        if (ids.includes(activeConv?.id)) setActiveConv(null);
        toast({ title: `${ids.length} conversation${ids.length !== 1 ? 's' : ''} deleted`, duration: 3000 });
      }
    } catch (e) {
      console.error('[Inbox] bulk action failed:', e);
      toast({ title: 'Action failed', description: e.message, duration: 4000 });
    }
  };

  const handleSendInternalMsg = async () => {
    if (!internalRecipient || !internalMessage.trim() || !workspaceOwnerId) return;
    setSendingInternal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await createInternalConv(workspaceOwnerId, internalRecipient, internalMessage.trim(), session?.access_token);
      // Reload conversations and pinned list
      await loadConversations();
      await loadPinnedConversations();
      setShowInternalMsg(false);
      setInternalRecipient('');
      setInternalMessage('');
      // Open the new internal conversation
      if (result?.conversation) {
        const conv = result.conversation;
        setActiveConv({ ...conv, contact_name: conv.contact_name, channel: 'internal' });
      }
    } catch (e) {
      console.error('[Inbox] failed to send internal message:', e);
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to send internal message' });
    } finally {
      setSendingInternal(false);
    }
  };

  const handlePinForAgent = async (agentId) => {
    if (!pinPickerConv || !workspaceOwnerId || !agentId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await pinConversation(workspaceOwnerId, pinPickerConv.id, agentId, session?.access_token);
      await loadPinnedConversations();
      setPinPickerConv(null);
    } catch (e) {
      console.error('[Inbox] failed to pin conversation:', e);
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to pin conversation' });
    }
  };

  const handleUnpin = async () => {
    if (!activeConv || !workspaceOwnerId || !user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await unpinConversation(workspaceOwnerId, activeConv.id, user.id, session?.access_token);
      await loadPinnedConversations();
    } catch (e) {
      console.error('[Inbox] failed to unpin conversation:', e);
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to unpin conversation' });
    }
  };

  const handleLoadDmMembers = async () => {
    if (!workspaceOwnerId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const members = await getTeamMembers(workspaceOwnerId, session?.access_token);
      setDmMembers(members);
    } catch (e) {
      console.error('[Inbox] failed to load DM members:', e);
    }
  };

  const handleSelect = async (conv) => {
    setActiveConv(conv);
    setContactOpen(false); // reset the contact-info overlay whenever a different chat is opened
    // Always stamp last_read_at on open — this is what flips a website
    // visitor's own sent-message ticks from single-grey ("sent") to
    // double-blue ("read") in the widget, mirroring real WhatsApp semantics.
    const now = new Date().toISOString();
    const patch = conv.unread_count > 0 ? { unread_count: 0, last_read_at: now } : { last_read_at: now };
    await updateConversation(conv.id, patch).catch(e => console.error('[Inbox] failed to mark conversation read:', e));
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, ...patch } : c));
  };

  const handleDelete = async (id) => {
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      setActiveConv(prev => (prev?.id === id ? null : prev));
    } catch (e) {
      console.error('[Inbox] failed to delete conversation:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete this conversation. You may not have permission.' });
    }
  };

  const showChat = !!activeConv;

  return (
    // The reserved pt-14/pb-[56px] mobile padding exists for Sidebar's own
    // fixed top bar ("Nyasadesk" branding) + bottom tab bar. Once a chat is
    // open on mobile, both are hidden (see hideMobileChrome below) and
    // ChatHeader/the composer become the real top/bottom chrome instead --
    // so drop the reserved space too, or you'd get a blank gap where the
    // Nyasadesk bar used to be, exactly like WhatsApp's own conversation view
    // has zero app-chrome above/below the open chat.
    <div className={`flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] md:pt-0 md:pb-0 ${showChat ? '' : 'pt-14 pb-[56px]'}`}>
      <Sidebar hideMobileChrome={showChat} />

      {/* Conversation list — hidden on mobile when chat is open */}
      <div className={`flex flex-col bg-[var(--nyasa-surface-1)] border-r border-[var(--nyasa-border)]
        w-full md:w-80 lg:w-96 shrink-0 md:flex
        ${showChat ? 'hidden' : 'flex'}`}>

        {/* Status filter tabs — Sidebar top bar is the only branding chrome */}
        <div className="px-3 pt-2 pb-1 shrink-0">
          {/* Status tabs */}
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all
                  ${filter === t.key ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.label}
                {counts[t.key] > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-[#25D366]/30 text-[#25D366]' : 'bg-white/10 text-gray-400'}`}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Channel filter */}
          <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-none pb-1">
            {CHANNELS_FILTER.map(ch => (
              <button key={ch} onClick={() => setChannelFilter(ch)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize whitespace-nowrap transition-all
                  ${channelFilter === ch ? 'bg-[var(--nyasa-surface-4)] text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Pinned conversations section */}
          {pinnedConvs.length > 0 && (
            <div>
              <div className="px-4 py-1.5 flex items-center gap-1.5">
                <Pin className="w-3 h-3 text-[#25D366]" />
                <span className="text-[10px] font-semibold text-[#25D366] uppercase tracking-wide">Pinned</span>
              </div>
              {pinnedConvs.map(pc => {
                const conv = pc.conversation;
                if (!conv) return null;
                const normalized = {
                  ...conv,
                  contact_name: conv.contact_name || 'Internal',
                  last_message_preview: conv.last_message || '',
                  unread: (conv.unread_count || 0) > 0,
                };
                return (
                  <ConvRow key={pc.conversation_id} conv={normalized} active={activeConv?.id === conv.id} onClick={handleSelect} pinned />
                );
              })}
              <div className="border-b border-[var(--nyasa-border)] mx-4 mb-1" />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <MessageSquareOff className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-600">Connect a channel in Settings to start receiving messages.</p>
              {/* Hint if this looks like a mis-linked account */}
              {!profile?.workspace_id && user?.email && conversations.length === 0 && (
                <p className="text-[11px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mt-2 max-w-xs">
                  If you expected to see conversations here, make sure you're logged in with the correct account (the workspace owner's email).
                </p>
              )}
            </div>
          ) : (
            <ConvList conversations={filtered} activeId={activeConv?.id} onSelect={handleSelect} users={teamUsers} onBulkAction={handleBulkAction} canAssign={canViewAllChats} />
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-[var(--nyasa-surface-5)]
        ${!showChat ? 'hidden md:flex' : 'flex'}`}>
        {activeConv ? (
          <>
            <ChatHeader
              conversation={activeConv}
              users={teamUsers.length ? teamUsers : (user ? [{ id: user.id, full_name: user.full_name || user.email || 'You' }] : [])}
              currentUserId={user?.id}
              currentUserRole={profile?.role ?? 'agent'}
              onBack={() => setActiveConv(null)}
              onUpdate={handleConvUpdate}
              onOpenContact={() => setContactOpen(true)}
              onDelete={handleDelete}
              canDelete={canViewAllChats}
              onPin={(agentId) => { setPinPickerConv(activeConv); handlePinForAgent(agentId); }}
              onUnpin={handleUnpin}
              isPinnedForMe={pinnedConvs.some(p => p.conversation_id === activeConv.id)}
              canPin={canViewAllChats}
              canAssign={canViewAllChats}
            />
            <div className="flex-1 flex overflow-hidden relative">
              <MessageThread conversation={activeConv} workspaceId={workspaceOwnerId} />
              {/* Below xl: full-screen slide-over opened by tapping the contact in ChatHeader.
                  At xl+: permanently docked side panel, same as before. */}
              <ContactPanel
                conversation={activeConv}
                onUpdate={handleConvUpdate}
                onClose={() => setContactOpen(false)}
                className={`${contactOpen ? 'flex' : 'hidden'}
                  fixed top-14 bottom-[56px] left-0 right-0 z-40
                  md:top-0 md:bottom-0 md:left-16
                  xl:static xl:inset-auto xl:z-auto xl:flex xl:w-72 xl:border-l xl:border-[var(--nyasa-border)] xl:shrink-0`}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[var(--nyasa-surface-2)] flex items-center justify-center">
              <MessageSquareOff className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-400">Select a conversation</p>
            <p className="text-xs text-gray-600">Choose from the list to start replying</p>
          </div>
        )}
      </div>

      {/* Floating + FAB — visible only on conversation list, not inside a chat */}
      {!showChat && (
        <div className="md:hidden fixed bottom-[72px] right-4 z-40 flex flex-col gap-2 items-end">
          {canViewAllChats && (
            <button
              onClick={() => { handleLoadDmMembers(); setShowInternalMsg(true); }}
              className="w-12 h-12 rounded-full bg-[var(--nyasa-surface-3)] border border-white/10 shadow-lg flex items-center justify-center"
              title="New internal message">
              <Pencil className="w-5 h-5 text-gray-300" />
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="w-14 h-14 rounded-full bg-[#25D366] shadow-xl flex items-center justify-center hover:bg-[#20BA5A] transition-colors">
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      <NewConvModal open={showNew} onClose={() => setShowNew(false)} onCreated={c => { setConversations(p => [c, ...p]); setShowNew(false); setActiveConv(c); }} workspaceId={workspaceOwnerId} />

      {/* Internal message modal */}
      {showInternalMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInternalMsg(false)}>
          <div className="bg-[var(--nyasa-surface-3)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-4">New Internal Message</h2>
            <label className="block text-xs text-gray-400 mb-1.5">Send to</label>
            <select
              className="w-full bg-[var(--nyasa-surface-1)] text-white text-sm rounded-xl px-3 py-2.5 mb-3 focus:outline-none focus:ring-1 focus:ring-[#25D366] border border-[var(--nyasa-border)]"
              value={internalRecipient}
              onChange={e => setInternalRecipient(e.target.value)}
            >
              <option value="">Select a team member…</option>
              {dmMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name || 'Teammate'}{m.role ? ` (${m.role})` : ''}</option>
              ))}
            </select>
            <label className="block text-xs text-gray-400 mb-1.5">Message</label>
            <textarea
              className="w-full bg-[var(--nyasa-surface-1)] text-white text-sm rounded-xl px-3 py-2.5 mb-4 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none border border-[var(--nyasa-border)]"
              rows={3}
              placeholder="Type your message…"
              value={internalMessage}
              onChange={e => setInternalMessage(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInternalMsg(false)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSendInternalMsg}
                disabled={!internalRecipient || !internalMessage.trim() || sendingInternal}
                className="px-4 py-2 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:bg-[#20BA5A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingInternal ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
