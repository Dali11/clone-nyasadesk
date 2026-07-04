import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Loader2, MessageSquareOff } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ConvList from '@/components/inbox/ConvList';
import ChatHeader from '@/components/inbox/ChatHeader';
import MessageThread from '@/components/inbox/MessageThread';
import ContactPanel from '@/components/inbox/ContactPanel';
import NewConvModal from '@/components/inbox/NewConvModal';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getConversations, updateConversation, deleteConversation, subscribeToConversations } from '@/lib/channels';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUS_TABS = [
  { key: 'all',        label: 'All'        },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'open',       label: 'Open'       },
  { key: 'snoozed',    label: 'Snoozed'    },
  { key: 'closed',     label: 'Closed'     },
];

const CHANNELS_FILTER = ['all', 'whatsapp', 'messenger', 'instagram', 'telegram', 'email', 'website'];

export default function Inbox() {
  useDocumentTitle('Inbox');
  const { user, workspaceOwnerId, canViewAllChats } = useNyasaAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null);
  const [filter, setFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // Real team roster for the "Assign to" menu — this used to just be the
  // current user, so you could never actually assign a conversation to a
  // teammate from the chat header, only to yourself.
  const [teamUsers, setTeamUsers] = useState([]);

  const loadConversations = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      const data = await getConversations(workspaceOwnerId);
      setConversations(data);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceOwnerId]);

  // Initial load
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load the real team roster once, for the chat header's "Assign to" menu
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/team?workspace_id=${encodeURIComponent(user.workspace_id || user.id)}`, {
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
  }, [user?.id, user?.workspace_id]);

  // Realtime subscription
  useEffect(() => {
    if (!workspaceOwnerId) return;
    const sub = subscribeToConversations(workspaceOwnerId, () => loadConversations());
    return () => sub?.unsubscribe?.();
  }, [workspaceOwnerId, loadConversations]);

  const filtered = conversations.filter(c => {
    if (filter === 'unassigned' && c.assigned_to) return false;
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

  const counts = {
    all:        conversations.length,
    unassigned: conversations.filter(c => !c.assigned_to).length,
    open:       conversations.filter(c => c.status === 'open' || c.status === 'unassigned').length,
    snoozed:    conversations.filter(c => c.status === 'snoozed').length,
    closed:     conversations.filter(c => c.status === 'closed').length,
  };

  const handleConvUpdate = (updates) => {
    setActiveConv(prev => ({ ...prev, ...updates }));
    setConversations(prev => prev.map(c => c.id === updates.id ? { ...c, ...updates } : c));
    updateConversation(updates.id, updates).catch(e => console.error('[Inbox] failed to update conversation:', e));
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
      window.alert('Could not delete this conversation. You may not have permission.');
    }
  };

  const showChat = !!activeConv;

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      {/* Conversation list — hidden on mobile when chat is open */}
      <div className={`flex flex-col bg-[#111B21] border-r border-white/10
        w-full md:w-80 lg:w-96 shrink-0 md:flex
        ${showChat ? 'hidden' : 'flex'}`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-black text-white">Inbox</h1>
            <button onClick={() => setShowNew(true)}
              className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center hover:bg-[#20BA5A] transition-colors">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              className="w-full bg-[#202C33] text-white text-sm rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] placeholder:text-gray-600"
              placeholder="Search conversations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

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
                  ${channelFilter === ch ? 'bg-[#2A3942] text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <MessageSquareOff className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-600">Connect a channel in Settings to start receiving messages.</p>
            </div>
          ) : (
            <ConvList conversations={filtered} activeId={activeConv?.id} onSelect={handleSelect} />
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-[#0D1418]
        ${!showChat ? 'hidden md:flex' : 'flex'}`}>
        {activeConv ? (
          <>
            <ChatHeader
              conversation={activeConv}
              users={teamUsers.length ? teamUsers : (user ? [{ id: user.id, full_name: user.full_name || user.email || 'You' }] : [])}
              onBack={() => setActiveConv(null)}
              onUpdate={handleConvUpdate}
              onOpenContact={() => setContactOpen(true)}
              onDelete={handleDelete}
              canDelete={canViewAllChats}
            />
            <div className="flex-1 flex overflow-hidden relative">
              <MessageThread conversation={activeConv} workspaceId={user?.id} />
              {/* Below xl: full-screen slide-over opened by tapping the contact in ChatHeader.
                  At xl+: permanently docked side panel, same as before. */}
              <ContactPanel
                conversation={activeConv}
                onUpdate={handleConvUpdate}
                onClose={() => setContactOpen(false)}
                className={`${contactOpen ? 'flex' : 'hidden'}
                  fixed top-14 bottom-[56px] left-0 right-0 z-40
                  md:top-0 md:bottom-0 md:left-16
                  xl:static xl:inset-auto xl:z-auto xl:flex xl:w-72 xl:border-l xl:border-white/10 xl:shrink-0`}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#202C33] flex items-center justify-center">
              <MessageSquareOff className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-400">Select a conversation</p>
            <p className="text-xs text-gray-600">Choose from the list to start replying</p>
          </div>
        )}
      </div>

      <NewConvModal open={showNew} onClose={() => setShowNew(false)} onCreated={c => { setConversations(p => [c, ...p]); setShowNew(false); setActiveConv(c); }} workspaceId={user?.id} />
    </div>
  );
}
