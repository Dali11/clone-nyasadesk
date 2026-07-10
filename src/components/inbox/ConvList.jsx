import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import ConvRow from './ConvRow';
import Avatar from '@/components/Avatar';
import { MessageSquare, X, CheckSquare, Square, UserCheck, CheckCircle, Clock, XCircle, Trash2 } from 'lucide-react';

export default function ConvList({ conversations, activeId, onSelect, loading, users = [], onBulkAction, canAssign = false }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

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
      <div className="flex flex-col gap-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--nyasa-border)] animate-pulse">
            <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-white/10 rounded w-3/4" />
              <div className="h-2.5 bg-white/5 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <MessageSquare className="w-10 h-10 text-gray-700 mb-3" />
        <p className="text-sm text-gray-600">No conversations</p>
      </div>
    );
  }

  const allSelected = selectedIds.size === conversations.length;

  return (
    <div className="flex flex-col relative">
      {/* Bulk mode top bar */}
      <AnimatePresence>
        {bulkMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-[var(--nyasa-surface-2)] border-b border-[var(--nyasa-border)]"
          >
            <button onClick={exitBulkMode} className="p-1 text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white flex-1">
              {selectedIds.size} selected
            </span>
            <button onClick={allSelected ? exitBulkMode : selectAll}
              className="flex items-center gap-1 text-[11px] text-[#25D366] font-medium">
              {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rows */}
      <AnimatePresence initial={false}>
        {conversations.map(conv => (
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

      {/* Bulk action bar — fixed at bottom of list */}
      <AnimatePresence>
        {bulkMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="sticky bottom-0 z-30 bg-[var(--nyasa-surface-1)] border-t border-[var(--nyasa-border)] px-3 py-2 shadow-lg"
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
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--nyasa-surface-3)] hover:bg-[#25D366]/20 transition-colors text-xs text-gray-200 font-medium">
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366]/15 text-[#25D366] text-xs font-semibold whitespace-nowrap hover:bg-[#25D366]/25 transition-colors">
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
