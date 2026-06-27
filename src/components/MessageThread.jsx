import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, User, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_MESSAGES, genId } from '@/lib/mockData';

function MessageBubble({ msg }) {
  const isNote = msg.type === 'note';
  const isActivity = msg.type === 'activity';
  const isOutbound = msg.type === 'outbound';

  if (isActivity) {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          <ArrowRight className="w-3 h-3" />
          <span>{msg.body}</span>
          <span className="text-gray-300">·</span>
          <span>{msg.sender_name}</span>
        </div>
      </div>
    );
  }

  if (isNote) {
    return (
      <div className="flex justify-center py-1">
        <div className="max-w-[80%] bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <StickyNote className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-semibold text-amber-600">Internal Note · {msg.sender_name}</span>
            <span className="text-[10px] text-gray-400 ml-auto">
              {formatDistanceToNow(new Date(msg.created_date), { addSuffix: true })}
            </span>
          </div>
          <p className="text-xs text-amber-900 whitespace-pre-wrap">{msg.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
        ${isOutbound ? 'bg-[#5C6CF7] text-white' : 'bg-gray-200 text-gray-600'}`}>
        {msg.sender_name ? msg.sender_name[0].toUpperCase() : '?'}
      </div>
      <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm
        ${isOutbound
          ? 'bg-[#5C6CF7] text-white rounded-br-sm'
          : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
        }`}>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</p>
        <div className={`text-[10px] mt-1 ${isOutbound ? 'text-white/60' : 'text-gray-400'}`}>
          {msg.sender_name} · {formatDistanceToNow(new Date(msg.created_date), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

// In-memory message store shared across renders
const messageStore = { ...MOCK_MESSAGES };

export default function MessageThread({ conversation, user, onConversationUpdate }) {
  const [messages, setMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [tab, setTab] = useState('reply');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!conversation) return;
    setMessages(messageStore[conversation.id] ? [...messageStore[conversation.id]] : []);
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const body = tab === 'reply' ? replyBody : noteBody;
    if (!body.trim() || !conversation) return;

    const msg = {
      id: genId('msg'),
      conversation_id: conversation.id,
      type: tab === 'reply' ? 'outbound' : 'note',
      body: body.trim(),
      sender_name: user?.full_name || 'You',
      sender_id: user?.id,
      channel: conversation.channel,
      created_date: new Date().toISOString(),
    };

    if (!messageStore[conversation.id]) messageStore[conversation.id] = [];
    messageStore[conversation.id] = [...messageStore[conversation.id], msg];
    setMessages(prev => [...prev, msg]);

    if (onConversationUpdate) {
      onConversationUpdate({
        ...conversation,
        last_message_preview: body.trim().slice(0, 120),
        last_message_at: new Date().toISOString(),
        unread: false,
      });
    }

    tab === 'reply' ? setReplyBody('') : setNoteBody('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F5F5F7]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <User className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Select a conversation</p>
          <p className="text-xs text-gray-400 mt-1">Choose one from the left to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F5F5F7] min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            No messages yet — start the conversation below.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <MessageBubble msg={msg} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setTab('reply')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all
              ${tab === 'reply' ? 'bg-[#5C6CF7] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Reply
          </button>
          <button
            onClick={() => setTab('note')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1
              ${tab === 'note' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <StickyNote className="w-3 h-3" />
            Internal Note
          </button>
        </div>

        <div className={`rounded-xl border ${tab === 'note' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'} overflow-hidden`}>
          <textarea
            rows={3}
            value={tab === 'reply' ? replyBody : noteBody}
            onChange={e => tab === 'reply' ? setReplyBody(e.target.value) : setNoteBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tab === 'reply' ? 'Write a reply… (\u2318\u21a9 to send)' : 'Add an internal note… (\u2318\u21a9 to save)'}
            className={`w-full px-4 py-3 text-sm resize-none focus:outline-none bg-transparent
              ${tab === 'note' ? 'text-amber-900 placeholder:text-amber-400' : 'text-gray-800 placeholder:text-gray-400'}`}
          />
          <div className="flex items-center justify-end px-3 pb-2">
            <button
              onClick={send}
              disabled={!(tab === 'reply' ? replyBody : noteBody).trim()}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-40
                ${tab === 'note' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-[#5C6CF7] text-white hover:bg-[#4A5CE6]'}`}
            >
              <Send className="w-3 h-3" />
              {tab === 'reply' ? 'Send' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}