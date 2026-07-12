import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import ConvRow from './ConvRow';
import Avatar from '@/components/Avatar';
import { MessageSquare, X, CheckSquare, Square, UserCheck, CheckCircle, Clock, XCircle, Trash2, Search, MoreVertical, Plus } from 'lucide-react';

export default function ConvList({ conversations, activeId, onSelect, loading, users = [], onBulkAction, canAssign = false }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const enterBulkMode = (id) => {
    setBulkMode(true);
    setSelectedIds(new Set([id]));
    setAssignOpen(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
    setAssignOpen(false);
  };

  const selectAll = () => setSelectedIds(new Set(conversations.map(c => c.id)));

  const handleBulk = (action, payload) => {
    onBulkAction?.({ ids: [...selectedIds], action, payload });
    exitBulkMode();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-0 bg-[#0B141A] min-h-screen">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-white/5 animate-pulse">
            <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-white/10 rounded w-3/4" />
              <div className="h-2.5 bg-white/5 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Filter conversations locally based on activeTab and searchQuery to emulate WhatsApp's UI flow
  const filteredConversations = conversations.filter(conv => {
    // 1. Filter by tab
    if (activeTab === 'Unread' && !conv.unread) return false;
    if (activeTab === 'Groups' && conv.channel !== 'group' && !conv.is_group) return false; // WhatsApp groups check

    // 2. Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (conv.contact_name || '').toLowerCase();
      const subject = (conv.subject || '').toLowerCase();
      const preview = (conv.last_message_preview || '').toLowerCase();
      return name.includes(q) || subject.includes(q) || preview.includes(q);
    }
    return true;
  });

  const allSelected = selectedIds.size === conversations.length;

  return (
    <div className="flex flex-col relative bg-[#0B141A] min-h-screen text-white select-none">
      {/* WhatsApp Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 bg-[#0B141A]">
        <h1 className="text-xl font-bold text-white tracking-wide">Nyasadesk</h1>
        <div className="flex items-center gap-4 text-[#8696A0]">
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-white" />
        </div>
      </div>

      {/* WhatsApp Search Bar */}
      <div className="px-4 py-2 bg-[#0B141A]">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#1F2C34] text-[#8696A0]">
          <Search className="w-4 h-4 shrink-0" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-white placeholder-[#8696A0] w-full"
          />
          {searchQuery && (
            <X className="w-4 h-4 shrink-0 cursor-pointer text-white" onClick={() => setSearchQuery('')} />
          )}
        </div>
      </div>

      {/* Filter Tabs / Pill-style */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0B141A] overflow-x-auto scrollbar-none">
        {['All', 'Unread', 'Groups'].map(tab => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap
                ${active
                  ? 'bg-[#00A884] text-[#0B141A]'
                  : 'bg-[#1F2C34] text-[#8696A0] hover:bg-[#2A3942]'
                }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Bulk mode top bar */}
      <AnimatePresence>
        {bulkMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-[#1F2C34] border-b border-white/5"
          >
            <button onClick={exitBulkMode} className="p-1 text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white flex-1">
              {selectedIds.size} selected
            </span>
            <button onClick={allSelected ? exitBulkMode : selectAll}
              className="flex items-center gap-1 text-[11px] text-[#00A884] font-medium">
              {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conversation List */}
      <div className="flex-1">
        {!filteredConversations.length ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            {/* WhatsApp style empty state */}
            <div className="w-32 h-32 mb-6 flex items-center justify-center opacity-40">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-20 h-20 text-[#8696A0]">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.884.519 3.645 1.416 5.163l-1.373 5.031 5.148-1.35C8.647 21.571 10.26 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-white mb-1">No conversations yet</p>
            <p className="text-xs text-[#8696A0] max-w-xs">Tap the green compose icon below to start a new chat with your contacts.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredConversations.map(conv => (
              <motion.div key={conv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <ConvRow
                  conv={conv}
                  active={conv.id === activeId}
                  onClick={bulkMode ? () => toggleSelect(conv.id) : onSelect}
                  selectable={bulkMode}
                  selected={selectedIds.has(conv.id)}
                  onSelect={bulkMode ? toggleSelect : enterBulkMode}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* FAB Button (Compose / Start Chat) */}
      <button
        onClick={() => {
          // If the page has a showNew state or modal, we can trigger it. Since we don't have direct access here, we simulate clicking the standard button or triggering New Conv Modal by looking at dispatch/events if any, or standard DOM trigger.
          const plusBtn = document.querySelector('[data-compose-btn]') || document.getElementById('new-conv-btn');
          if (plusBtn) {
            plusBtn.click();
          } else {
            // Find any element with lucide-plus or similar and click it, or fallback.
            const genericPlus = document.querySelector('.lucide-plus')?.parentElement;
            if (genericPlus) genericPlus.click();
          }
        }}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-[#00A884] text-[#0B141A] flex items-center justify-center shadow-lg hover:bg-[#008F72] transition-colors z-40 active:scale-95"
      >
        <Plus className="w-6 h-6 stroke-[3]" />
      </button>

      {/* Bulk action bar — fixed at bottom of list */}
      <AnimatePresence>
        {bulkMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="sticky bottom-0 z-30 bg-[#1F2C34] border-t border-white/5 px-3 py-2 shadow-lg"
          >
            {assignOpen ? (
              /* Agent picker */
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setAssignOpen(false)} className="p-1 text-gray-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-semibold text-gray-300">Assign {selectedIds.size} chat{selectedIds.size !== 1 ? 's' : ''} to…</span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                  {users.map(u => (
                    <button key={u.id} onClick={() => handleBulk('assign', { userId: u.id, userName: u.full_name })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2A3942] hover:bg-[#00A884]/20 transition-colors text-xs text-gray-200 font-medium">
                      <Avatar name={u.full_name} size="xs" />
                      {u.full_name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Main action buttons */
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
                {canAssign && (
                  <button onClick={() => setAssignOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00A884]/15 text-[#00A884] text-xs font-semibold whitespace-nowrap hover:bg-[#00A884]/25 transition-colors">
                    <UserCheck className="w-3.5 h-3.5" />Assign
                  </button>
                )}
                <button onClick={() => handleBulk('status', { status: 'open' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold whitespace-nowrap hover:bg-white/10 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />Open
                </button>
                <button onClick={() => handleBulk('status', { status: 'snoozed' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold whitespace-nowrap hover:bg-white/10 transition-colors">
                  <Clock className="w-3.5 h-3.5 text-yellow-400" />Snooze
                </button>
                <button onClick={() => handleBulk('status', { status: 'closed' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold whitespace-nowrap hover:bg-white/10 transition-colors">
                  <XCircle className="w-3.5 h-3.5 text-gray-400" />Close
                </button>
                <button onClick={() => {
                    if (window.confirm(`Delete ${selectedIds.size} conversation${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`))
                      handleBulk('delete', {});
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold whitespace-nowrap hover:bg-red-500/20 transition-colors ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
