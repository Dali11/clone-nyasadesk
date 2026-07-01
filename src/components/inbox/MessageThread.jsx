import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, Loader2, ChevronDown, Check, CheckCheck, X, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { getMessages, sendMessage, subscribeToMessages } from '@/lib/channels';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { store } from '@/lib/store';

const CHANNEL_COLOR = {
  whatsapp: '#DCF8C6',
  messenger: '#D6EAFF',
  email:     '#EDE9FE',
  website:   '#CFFAFE',
};

function StatusIcon({ status }) {
  if (status === 'sending')   return <Loader2 className="w-3 h-3 animate-spin text-gray-400" />;
  if (status === 'sent')      return <Check className="w-3 h-3 text-gray-400" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-blue-400" />;
  if (status === 'failed')    return <X className="w-3 h-3 text-red-400" />;
  return null;
}

function Bubble({ msg }) {
  const isNote     = msg.direction === 'note';
  const isActivity = msg.direction === 'activity';
  const isOut      = msg.direction === 'outbound';
  const ts         = msg.created_at || msg.created_date;
  const bubbleColor = isOut ? (CHANNEL_COLOR[msg.channel] || '#DCF8C6') : '#FFFFFF';

  if (isActivity) return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] text-gray-500 bg-black/20 px-3 py-1 rounded-full">{msg.body}</span>
    </div>
  );

  if (isNote) return (
    <div className="flex justify-center py-1">
      <div className="max-w-[78%] bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-4 py-2 text-xs text-yellow-200">
        <div className="flex items-center gap-1 mb-1">
          <StickyNote className="w-3 h-3 text-yellow-400" />
          <span className="font-semibold text-yellow-400">Note · {msg.sender_name}</span>
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex items-end gap-2 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isOut && (
        <div className="w-6 h-6 rounded-full bg-[#2A3942] flex items-center justify-center text-[9px] font-bold text-white shrink-0 mb-1">
          {(msg.sender_name || '?')[0].toUpperCase()}
        </div>
      )}
      <div
        className="max-w-[72%] px-3 py-2 shadow-sm text-sm leading-relaxed"
        style={{
          background: bubbleColor,
          color: '#1a2530',
          borderRadius: isOut ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
        }}
      >
        {!isOut && msg.sender_name && (
          <p className="text-[10px] font-semibold text-[#128C7E] mb-0.5">{msg.sender_name}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <p className="text-[10px] text-gray-500">
            {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ''}
          </p>
          {isOut && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </motion.div>
  );
}

export default function MessageThread({ conversation, workspaceId }) {
  const { user } = useNyasaAuth();
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [body, setBody]           = useState('');
  const [tab, setTab]             = useState('reply'); // reply | note
  const [sending, setSending]     = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const canned = store.getCanned();
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const sendingRef = useRef(false); // synchronous lock — `sending` state alone can be bypassed
                                     // if two triggers (e.g. Enter + click) fire before React re-renders

  const wId = workspaceId || user?.id;

  // Load messages
  useEffect(() => {
    if (!conversation?.id) return;
    setLoading(true);
    getMessages(conversation.id)
      .then(data => { setMessages(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conversation?.id]);

  // Realtime
  useEffect(() => {
    if (!conversation?.id) return;
    const sub = subscribeToMessages(conversation.id, (payload) => {
      setMessages(prev => {
        const exists = prev.find(m => m.id === payload.new.id);
        if (exists) return prev.map(m => m.id === payload.new.id ? payload.new : m);
        return [...prev, payload.new];
      });
    });
    return () => sub?.unsubscribe?.();
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || !conversation || sendingRef.current) return;
    sendingRef.current = true;
    setBody('');
    setSending(true);
    inputRef.current?.focus();

    if (tab === 'note') {
      // Notes are local only (internal)
      setMessages(prev => [...prev, {
        id: `note-${Date.now()}`, conversation_id: conversation.id,
        direction: 'note', body: text, sender_name: user?.full_name || 'You',
        created_at: new Date().toISOString(),
      }]);
      sendingRef.current = false;
      setSending(false);
      return;
    }

    // Optimistic bubble
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: conversation.id, direction: 'outbound',
      body: text, channel: conversation.channel,
      sender_name: user?.full_name || 'You', status: 'sending',
      created_at: new Date().toISOString(),
    }]);

    try {
      const msg = await sendMessage(wId, conversation.id, text, user?.full_name || 'You');
      setMessages(prev => prev.map(m => m.id === tempId ? { ...msg, direction: 'outbound' } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!conversation) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0B141A]"
      style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '20px 20px' }}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center items-center h-32 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-600">Send the first message below</p>
          </div>
        ) : (
          messages.map(msg => <Bubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/5 bg-[#202C33] px-3 py-2">
        {/* Tab row */}
        <div className="flex gap-1 mb-2">
          {['reply', 'note'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[11px] font-semibold px-3 py-1 rounded-lg transition-colors capitalize
                ${tab === t ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'note' ? '📝 Note' : '💬 Reply'}
            </button>
          ))}

          {/* Canned response trigger */}
          <button onClick={() => setShowCanned(s => !s)}
            className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
            <Zap className="w-3.5 h-3.5" /> Quick
          </button>
        </div>

        {/* Canned responses */}
        <AnimatePresence>
          {showCanned && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
              <div className="bg-[#1a2530] rounded-xl border border-white/10 p-2 max-h-40 overflow-y-auto space-y-1">
                {canned.map(c => (
                  <button key={c.id} onClick={() => { setBody(c.body); setShowCanned(false); inputRef.current?.focus(); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <p className="text-xs font-semibold text-[#25D366]">{c.shortcut}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.body}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none placeholder:text-gray-600 leading-relaxed max-h-32"
            style={{ scrollbarWidth: 'thin' }}
            placeholder={tab === 'note' ? 'Add an internal note…' : `Reply via ${conversation.channel}…`}
            value={body}
            onChange={e => { setBody(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'; }}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSend} disabled={!body.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
            style={{ background: body.trim() ? '#25D366' : '#2A3942' }}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
