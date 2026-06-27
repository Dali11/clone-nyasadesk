import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Plus, Filter, ChevronDown, Inbox as InboxIcon, Clock, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import NavRail from '@/components/NavRail';
import ConversationList from '@/components/ConversationList';
import MessageThread from '@/components/MessageThread';
import ConversationHeader from '@/components/ConversationHeader';
import ContactPanel from '@/components/ContactPanel';
import NewConversationModal from '@/components/NewConversationModal';

const FILTERS = [
  { key: 'all', label: 'All', icon: InboxIcon },
  { key: 'unassigned', label: 'Unassigned', icon: AlertCircle },
  { key: 'open', label: 'Open', icon: Clock },
  { key: 'snoozed', label: 'Snoozed', icon: RotateCcw },
  { key: 'closed', label: 'Closed', icon: CheckCircle },
];

const CHANNELS = ['all', 'email', 'whatsapp', 'chat', 'phone'];

export default function Inbox() {
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.User.list().then(setUsers).catch(() => {});
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const convs = await base44.entities.Conversation.list('-last_message_at', 100);
      setConversations(convs);
    } catch {
      setConversations([]);
    }
    setLoading(false);
  };

  const filtered = conversations.filter(c => {
    if (filter === 'unassigned' && c.assigned_to) return false;
    if (filter === 'open' && c.status !== 'open' && c.status !== 'unassigned') return false;
    if (filter === 'snoozed' && c.status !== 'snoozed') return false;
    if (filter === 'closed' && c.status !== 'closed') return false;
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.subject || '').toLowerCase().includes(q) ||
        (c.last_message_preview || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: conversations.length,
    unassigned: conversations.filter(c => !c.assigned_to).length,
    open: conversations.filter(c => c.status === 'open' || c.status === 'unassigned').length,
    snoozed: conversations.filter(c => c.status === 'snoozed').length,
    closed: conversations.filter(c => c.status === 'closed').length,
  };

  const handleSelect = (conv) => {
    setActiveConv(conv);
    if (conv.unread) {
      base44.entities.Conversation.update(conv.id, { unread: false });
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: false } : c));
    }
  };

  const handleConvUpdate = (updated) => {
    setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    if (activeConv?.id === updated.id) setActiveConv(updated);
  };

  const handleCreated = (conv) => {
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
  };

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';
  const unreadCount = conversations.filter(c => c.unread && c.assigned_to === user?.id).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
      <NavRail user={user} />

      {/* Inbox panel */}
      <div className="flex flex-col w-80 bg-white border-r border-gray-200 shrink-0">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] text-gray-400">{greeting}, {user?.full_name?.split(' ')[0] || 'there'}</p>
              <h1 className="text-base font-bold text-gray-900">Team Inbox</h1>
              {unreadCount > 0 && (
                <p className="text-[11px] text-[#5C6CF7] font-medium mt-0.5">
                  {unreadCount} unread {unreadCount === 1 ? 'conversation' : 'conversations'}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#5C6CF7] text-white text-xs font-semibold rounded-lg hover:bg-[#4A5CE6] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="flex gap-1 overflow-x-auto scrollbar-thin">
            {FILTERS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all
                  ${filter === key
                    ? 'bg-[#5C6CF7] text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                  }`}
              >
                <Icon className="w-3 h-3" />
                {label}
                {counts[key] > 0 && (
                  <span className={`ml-0.5 text-[10px] px-1 rounded-full ${filter === key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Channel filter */}
          <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-thin">
            {CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap capitalize transition-all
                  ${channelFilter === ch
                    ? 'bg-[#00A8BD]/10 text-[#00A8BD] font-semibold'
                    : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                {ch === 'all' ? 'All channels' : ch}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <ConversationList
            conversations={filtered}
            activeId={activeConv?.id}
            onSelect={handleSelect}
            loading={loading}
            filterLabel={search}
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
          <>
            <ConversationHeader
              conversation={activeConv}
              users={users}
              onUpdate={handleConvUpdate}
            />
            <div className="flex flex-1 min-h-0">
              <MessageThread conversation={activeConv} user={user} />
              <ContactPanel
                conversation={activeConv}
                user={user}
                onConversationUpdate={handleConvUpdate}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-6">
              <InboxIcon className="w-9 h-9 text-gray-200" />
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Select a conversation</h2>
            <p className="text-sm text-gray-400 max-w-xs">Choose a conversation from the list to view the full thread, contact profile, and deal stage.</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-6 flex items-center gap-2 px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Start a new conversation
            </button>
          </div>
        )}
      </div>

      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleCreated}
        user={user}
      />
    </div>
  );
}