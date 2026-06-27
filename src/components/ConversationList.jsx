import { formatDistanceToNow } from 'date-fns';
import { Clock, Bell } from 'lucide-react';
import ChannelBadge from './ChannelBadge';
import PriorityBadge from './PriorityBadge';
import TagChip from './TagChip';
import { motion, AnimatePresence } from 'framer-motion';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

function ConversationRow({ conv, isActive, onClick }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => onClick(conv)}
      className={`conversation-row relative group px-4 py-3 cursor-pointer border-b border-gray-100
        ${isActive ? 'bg-[#5C6CF7]/5 border-l-2 border-l-[#5C6CF7]' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}
        ${conv.unread && !isActive ? 'bg-white' : ''}
      `}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {conv.unread && (
            <span className="w-2 h-2 rounded-full bg-[#5C6CF7] shrink-0" />
          )}
          <span className={`text-sm truncate ${conv.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {conv.contact_name || 'Unknown Contact'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {conv.is_reminder_active && (
            <Bell className="w-3 h-3 text-amber-500" />
          )}
          <ChannelBadge channel={conv.channel} />
          <span className="text-[11px] text-gray-400">{timeAgo(conv.last_message_at || conv.updated_date)}</span>
        </div>
      </div>

      {/* Subject */}
      <div className="text-xs font-medium text-gray-800 truncate mb-0.5 pl-4">
        {conv.subject}
      </div>

      {/* Preview */}
      <div className="text-xs text-gray-400 truncate pl-4 mb-1.5">
        {conv.last_message_preview || 'No messages yet'}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between pl-4">
        <div className="flex items-center gap-1 flex-wrap">
          {(conv.tags || []).slice(0, 2).map(tag => (
            <TagChip key={tag} tag={tag} />
          ))}
          {(conv.tags || []).length > 2 && (
            <span className="text-[10px] text-gray-400">+{conv.tags.length - 2}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={conv.priority} />
          {conv.assigned_to_name && (
            <span className="text-[10px] text-gray-400 truncate max-w-[60px]">{conv.assigned_to_name.split(' ')[0]}</span>
          )}
          {!conv.assigned_to && (
            <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">Unassigned</span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="row-actions absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
      </div>
    </motion.div>
  );
}

export default function ConversationList({ conversations, activeId, onSelect, loading, filterLabel }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-0">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-4 border-b border-gray-100 animate-pulse">
            <div className="flex justify-between mb-2">
              <div className="h-3 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-200 rounded w-12" />
            </div>
            <div className="h-2.5 bg-gray-100 rounded w-full mb-1.5" />
            <div className="h-2 bg-gray-100 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-500">No conversations here</p>
        <p className="text-xs text-gray-400 mt-1">
          {filterLabel ? `Nothing matching "${filterLabel}"` : 'New messages will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto scrollbar-thin">
      <AnimatePresence initial={false}>
        {conversations.map(conv => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeId}
            onClick={onSelect}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}