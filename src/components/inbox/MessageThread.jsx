import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, Sparkles, Zap, X, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { store, genId } from '@/lib/store';
import { base44 } from '@/api/base44Client';

function Bubble({ msg }) {
  const isNote = msg.type === 'note';
  const isActivity = msg.type === 'activity';
  const isOut = msg.type === 'outbound';

  if (isActivity) return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] text-gray-500 bg-black/20 px-3 py-1 rounded-full">{msg.body}</span>
    </div>
  );

  if (isNote) return (
    <div className="flex justify-center py-1">
      <div className="max-w-[75%] bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-4 py-2 text-xs text-yellow-200">
        <div className="flex items-center gap-1 mb-1">
          <StickyNote className="w-3 h-3 text-yellow-400" />
          <span className="font-semibold text-yellow-400">Note · {msg.sender_name}</span>
        </div>
        <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
      </div>
    </div>
  );

  return (
    <div className={`flex items-end gap-2 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`max-w-[72%] px-3 py-2 shadow-sm text-sm leading-relaxed ${isOut ? 'bg-[#DCF8C6] text-gray-800 rounded-[8px_0_8px_8px]' : 'bg-white text-gray-800 rounded-[0_8px_8px_8px]'}`}>
        <p className="whitespace-pre-wrap">{msg.body}</p>
        <p className="text-[10px] mt-1 text-right text-gray-400">
          {formatDistanceToNow(new Date(msg.created_date), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export default function MessageThread({ conversation, user, onUpdate }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [tab, setTab] = useState('reply');
  const [aiLoading, setAiLoading] = useState(false);
  const [canned, setCanned] = useState([]);
  const [showCanned, setShowCanned] = useState(false);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!conversation) return;
    setMessages(store.getMessages(conversation.id));
    setCanned(store.getCanned());
  }, [conversation?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!body.trim() || !conversation) return;
    const msg = { id: genId('msg'), conversation_id: conversation.id, type: tab === 'reply' ? 'outbound' : 'note', body: body.trim(), sender_name: user?.full_name || 'You', sender_id: user?.id, channel: conversation.channel, created_date: new Date().toISOString() };
    store.addMessage(conversation.id, msg);
    setMessages(store.getMessages(conversation.id));
    onUpdate({ ...conversation, last_message_preview: body.trim().slice(0, 100), last_message_at: new Date().toISOString(), unread: false });
    setBody('');
    setShowCanned(false);
    setShowCannedPicker(false);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); };

  const aiReply = async () => {
    if (!conversation) return;
    setAiLoading(true);
    try {
      const history = messages.slice(-4).map(m => `${m.sender_name}: ${m.body}`).join('\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a helpful sales assistant for Nyasadesk. Write a concise, friendly reply (2-3 sentences). Context:\n${history}\nLast message: ${conversation.last_message_preview}`,
      });
      setBody(res);
    } catch {
      setBody("Thank you for reaching out! I'll get back to you with more details shortly.");
    }
    setAiLoading(false);
  };

  const insertCanned = (cr) => {
    setBody(cr.body.replace(/\{\{name\}\}/g, conversation?.contact_name || 'there'));
    setShowCanned(false);
    setShowCannedPicker(false);
    setPickerSearch('');
  };

  const handleBodyChange = (e) => {
    const val = e.target.value;
    setBody(val);
    setShowCanned(val.startsWith('/'));
  };

  const filteredCanned = showCanned ? canned.filter(cr =>
    body === '/' || cr.shortcut.toLowerCase().includes(body.toLowerCase()) || cr.title.toLowerCase().includes(body.toLowerCase())
  ) : [];

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#E5DDD5', backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23b2a99a' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">💬</span>
          </div>
          <h2 className="text-gray-700 font-semibold mb-1">Nyasadesk</h2>
          <p className="text-gray-500 text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 flex flex-col gap-2"
        style={{ backgroundColor: '#E5DDD5', backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23b2a99a' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">No messages yet</div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <Bubble msg={msg} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {filteredCanned.length > 0 && (
        <div className="bg-[#233138] border-t border-white/10 max-h-44 overflow-y-auto scrollbar-thin">
          {filteredCanned.map(cr => (
            <button key={cr.id} onClick={() => insertCanned(cr)} className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded">{cr.shortcut}</span>
                <span className="text-sm font-medium text-gray-200">{cr.title}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{cr.body.slice(0, 70)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Canned Picker Modal */}
      {showCannedPicker && (
        <div className="absolute inset-0 z-30 flex items-end md:items-center justify-center" style={{ pointerEvents: 'auto' }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCannedPicker(false)} />
          <div className="relative w-full max-w-md mx-2 mb-2 md:mb-0 bg-[#202C33] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <Zap className="w-4 h-4 text-[#25D366] shrink-0" />
              <span className="text-sm font-bold text-white flex-1">Canned Responses</span>
              <button onClick={() => setShowCannedPicker(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-3 py-2 border-b border-white/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search responses…"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-[#2A3942] rounded-lg border-0 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </div>
            </div>
            <div className="overflow-y-auto scrollbar-thin">
              {canned.filter(cr =>
                !pickerSearch || cr.title.toLowerCase().includes(pickerSearch.toLowerCase()) || cr.shortcut.toLowerCase().includes(pickerSearch.toLowerCase()) || cr.body.toLowerCase().includes(pickerSearch.toLowerCase())
              ).map(cr => (
                <button key={cr.id} onClick={() => insertCanned(cr)}
                  className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded">{cr.shortcut}</span>
                    <span className="text-sm font-semibold text-white">{cr.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{cr.body}</p>
                </button>
              ))}
              {canned.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">No canned responses yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#202C33] border-t border-white/10 px-3 py-2 shrink-0">
        <div className="flex gap-1 mb-2">
          {['reply','note'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all
                ${tab === t ? (t === 'note' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#25D366]/20 text-[#25D366]') : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'note' ? '📌 Note' : '💬 Reply'}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setShowCannedPicker(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 transition-colors">
            <Zap className="w-3 h-3" />
            Canned
          </button>
          <button onClick={aiReply} disabled={aiLoading}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50">
            <Sparkles className="w-3 h-3" />
            {aiLoading ? 'Thinking…' : 'AI Reply'}
          </button>
        </div>
        <div className={`flex items-end gap-2 rounded-xl px-3 py-2 ${tab === 'note' ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-[#2A3942]'}`}>
          <textarea rows={2} value={body} onChange={handleBodyChange} onKeyDown={handleKeyDown}
            placeholder={tab === 'reply' ? 'Type a message… (/ for canned, ⌘↵ to send)' : 'Add an internal note…'}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-600 resize-none focus:outline-none leading-relaxed" />
          <button onClick={send} disabled={!body.trim()}
            className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center hover:bg-[#20BA5A] transition-colors disabled:opacity-30 shrink-0">
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}