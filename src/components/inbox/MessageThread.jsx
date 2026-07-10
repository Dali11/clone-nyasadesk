import { useState, useEffect, useRef, Fragment } from 'react';
import { Send, StickyNote, Loader2, Check, CheckCheck, X, Zap, Bot, Sparkles, Paperclip, Mic, Square, Play, Pause,
         ChevronDown, Copy, Share2, Pin, PinOff, Trash2, Ban, Reply, Palette, Download, Maximize2 } from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, format as formatDate } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { getMessages, sendMessage, sendMediaMessage, addNote, deleteMessage, setMessagePinned, subscribeToMessages, getCannedResponses, setChatBackground, getAiAgents, generateAiDraft } from '@/lib/channels';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { useToast } from '@/components/ui/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

const CHANNEL_COLOR = {
  whatsapp: '#DCF8C6',
  messenger: '#D6EAFF',
  email:     '#EDE9FE',
  website:   '#CFFAFE',
};

// Per-agent chat background presets — purely personal/local to whoever's
// viewing (stored on their own profile row), never shared with teammates.
const CHAT_BACKGROUNDS = {
  default: { label: 'Default', style: { background: 'var(--nyasa-bg)', backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '20px 20px' } },
  doodle:  { label: 'WhatsApp Doodle', style: { background: '#E9E3D7', backgroundImage: "url('https://user-images.githubusercontent.com/15075759/61976795-a6bc0100-af9f-11e9-8ba9-2ae1a4f6f42f.png')", backgroundSize: '400px' } },
  navy:    { label: 'Deep Navy', style: { background: '#0F1E33' } },
  black:   { label: 'Solid Black', style: { background: '#000000' } },
};
function backgroundStyle(bg) {
  if (bg && CHAT_BACKGROUNDS[bg]) return CHAT_BACKGROUNDS[bg].style;
  if (bg && /^https?:\/\//.test(bg)) return { backgroundImage: `url('${bg}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return CHAT_BACKGROUNDS.default.style;
}

// WhatsApp-style date separator label: "Today" / "Yesterday" / "March 3, 2026"
function dayLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return formatDate(d, 'MMMM d, yyyy');
}
function sameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function DateSeparator({ label }) {
  return (
    <div className="flex items-center justify-center my-3 select-none">
      <span className="text-[11px] font-medium text-gray-400 bg-white/5 px-3 py-1 rounded-full shadow-sm">
        {label}
      </span>
    </div>
  );
}

function StatusIcon({ status, errorReason }) {
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
  if (status === 'failed')    return <FailedIcon reason={errorReason} />;
  return null;
}
function FailedIcon({ reason }) {
  const msg = reason ? `Failed to send: ${reason}` : 'Failed to send (no reason recorded)';
  return (
    <X
      className="w-3 h-3 text-red-400 cursor-help"
      title={msg}
      onClick={(e) => { e.stopPropagation(); window.alert(msg); }}
    />
  );
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

function MediaAttachment({ att, onOpen }) {
  if (!att) return null;
  if (att.type === 'image') return (
    <button type="button" onClick={() => onOpen?.(att)} className="group relative block mb-1 rounded-lg overflow-hidden">
      <img src={att.url} alt="attachment" className="rounded-lg max-w-[240px] max-h-[240px] object-cover" />
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
      </span>
    </button>
  );
  if (att.type === 'video') return (
    <button type="button" onClick={() => onOpen?.(att)} className="group relative block mb-1 rounded-lg overflow-hidden max-w-[240px]">
      <video src={att.url} className="rounded-lg max-w-[240px] max-h-[240px] w-full pointer-events-none" />
      <span className="absolute inset-0 bg-black/25 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <span className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
        </span>
      </span>
    </button>
  );
  if (att.type === 'audio') return <AudioPlayer url={att.url} />;
  return null;
}

// Fullscreen media viewer -- opened by tapping any image/video thumbnail in
// the thread. Click backdrop or X (or Escape) to close; Download saves the
// original file. Video autoplays with real native controls at full size.
function MediaLightbox({ att, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!att) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <a
          href={att.url} download onClick={e => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {att.type === 'image' ? (
        <img src={att.url} alt="attachment" className="max-w-full max-h-full object-contain rounded-md" onClick={e => e.stopPropagation()} />
      ) : (
        <video src={att.url} controls autoPlay className="max-w-full max-h-full rounded-md" onClick={e => e.stopPropagation()} />
      )}
    </div>
  );
}

// WhatsApp-style action menu: a small always-reachable "chevron" button, a
// long-press (pointer-hold) on the bubble itself, and right-click on desktop
// all open the same dropdown — Copy / Share / Pin / Delete.
function MessageActionsMenu({ msg, isOut, open, onOpenChange, onCopy, onShare, onTogglePin, onDelete, onReply }) {
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
      <DropdownMenuContent align={isOut ? 'end' : 'start'} className="w-40 bg-[var(--nyasa-surface-3)] border-[var(--nyasa-border)] text-gray-200">
        {onReply && (
          <DropdownMenuItem onClick={onReply} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
            <Reply className="w-3.5 h-3.5" />Reply
          </DropdownMenuItem>
        )}
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

function Bubble({ msg, menuOpenId, onOpenMenu, onCopy, onShare, onDelete, onTogglePin, onReply, onJumpToReply, bubbleRef, onOpenMedia }) {
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
            onTogglePin={() => onTogglePin(msg)} onDelete={() => onDelete(msg)}
            onReply={() => onReply(msg)} />
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
        <div className="w-6 h-6 rounded-full bg-[var(--nyasa-surface-4)] flex items-center justify-center text-[9px] font-bold text-white shrink-0 mb-1">
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
        {msg.pinned && !isDeleted && (
          <Pin className={`w-3 h-3 absolute -top-1.5 ${isOut ? '-left-1.5' : '-right-1.5'} text-[#128C7E] fill-[#128C7E]/20`} />
        )}
        {msg.reply_to && !isDeleted && (
          <button
            onClick={e => { e.stopPropagation(); onJumpToReply?.(msg.reply_to.id); }}
            className="w-full text-left mb-1.5 pl-2 pr-2 py-1 rounded-md bg-black/10 border-l-[3px] border-[#128C7E] overflow-hidden"
          >
            <p className="text-[10px] font-semibold text-[#128C7E] truncate">{msg.reply_to.sender_name || 'Message'}</p>
            <p className="text-[11px] text-gray-600 truncate">{msg.reply_to.body || 'Attachment'}</p>
          </button>
        )}
        {isDeleted ? (
          <p className="italic text-gray-500 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />This message was deleted</p>
        ) : (
          <>
            {msg.channel === 'internal' && !isOut && msg.sender_name && (
              <p className="text-[10px] font-semibold text-[#128C7E] mb-0.5">{msg.sender_name}</p>
            )}
            {attachment && <MediaAttachment att={attachment} onOpen={onOpenMedia} />}
            {(!attachment || (msg.body && !['📷 Photo','🎥 Video','🎤 Voice message'].includes(msg.body))) && (() => {
              // Pure emoji reaction — render large with a subtle pill, no bubble chrome
              const isEmojiOnly = msg.body && /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\uFE0F|\u20E3)?$/u.test(msg.body.trim());
              if (isEmojiOnly) {
                return (
                  <span className="text-3xl leading-none select-none" title="Reaction">
                    {msg.body}
                  </span>
                );
              }
              return <p className="whitespace-pre-wrap break-words">{msg.body}</p>;
            })()}
          </>
        )}
        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <p className="text-[10px] text-gray-500">
            {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ''}
          </p>
          {isOut && !isDeleted && <StatusIcon status={msg.status} errorReason={msg.error_reason} />}
        </div>
        {!isDeleted && (
          <MessageActionsMenu msg={msg} isOut={isOut} open={menuOpen}
            onOpenChange={v => onOpenMenu(v ? msg.id : null)}
            onCopy={() => onCopy(msg)} onShare={() => onShare(msg)}
            onTogglePin={() => onTogglePin(msg)} onDelete={() => onDelete(msg)}
            onReply={() => onReply(msg)} />
        )}
      </div>
    </motion.div>
  );
}

export default function MessageThread({ conversation, workspaceId }) {
  const { user, profile } = useNyasaAuth();
  const { toast } = useToast();
  const [bg, setBg] = useState(profile?.chat_background || 'default');
  const [showBgPicker, setShowBgPicker] = useState(false);
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
  const [aiAgents, setAiAgents] = useState([]);
  const [showAiPicker, setShowAiPicker] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [lightboxMedia, setLightboxMedia] = useState(null); // { url, type } or null
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileInputRef = useRef(null);
  const messageRefs = useRef({}); // for the pinned-messages bar's "jump to" scroll
  const sendingRef = useRef(false); // synchronous lock — `sending` state alone can be bypassed
  // Track IDs of messages we've already inserted via the send/note response so
  // the realtime subscription can skip them (avoids optimistic duplicate).
  const settledIds = useRef(new Set());
                                     // if two triggers (e.g. Enter + click) fire before React re-renders
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const wId = workspaceId || user?.id;

  useEffect(() => { if (profile?.chat_background) setBg(profile.chat_background); }, [profile?.chat_background]);

  const chooseBackground = async (key) => {
    setBg(key);
    setShowBgPicker(false);
    try { await setChatBackground(user.id, key); } catch (e) { console.error('[MessageThread] failed to save background:', e); }
  };

  const chooseCustomBackground = async () => {
    const url = window.prompt('Paste an image URL to use as your chat background:');
    if (!url) return;
    await chooseBackground(url);
  };

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

  // Load active AI agents for the "Draft with AI" picker
  useEffect(() => {
    if (!wId) return;
    getAiAgents(wId).then(agents => setAiAgents(agents.filter(a => a.status === 'active'))).catch(() => setAiAgents([]));
  }, [wId]);

  // Generates a draft into the composer using the chosen agent's persona +
  // this conversation's history. Never auto-sends -- lands in the textarea
  // for a human to review/edit, same as picking a canned response.
  const handleAiDraft = async (agent) => {
    if (aiDrafting) return;
    setAiDrafting(true);
    setShowAiPicker(false);
    try {
      const draft = await generateAiDraft(wId, agent.id, conversation.id);
      setBody(draft);
      setTab('reply');
      inputRef.current?.focus();
    } catch (e) {
      console.error('[MessageThread] AI draft failed:', e);
      toast({ title: 'AI draft failed', description: e?.message || 'Unknown error', variant: 'destructive', duration: 5000 });
    } finally {
      setAiDrafting(false);
    }
  };

  // Realtime
  useEffect(() => {
    if (!conversation?.id) return;
    const sub = subscribeToMessages(conversation.id, (payload) => {
      const incoming = payload.new;
      if (!incoming?.id) return;
      // If we already inserted this message from the send() response, just
      // update in place (status/wamid may have been refreshed) and remove
      // from the settled set — don't append a duplicate.
      if (settledIds.current.has(incoming.id)) {
        settledIds.current.delete(incoming.id);
        setMessages(prev => prev.map(m => m.id === incoming.id ? { ...m, ...incoming } : m));
        return;
      }
      setMessages(prev => {
        const exists = prev.find(m => m.id === incoming.id);
        if (exists) return prev.map(m => m.id === incoming.id ? { ...m, ...incoming } : m);
        return [...prev, incoming];
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
    const replyToSnapshot = replyingTo
      ? { id: replyingTo.id, sender_name: replyingTo.direction === 'outbound' ? 'You' : (replyingTo.sender_name || conversation.contact_name), body: replyingTo.body || (replyingTo.attachments?.[0] ? `[${replyingTo.attachments[0].type}]` : '') }
      : null;
    setReplyingTo(null);

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
        const saved = await addNote(wId, conversation.id, text, user?.full_name || 'You', user?.id, replyToSnapshot);
        if (saved?.id) settledIds.current.add(saved.id);
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
      ...(replyToSnapshot ? { reply_to: replyToSnapshot } : {}),
    }]);

    try {
      const msg = await sendMessage(wId, conversation.id, text, user?.full_name || 'You', null, user?.id || null, replyToSnapshot);
      // Mark this real ID settled so the realtime sub won't add a duplicate
      if (msg?.id) settledIds.current.add(msg.id);
      // If msg.status === 'queued', we're offline — keep optimistic bubble with queued style
      setMessages(prev => prev.map(m => m.id === tempId ? { ...msg, direction: 'outbound' } : m));
      if (msg.status === 'queued') {
        toast({ title: 'No connection', description: 'Message queued — will send when back online 📤', variant: 'default' });
      }
    } catch (e) {
      console.error('[MessageThread] send failed:', e);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast({ title: 'Message failed to send', description: e?.message || 'Unknown error', variant: 'destructive', duration: 5000 });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSendMedia = async (file, kind) => {
    if (!file || !conversation) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: conversation.id, direction: 'outbound',
      body: kind === 'image' ? '📷 Photo' : kind === 'video' ? '🎥 Video' : '🎤 Voice message',
      channel: conversation.channel, sender_name: user?.full_name || 'You', status: 'sending',
      created_at: new Date().toISOString(), attachments: [{ url: localUrl, type: kind }],
    }]);
    try {
      const msg = await sendMediaMessage(wId, conversation.id, file, kind, user?.full_name || 'You', '', user?.id || null);
      if (msg?.id) settledIds.current.add(msg.id);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...msg, direction: 'outbound' } : m));
    } catch (e) {
      console.error('[MessageThread] media send failed:', e);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast({ title: `Failed to send ${kind}`, description: e?.message || 'Unknown error', variant: 'destructive', duration: 5000 });
    }
  };

  // Queue for multi-file uploads — processes files one at a time so the
  // UI shows each optimistic bubble before the next upload starts.
  const sendMediaQueue = async (files) => {
    setUploading(true);
    try {
      for (const file of files) {
        const kind = file.type.startsWith('video/') ? 'video' : 'image';
        await handleSendMedia(file, kind);
      }
    } finally {
      setUploading(false);
    }
  };

  const onFilePicked = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    sendMediaQueue(files);
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
          sendMediaQueue([file]);
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

  const handleReplyMessage = (msg) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const pinnedMessages = messages.filter(m => m.pinned && !m.deleted_at);

  if (!conversation) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={backgroundStyle(bg)}>

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <button
          onClick={() => scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--nyasa-surface-3)] border-b border-[var(--nyasa-border)] text-left hover:bg-[#243139] transition-colors"
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
          messages.map((msg, i) => {
            const ts = msg.created_at || msg.created_date;
            const prevTs = i > 0 ? (messages[i - 1].created_at || messages[i - 1].created_date) : null;
            const showSeparator = ts && !sameDay(ts, prevTs);
            return (
              <Fragment key={msg.id}>
                {showSeparator && <DateSeparator label={dayLabel(ts)} />}
                {i === 0 && msg.direction === 'inbound' && conversation?.contact_ad_attribution && (
                  <div className="flex justify-start px-3 pt-2 pb-0.5">
                    <div className="flex items-center gap-1.5 bg-[var(--nyasa-surface-2)] border border-[#25D366]/30 rounded-full px-2.5 py-1 max-w-[75%]">
                      {(conversation.contact_ad_attribution.image_url || conversation.contact_ad_attribution.thumbnail_url) ? (
                        <img
                          src={conversation.contact_ad_attribution.image_url || conversation.contact_ad_attribution.thumbnail_url}
                          alt="" className="w-4 h-4 rounded object-cover shrink-0"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <svg className="w-3 h-3 text-[#25D366] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      )}
                      <span className="text-[11px] text-[#25D366] font-medium truncate">
                        {conversation.contact_ad_attribution.headline
                          ? `Via: ${conversation.contact_ad_attribution.headline}`
                          : 'Started from an ad'}
                      </span>
                    </div>
                  </div>
                )}
                <Bubble
                  msg={msg}
                  bubbleRef={el => { if (el) messageRefs.current[msg.id] = el; }}
                  menuOpenId={menuOpenId}
                  onOpenMenu={setMenuOpenId}
                  onCopy={handleCopyMessage}
                  onShare={handleShareMessage}
                  onTogglePin={handleTogglePinMessage}
                  onDelete={handleDeleteMessage}
                  onReply={handleReplyMessage}
                  onJumpToReply={scrollToMessage}
                  onOpenMedia={setLightboxMedia}
                />
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] px-3 py-2">
        {/* Reply preview bar */}
        {replyingTo && (
          <div className="flex items-center gap-2 bg-[var(--nyasa-surface-2)] rounded-lg pl-2 pr-1 py-1.5 mb-2 border-l-[3px] border-[#25D366]">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[#25D366] truncate">
                Replying to {replyingTo.direction === 'outbound' ? 'yourself' : (replyingTo.sender_name || conversation.contact_name)}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{replyingTo.body || 'Attachment'}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1.5 text-gray-500 hover:text-gray-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Tab row */}
        <div className="flex gap-1 mb-2">
          {['reply', 'note'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[11px] font-semibold px-3 py-1 rounded-lg transition-colors capitalize
                ${tab === t ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'note' ? '📝 Note' : '💬 Reply'}
            </button>
          ))}

          {/* Background picker */}
          <div className="relative ml-auto">
            <button onClick={() => setShowBgPicker(s => !s)}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
              <Palette className="w-3.5 h-3.5" />
            </button>
            {showBgPicker && (
              <div className="absolute right-0 bottom-full mb-1 z-10 bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl p-2 w-40 shadow-lg space-y-0.5">
                <p className="text-[10px] text-gray-500 px-2 pb-1">Chat background (only for you)</p>
                {Object.entries(CHAT_BACKGROUNDS).map(([key, v]) => (
                  <button key={key} onClick={() => chooseBackground(key)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors ${bg === key ? 'text-[#25D366] font-semibold' : 'text-gray-300'}`}>
                    {v.label}
                  </button>
                ))}
                <button onClick={chooseCustomBackground}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-300">
                  Custom image URL…
                </button>
              </div>
            )}
          </div>

          {/* Canned response trigger */}
          <button onClick={() => setShowCanned(s => !s)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
            <Zap className="w-3.5 h-3.5" /> Quick
          </button>

          {/* AI draft trigger — only shows if the workspace has any active agents */}
          {aiAgents.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowAiPicker(s => !s)} disabled={aiDrafting}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50">
                {aiDrafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI draft
              </button>
              {showAiPicker && (
                <div className="absolute left-0 bottom-full mb-1 z-10 bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl p-1.5 w-52 shadow-lg space-y-0.5">
                  <p className="text-[10px] text-gray-500 px-2 pb-1">Draft a reply using…</p>
                  {aiAgents.map(a => (
                    <button key={a.id} onClick={() => handleAiDraft(a)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-300 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-[#25D366] shrink-0" /> {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canned responses */}
        <AnimatePresence>
          {showCanned && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
              <div className="bg-[var(--nyasa-surface-2)] rounded-xl border border-[var(--nyasa-border)] p-2 max-h-40 overflow-y-auto space-y-1">
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
          <div className="flex items-center gap-3 bg-[var(--nyasa-surface-4)] rounded-xl px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="flex-1 text-sm text-white">Recording voice note… {String(Math.floor(recordSecs / 60)).padStart(2,'0')}:{String(recordSecs % 60).padStart(2,'0')}</p>
            <button onClick={stopRecording} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
              <Square className="w-3.5 h-3.5 text-white fill-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onFilePicked} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || tab === 'note'}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-30">
              <Paperclip className="w-4.5 h-4.5" />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none placeholder:text-gray-600 leading-relaxed max-h-32"
              style={{ scrollbarWidth: 'thin' }}
              placeholder={tab === 'note' ? 'Add an internal note…' : conversation.channel === 'internal' ? 'Reply via internal message…' : `Reply via ${conversation.channel}…`}
              value={body}
              onChange={e => { setBody(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'; }}
              onKeyDown={handleKeyDown}
            />
            {!body.trim() && tab !== 'note' ? (
              <button onClick={startRecording} disabled={uploading}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 bg-[var(--nyasa-surface-4)] text-gray-300 hover:text-white disabled:opacity-30">
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

      {lightboxMedia && <MediaLightbox att={lightboxMedia} onClose={() => setLightboxMedia(null)} />}
    </div>
  );
}
