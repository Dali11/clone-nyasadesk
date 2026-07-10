import { AnimatePresence, motion } from 'framer-motion';
import ConvRow from './ConvRow';
import { MessageSquare } from 'lucide-react';

export default function ConvList({ conversations, activeId, onSelect, loading }) {
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

  return (
    <div className="flex flex-col">
      <AnimatePresence initial={false}>
        {conversations.map(conv => (
          <motion.div key={conv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <ConvRow conv={conv} active={conv.id === activeId} onClick={onSelect} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}