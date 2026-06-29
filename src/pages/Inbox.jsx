import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ConvList from '@/components/inbox/ConvList';
import ChatHeader from '@/components/inbox/ChatHeader';
import MessageThread from '@/components/inbox/MessageThread';
import ContactPanel from '@/components/inbox/ContactPanel';
import NewConvModal from '@/components/inbox/NewConvModal';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { store } from '@/lib/store';

const STATUS_TABS = [
  { key: 'all',        label: 'All'        },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'open',       label: 'Open'       },
  { key: 'snoozed',    label: 'Snoozed'    },
  { key: 'closed',     label: 'Closed'     },
];

const CHANNELS_FILTER = ['all', 'whatsapp', 'messenger', 'email', 'website'];

export default function Inbox() {
  const { user } = useNyasaAuth();
  const workspace = store.getWorkspace();
  const users = store.getUsers();
  const [conversations, setConversations] = useState(store.getConversations());
  const [activeConv, setActiveConv] = useState(null);
  const [filter, setFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);

  // Phone-first: on mobile, show list or chat (never both)
  const showChat = !!activeConv;

  const filtered = conversations.filter(c => {
    if (filter === 'unassigned' && c.assigned_to) return false;
    if (filter === 'open' && c.status !== 'open' && c.status !== 'unassigned') return false;
    if (filter === 'snoozed' && c.status !== 'snoozed') return false;
    if (filter === 'closed' && c.status !== 'closed') return false;
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.contact_name || '').toLowerCase().includes(q) || (c.subject || '').toLowerCase().includes(q);
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
      store.updateConversation(conv.id, { unread: false });
      setConversations(store.getConversations());
    }
  };

  const handleConvUpdate = (updated) => {
    store.updateConversation(updated.id, updated);
    setConversations(store.getConversations());
    if (activeConv?.id === updated.id) setActiveConv(updated);
  };

  const handleCreated = (conv) => {
    setConversations(store.getConversations());
    setActiveConv(conv);
  };

  const unread = conversations.filter(c => c.unread && (c.assigned_to === user?.id || !c.assigned_to)).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pb-[56px] md:pb-0">
      <Sidebar />

      {/* Conversation list panel */}
      {/* Mobile: full width, hidden when chat open. md+: fixed 340px always visible */}
      <div className={`
        flex flex-col bg-[#111B21] border-r border-white/10
        ${showChat ? 'hidden md:flex md:w-[340px]' : 'flex w-full md:w-[340px]'}
        shrink-0
      `}>
        <div className="px-4 pt-4 pb-2 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{workspace.name}</p>
              <h1 className="text-base font-bold text-white leading-tight">Inbox</h1>
              {unread > 0 && <p className="text-xs text-[#25D366]">{unread} unread</p>}
            </div>
            <button onClick={() => setShowNew(true)}
              className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center hover:bg-[#20BA5A] transition-colors">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#2A3942] rounded-lg border-0 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
          </div>
        </div>

        <div className="px-2 py-1.5 border-b border-white/10 overflow-x-auto scrollbar-thin">
          <div className="flex gap-0.5">
            {STATUS_TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all
                  ${filter === key ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-gray-500 hover:text-gray-300'}`}>
                {label}
                {counts[key] > 0 && (
                  <span className={`text-[9px] px-1 rounded-full ${filter === key ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/10 text-gray-500'}`}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 mt-1">
            {CHANNELS_FILTER.map(ch => (
              <button key={ch} onClick={() => setChannelFilter(ch)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap capitalize transition-all
                  ${channelFilter === ch ? 'text-[#25D366] font-semibold' : 'text-gray-600 hover:text-gray-400'}`}>
                {ch === 'all' ? 'All' : ch}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <ConvList conversations={filtered} activeId={activeConv?.id} onSelect={handleSelect} loading={false} />
        </div>
      </div>

      {/* Chat area: full screen on mobile when open, flex-1 on md+ */}
      <div className={`
        flex-1 flex flex-col min-w-0 bg-[#0B1418]
        ${showChat ? 'flex' : 'hidden md:flex'}
      `}>
        {activeConv ? (
          <>
            <ChatHeader
              conversation={activeConv}
              users={users}
              onUpdate={handleConvUpdate}
              onBack={() => setActiveConv(null)}
            />
            <div className="flex flex-1 min-h-0">
              <MessageThread conversation={activeConv} user={user} onUpdate={handleConvUpdate} />
              {/* ContactPanel: hidden on mobile, visible on lg+ */}
              <div className="hidden lg:block">
                <ContactPanel conversation={activeConv} onUpdate={handleConvUpdate} />
              </div>
            </div>
          </>
        ) : (
          <MessageThread conversation={null} user={user} onUpdate={() => {}} />
        )}
      </div>

      <NewConvModal open={showNew} onClose={() => setShowNew(false)} onCreated={handleCreated} user={user} />
    </div>
  );
}