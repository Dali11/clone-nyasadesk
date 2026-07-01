import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, Loader2, Check, CheckCheck, X, Zap, Paperclip, Mic, Square, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { getMessages, sendMessage, sendMediaMessage, addNote, subscribeToMessages, getCannedResponses } from '@/lib/channels';
import { useNyasaAuth } from '@/lib/NyasaAuth';

const CHANNEL_COLOR = {
  whatsapp: '#DCF8C6',
  messenger: '#D6EAFF',
  email:     '#EDE9FE',
  website:   '#CFFAFE',
};

function StatusIcon({ status }) {
  // WhatsApp-style receipt semantics:
  //  sending   -> spinner (optimistic, not yet accepted by the server)
  //  sent      -> single grey check (server/API accepted it)
  //  delivered -> double grey check (reached the recipient's device — real webhook receipt)
  //  read      -> double BLUE check (recipient opened it — real webhook receipt)
  //  failed    -> red X
  if (status === 'sending')   return <Loader2 className="w-3 h-3 animate-spin text-gray-400" />;
  if (status === 'sent')      return <Check className="w-3 h-3 text-gray-400" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === 'read')      return <CheckCheck className="w-3 h-3 text-[#53BDEB]" />;
  if (status === 'failed')    return <X className="w-3 h-3 text-red-400" />;
  return null;
}

function AudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center shrink-0">
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 h-1 bg-black/20 rounded-full overflow-hidden">
        <div className="h-full bg-current opacity-50 w-1/3" />
      </div>
      <audio ref={audioRef} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </div>
  );
}

function MediaAttachment({ att }) {
  if (!att) return null;
  if (att.type === 'image') return <img src={att.url} alt="attachment" className="rounded-lg max-w-[240px] max-h-[240px] object-cover mb-1" />;
  if (att.type === 'video') return <video src={att.url} controls className="rounded-lg max-w-[240px] max-h-[240px] mb-1" />;
  if (att.type === 'audio') return <AudioPlayer url={att.url} />;
  return null;
}

function Bubble({ msg }) {
  const isNote     = msg.direction === 'note';
  const isActivity = msg.direction === 'activity';
  const isOut      = msg.direction === 'outbound';
  const ts         = msg.created_at || msg.created_date;
  const bubbleColor = isOut ? (CHANNEL_COLOR[msg.channel] || '#DCF8C6') : '#FFFFFF';
  const attachment = Array.isArray(msg.attachments) ? msg.attachments[0] : null;

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
        {attachment && <MediaAttachment att={attachment} />}
        {(!attachment || (msg.body && !['📷 Photo','🎥 Video','🎤 Voice message'].includes(msg.body))) && (
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        )}
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
  const [uploading, setUploading] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [canned, setCanned] = useState([]);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileInputRef = useRef(null);
  const sendingRef = useRef(false); // synchronous lock — `sending` state alone can be bypassed
                                     // if two triggers (e.g. Enter + click) fire before React re-renders
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const wId = workspaceId || user?.id;

  // Load messages
  useEffect(() => {
    if (!conversation?.id) return;
    setLoading(true);
    getMessages(conversation.id)
      .then(data => { setMessages(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conversation?.id]);

  // Load canned responses (real, persisted — was reading from a dead in-memory stub)
  useEffect(() => {
    if (!wId) return;
    getCannedResponses(wId).then(setCanned).catch(() => setCanned([]));
  }, [wId]);

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
      // Notes are real, persisted messages (direction: 'note') — saved to the
      // DB and synced live to every other team member on this conversation,
      // just never dispatched to the external channel.
      const tempId = `note-temp-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId, conversation_id: conversation.id,
        direction: 'note', body: text, sender_name: user?.full_name || 'You',
        created_at: new Date().toISOString(),
      }]);
      try {
        const saved = await addNote(wId, conversation.id, text, user?.full_name || 'You', user?.id);
        setMessages(prev => prev.map(m => m.id === tempId ? saved : m));
      } catch (e) {
        console.error('[MessageThread] failed to save note:', e);
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, body: `${text}\n\n⚠ Failed to save — try again` } : m));
      }
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

  const handleSendMedia = async (file, kind) => {
    if (!file || !conversation || uploading) return;
    setUploading(true);
    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: conversation.id, direction: 'outbound',
      body: kind === 'image' ? '📷 Photo' : kind === 'video' ? '🎥 Video' : '🎤 Voice message',
      channel: conversation.channel, sender_name: user?.full_name || 'You', status: 'sending',
      created_at: new Date().toISOString(), attachments: [{ url: localUrl, type: kind }],
    }]);
    try {
      const msg = await sendMediaMessage(wId, conversation.id, file, kind, user?.full_name || 'You');
      setMessages(prev => prev.map(m => m.id === tempId ? { ...msg, direction: 'outbound' } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    } finally {
      setUploading(false);
    }
  };

  const onFilePicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    handleSendMedia(file, kind);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        setRecording(false);
        setRecordSecs(0);
        if (blob.size > 0) {
          const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
          handleSendMedia(file, 'audio');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch (e) {
      console.error('[MessageThread] mic permission/recording error:', e);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
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
        {recording ? (
          <div className="flex items-center gap-3 bg-[#2A3942] rounded-xl px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="flex-1 text-sm text-white">Recording voice note… {String(Math.floor(recordSecs / 60)).padStart(2,'0')}:{String(recordSecs % 60).padStart(2,'0')}</p>
            <button onClick={stopRecording} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
              <Square className="w-3.5 h-3.5 text-white fill-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFilePicked} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || tab === 'note'}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-30">
              <Paperclip className="w-4.5 h-4.5" />
            </button>
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
            {!body.trim() && tab !== 'note' ? (
              <button onClick={startRecording} disabled={uploading}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 bg-[#2A3942] text-gray-300 hover:text-white disabled:opacity-30">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              </button>
            ) : (
              <button onClick={handleSend} disabled={!body.trim() || sending}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
                style={{ background: body.trim() ? '#25D366' : '#2A3942' }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
