import { useState, useEffect, useRef } from 'react';
import { Send, StickyNote, Loader2, Check, CheckCheck, X, Zap, Paperclip, Mic, Square, Play, Pause,
         ChevronDown, Copy, Share2, Pin, PinOff, Trash2, Ban } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { getMessages, sendMessage, sendMediaMessage, addNote, deleteMessage, setMessagePinned, subscribeToMessages, getCannedResponses } from '@/lib/channels';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

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
  if (status === 'failed')    return <X className="w-3 h-3 text-red-400" title="Failed to send" />;
  return null;
}

// WhatsApp's Cloud API only accepts specific audio containers/codecs for
// outbound media: OGG (Opus only), MP4/AAC, MPEG (mp3), and AMR. The
// browser's default MediaRecorder output — audio/webm — is NOT in that
// list, so a plain `new MediaRecorder(stream)` recording silently gets
// rejected by Meta on send (it still plays fine locally/on the website
// widget, since that never leaves the browser — hence "only works web to
// web"). Ask the browser to record directly into a format WhatsApp
// actually accepts, in priority order.
const AUDIO_MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',  // Chrome/Firefox/Android — WhatsApp's own native voice-note format
  'audio/mp4',              // Safari/iOS — AAC in MP4, also WhatsApp-compatible
  'audio/webm;codecs=opus', // last-resort fallback — NOT WhatsApp-compatible, website-only
];
function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const mt of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return '';
}
function extForMime(mime) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

// Module-level singleton — WhatsApp-style "only one voice note plays at a
// time": starting a new one pauses whatever else was playing.
let currentlyPlayingAudioEl = null;

function formatAudioTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PLAYBACK_RATES = [1, 1.5, 2];

function AudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef(null);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      if (currentlyPlayingAudioEl && currentlyPlayingAudioEl !== audio) currentlyPlayingAudioEl.pause();
      currentlyPlayingAudioEl = audio;
      audio.play().catch(() => {});
    }
  };

  const seekToClientX = (clientX) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const cycleRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex items-center gap-2 min-w-[210px] select-none">
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center shrink-0">
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          ref={barRef}
          className="h-1.5 bg-black/20 rounded-full overflow-hidden cursor-pointer relative"
          onMouseDown={e => { setDragging(true); seekToClientX(e.clientX); }}
          onMouseMove={e => { if (dragging) seekToClientX(e.clientX); }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={e => seekToClientX(e.touches[0].clientX)}
        >
          <div className="h-full bg-current opacity-60 rounded-full" style={{ width: pct + '%' }} />
        </div>
        <div className="flex items-center justify-between text-[10px] opacity-70 leading-none">
          <span>{formatAudioTime(currentTime)}</span>
          <button onClick={cycleRate} className="font-bold px-1 rounded hover:bg-black/10">{rate}x</button>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={e => setDuration(e.target.duration || 0)}
        onDurationChange={e => setDuration(e.target.duration || 0)}
        onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
      />
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

// WhatsApp-style action menu: a small always-reachable "chevron" button, a
// long-press (pointer-hold) on the bubble itself, and right-click on desktop
// all open the same dropdown — Copy / Share / Pin / Delete.
function MessageActionsMenu({ msg, isOut, open, onOpenChange, onCopy, onShare, onTogglePin, onDelete }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className={`absolute top-0.5 ${isOut ? 'left-0.5' : 'right-0.5'} w-6 h-6 rounded-full flex items-center justify-center
            text-gray-600 bg-black/5 hover:bg-black/15 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isOut ? 'end' : 'start'} className="w-40 bg-[#233138] border-white/10 text-gray-200">
        {msg.body && (
          <DropdownMenuItem onClick={onCopy} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
            <Copy className="w-3.5 h-3.5" />Copy
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onShare} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
          <Share2 className="w-3.5 h-3.5" />Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePin} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
          {msg.pinned ? <><PinOff className="w-3.5 h-3.5" />Unpin</> : <><Pin className="w-3.5 h-3.5" />Pin</>}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={onDelete} className="text-xs gap-2 text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Bubble({ msg, menuOpenId, onOpenMenu, onCopy, onShare, onDelete, onTogglePin, bubbleRef }) {
  const isNote     = msg.direction === 'note';
  const isActivity = msg.direction === 'activity';
  const isOut      = msg.direction === 'outbound';
  const isDeleted  = !!msg.deleted_at;
  const ts         = msg.created_at || msg.created_date;
  const bubbleColor = isOut ? (CHANNEL_COLOR[msg.channel] || '#DCF8C6') : '#FFFFFF';
  const attachment = Array.isArray(msg.attachments) ? msg.attachments[0] : null;
  const menuOpen = menuOpenId === msg.id;

  // Long-press (pointer-hold, works for touch + mouse) opens the same menu as
  // the chevron button and right-click — mirrors WhatsApp's "hold on message".
  const pressTimer = useRef(null);
  const startPress = () => { pressTimer.current = setTimeout(() => onOpenMenu(msg.id), 450); };
  const clearPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const handleContextMenu = (e) => { e.preventDefault(); onOpenMenu(msg.id); };

  if (isActivity) return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] text-gray-500 bg-black/20 px-3 py-1 rounded-full">{msg.body}</span>
    </div>
  );

  if (isNote) return (
    <div className="flex justify-center py-1" ref={bubbleRef}>
      <div
        className="group relative max-w-[78%] bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-4 py-2 text-xs text-yellow-200"
        onPointerDown={!isDeleted ? startPress : undefined}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={!isDeleted ? handleContextMenu : undefined}
      >
        <div className="flex items-center gap-1 mb-1">
          <StickyNote className="w-3 h-3 text-yellow-400" />
          <span className="font-semibold text-yellow-400">Note · {msg.sender_name}</span>
          {msg.pinned && <Pin className="w-2.5 h-2.5 text-yellow-400 ml-auto" />}
        </div>
        {isDeleted ? (
          <p className="italic text-yellow-500/60 flex items-center gap-1"><Ban className="w-3 h-3" />This note was deleted</p>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
        )}
        {!isDeleted && (
          <MessageActionsMenu msg={msg} isOut={false} open={menuOpen}
            onOpenChange={v => onOpenMenu(v ? msg.id : null)}
            onCopy={() => onCopy(msg)} onShare={() => onShare(msg)}
            onTogglePin={() => onTogglePin(msg)} onDelete={() => onDelete(msg)} />
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      ref={bubbleRef}
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
        className="group relative max-w-[72%] px-3 py-2 shadow-sm text-sm leading-relaxed"
        style={{
          background: bubbleColor,
          color: '#1a2530',
          borderRadius: isOut ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
        }}
        onPointerDown={!isDeleted ? startPress : undefined}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={!isDeleted ? handleContextMenu : undefined}
      >
        {!isOut && msg.sender_name && (
          <p className="text-[10px] font-semibold text-[#128C7E] mb-0.5">{msg.sender_name}</p>
        )}
        {msg.pinned && !isDeleted && (
          <Pin className={`w-3 h-3 absolute -top-1.5 ${isOut ? '-left-1.5' : '-right-1.5'} text-[#128C7E] fill-[#128C7E]/20`} />
        )}
        {isDeleted ? (
          <p className="italic text-gray-500 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />This message was deleted</p>
        ) : (
          <>
            {attachment && <MediaAttachment att={attachment} />}
            {(!attachment || (msg.body && !['📷 Photo','🎥 Video','🎤 Voice message'].includes(msg.body))) && (
              <p className="whitespace-pre-wrap break-words">{msg.body}</p>
            )}
          </>
        )}
        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <p className="text-[10px] text-gray-500">
            {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ''}
          </p>
          {isOut && !isDeleted && <StatusIcon status={msg.status} />}
        </div>
        {!isDeleted && (
          <MessageActionsMenu msg={msg} isOut={isOut} open={menuOpen}
            onOpenChange={v => onOpenMenu(v ? msg.id : null)}
            onCopy={() => onCopy(msg)} onShare={() => onShare(msg)}
            onTogglePin={() => onTogglePin(msg)} onDelete={() => onDelete(msg)} />
        )}
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
  const [menuOpenId, setMenuOpenId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileInputRef = useRef(null);
  const messageRefs = useRef({}); // for the pinned-messages bar's "jump to" scroll
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
      const msg = await sendMessage(wId, conversation.id, text, user?.full_name || 'You', null, user?.id || null);
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
      const msg = await sendMediaMessage(wId, conversation.id, file, kind, user?.full_name || 'You', '', user?.id || null);
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
      const chosenMime = pickRecorderMimeType();
      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const actualMime = recorder.mimeType || chosenMime || 'audio/webm';
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(recordChunksRef.current, { type: actualMime });
        setRecording(false);
        setRecordSecs(0);
        if (blob.size > 0) {
          const file = new File([blob], `voice-note-${Date.now()}.${extForMime(actualMime)}`, { type: actualMime });
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

  // ── Message actions: copy / share / pin / delete ──────────────────────────
  const handleCopyMessage = (msg) => {
    const text = msg.body || msg.attachments?.[0]?.url || '';
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  };

  const handleShareMessage = async (msg) => {
    const text = msg.body || '';
    const url = msg.attachments?.[0]?.url;
    try {
      if (navigator.share) {
        await navigator.share(url ? { text: text || undefined, url } : { text });
      } else {
        await navigator.clipboard.writeText(url || text);
      }
    } catch (e) {
      // user cancelled the native share sheet, or clipboard denied — no-op
    }
  };

  const handleTogglePinMessage = async (msg) => {
    const next = !msg.pinned;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: next } : m));
    try {
      await setMessagePinned(msg.id, next);
    } catch (e) {
      console.error('[MessageThread] failed to toggle pin:', e);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: !next } : m));
    }
  };

  const handleDeleteMessage = async (msg) => {
    if (!window.confirm('Delete this message? This can\'t be undone.')) return;
    const prevMsg = msg;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, deleted_at: new Date().toISOString(), body: null, attachments: null } : m));
    try {
      await deleteMessage(msg.id);
    } catch (e) {
      console.error('[MessageThread] failed to delete message:', e);
      setMessages(prev => prev.map(m => m.id === msg.id ? prevMsg : m));
    }
  };

  const scrollToMessage = (id) => {
    messageRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const pinnedMessages = messages.filter(m => m.pinned && !m.deleted_at);

  if (!conversation) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0B141A]"
      style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '20px 20px' }}>

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <button
          onClick={() => scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#1F2C34] border-b border-white/5 text-left hover:bg-[#243139] transition-colors"
        >
          <Pin className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
          <p className="flex-1 min-w-0 text-xs text-gray-300 truncate">
            <span className="font-semibold text-[#25D366]">{pinnedMessages.length} pinned</span>
            {' · '}{pinnedMessages[pinnedMessages.length - 1].body || 'Attachment'}
          </p>
        </button>
      )}

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
          messages.map(msg => (
            <Bubble
              key={msg.id}
              msg={msg}
              bubbleRef={el => { if (el) messageRefs.current[msg.id] = el; }}
              menuOpenId={menuOpenId}
              onOpenMenu={setMenuOpenId}
              onCopy={handleCopyMessage}
              onShare={handleShareMessage}
              onTogglePin={handleTogglePinMessage}
              onDelete={handleDeleteMessage}
            />
          ))
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
