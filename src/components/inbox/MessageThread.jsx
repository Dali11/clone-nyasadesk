import {useState, useEffect, useRef, Fragment}from 'react';
import {
  Send,
  StickyNote,
  Loader2,
  Check,
  CheckCheck,
  X,
  Zap,
  Bot,
  Sparkles,
  Paperclip,
  Mic,
  Square,
  Play,
  Pause,
  ChevronDown,
  Copy,
  Share2,
  Forward,
  MapPin,
  Pin,
  PinOff,
  Trash2,
  Ban,
  Reply,
  Palette,
  Smile,
  Download,
  Maximize2,
}from 'lucide-react';
import {formatDistanceToNow, isToday, isYesterday, format as formatDate}from 'date-fns';
import {motion, AnimatePresence}from 'framer-motion';
import {getMessages, sendMessage, sendMediaMessage, addNote, deleteMessage, setMessagePinned, setMessageReaction, subscribeToMessages, getCannedResponses, setChatBackground, getAiAgents, generateAiDraft}from '@/lib/channels';

import {useNyasaAuth}from '@/lib/NyasaAuth';
import {useToast}from '@/components/ui/use-toast';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator}from '@/components/ui/dropdown-menu';
import EmojiPicker from 'emoji-picker-react';

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
    <div className="flex justify-center py-3">
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
function FailedIcon({ reason, onRetry }) {
  const msg = reason ? `Failed: ${reason}` : 'Failed to send — tap for details';
  return (
    <span className="inline-flex items-center gap-1">
      <X
        className="w-3 h-3 text-red-400 cursor-help shrink-0"
        title={msg}
        onClick={(e) => { e.stopPropagation(); window.alert(msg); }}
      />
      {onRetry && (
        <button
          className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-1 leading-none"
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
        >
          Retry
        </button>
      )}
    </span>
  );
}

// ── Voice note recorder ───────────────────────────────────────────────────────
// Meta Cloud API only accepts: audio/ogg;codecs=opus, audio/mpeg, audio/mp4,
// audio/aac, audio/amr.  audio/webm (Chrome's default) is REJECTED (error 131053).
// Strategy:
//   1. Prefer ogg/opus  — natively supported on Chrome/Firefox/Android
//   2. Fall back to mp4 — Safari/iOS
//   3. If neither, use webm BUT tag the blob as audio/ogg so Meta treats it
//      as ogg (the container bytes don't match but the codec is still opus,
//      and Meta validates codec not container for ogg messages)
//   The server-side normalisation in whatsapp.js will also sanitise the MIME
//   before uploading to the /media endpoint.

const VN_MIME_PREFERENCE = [
  'audio/ogg;codecs=opus',
  'audio/ogg; codecs=opus',
  'audio/webm;codecs=opus', // Chrome — we'll re-label as ogg on the blob
  'audio/mp4',
  'audio/mpeg',
];

function pickVoiceMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of VN_MIME_PREFERENCE) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) {}
  }
  return '';
}

// Returns the MIME we'll tag the blob with — normalised to a Meta-accepted type.
function normaliseMime(rawMime) {
  if (!rawMime) return 'audio/ogg; codecs=opus';
  // webm/opus — relabel as ogg (opus codec is the same; Meta validates codec)
  if (rawMime.includes('webm')) return 'audio/ogg; codecs=opus';
  // Already ogg or mp4/mpeg/amr — leave as-is but ensure full codecs tag for ogg
  if (rawMime.includes('ogg')) return 'audio/ogg; codecs=opus';
  if (rawMime.includes('mp4')) return 'audio/mp4';
  if (rawMime.includes('mpeg') || rawMime.includes('mp3')) return 'audio/mpeg';
  if (rawMime.includes('amr')) return 'audio/amr';
  return 'audio/ogg; codecs=opus'; // safe fallback
}

function extForVoiceMime(mime) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('amr')) return 'amr';
  return 'ogg';
}

function createVoiceRecorder(onStop) {
  const chunks = [];
  let stream = null;
  let recorder = null;
  let cancelled = false;

  const start = async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chosenMime = pickVoiceMime();
    recorder = chosenMime
      ? new MediaRecorder(stream, { mimeType: chosenMime })
      : new MediaRecorder(stream);
    chunks.length = 0;
    cancelled = false;

    recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      stream?.getTracks().forEach(t => t.stop());
      if (cancelled || chunks.length === 0) return;

      const rawMime = recorder.mimeType || chosenMime || 'audio/webm';
      const targetMime = normaliseMime(rawMime);
      const ext = extForVoiceMime(targetMime);

      // Re-label blob with the Meta-accepted MIME type
      const blob = new Blob(chunks, { type: targetMime });
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: targetMime });
      console.log('[VoiceNote] recorded mime:', rawMime, '→ sending as:', targetMime, 'size:', file.size);
      onStop(file);
    };

    recorder.start();
  };

  const stop = () => { if (recorder?.state === 'recording') recorder.stop(); };
  const cancel = () => {
    cancelled = true;
    stream?.getTracks().forEach(t => t.stop());
    if (recorder?.state === 'recording') recorder.stop();
  };

  return { start, stop, cancel };
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
    <button type="button" onClick={() => att.sending ? undefined : onOpen?.(att)}
      className="group relative block mb-1 rounded-lg overflow-hidden">
      <img src={att.url} alt="attachment"
        className={`rounded-lg max-w-[240px] max-h-[240px] object-cover transition-opacity ${att.sending ? 'opacity-60' : 'opacity-100'}`} />
      {att.sending ? (
        /* Upload-in-progress overlay — shimmer + spinner + label */
        <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-lg">
          <Loader2 className="w-7 h-7 text-white animate-spin mb-1" />
          <span className="text-white text-[10px] font-semibold tracking-wide">Sending…</span>
        </span>
      ) : (
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
        </span>
      )}
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

  if (att.type === 'document') {
    const ext = att.filename ? att.filename.split('.').pop().toUpperCase() : 'FILE';
    const EXT_ICON = { PDF: '📄', DOC: '📝', DOCX: '📝', XLS: '📊', XLSX: '📊', PPT: '📋', PPTX: '📋', CSV: '📊', TXT: '📝', ZIP: '🗜️' };
    const icon = EXT_ICON[ext] || '📎';
    return (
      <div className="flex items-center gap-3 mb-1 p-3 rounded-lg bg-black/10 min-w-[180px] max-w-[240px]
                      hover:bg-black/20 transition-colors relative">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{att.filename || 'Document'}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {att.sending ? (
              <span className="flex items-center gap-1 text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />Uploading…
              </span>
            ) : `${ext} · Tap to open`}
          </p>
        </div>
        {att.sending
          ? <Loader2 className="w-4 h-4 shrink-0 text-blue-400 animate-spin" />
          : <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.filename}>
              <Download className="w-4 h-4 shrink-0 text-[#128C7E]" />
            </a>
        }
      </div>
    );
  }

  if (att.type === 'sticker') return (
    <img src={att.url} alt="sticker" className="w-28 h-28 object-contain mb-1" />
  );

  if (att.type === 'contact') return (
    <div className="flex items-center gap-2 mb-1 p-2.5 rounded-lg bg-black/10 min-w-[160px] max-w-[220px]">
      <div className="w-8 h-8 rounded-full bg-[#128C7E]/30 flex items-center justify-center text-sm font-bold text-[#128C7E] shrink-0">
        {(att.name || '?')[0].toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate">{att.name || 'Contact'}</p>
        {att.phone && <p className="text-[10px] text-gray-500">{att.phone}</p>}
      </div>
    </div>
  );

  if (att.type === 'location') return (
    <a href={`https://maps.google.com/?q=${att.latitude},${att.longitude}`}
       target="_blank" rel="noopener noreferrer"
       className="flex items-center gap-2.5 mb-1 p-2.5 rounded-lg bg-black/10 hover:bg-black/20 transition-colors min-w-[180px] max-w-[240px]">
      <MapPin className="w-8 h-8 text-[#25D366] shrink-0" />
      <div className="min-w-0">
        {att.name && <p className="text-xs font-semibold truncate">{att.name}</p>}
        {att.address && <p className="text-[11px] text-gray-500 truncate">{att.address}</p>}
        {!att.name && !att.address && (
          <p className="text-xs font-semibold">{Number(att.latitude).toFixed(4)}, {Number(att.longitude).toFixed(4)}</p>
        )}
        <p className="text-[10px] text-[#128C7E] mt-0.5">Open in Maps ↗</p>
      </div>
    </a>
  );

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

// ── Forward Message Modal ────────────────────────────────────────────────────
// Lets the agent forward any message to another conversation in the workspace.
function ForwardModal({ msg, workspaceId, onClose }) {
  const [query, setQuery] = useState('');
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/channels?action=list_conversations&workspace_id=${workspaceId}`)
      .then(r => r.json())
      .then(d => setConvs(d.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const filtered = convs.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (c.contact_name || '').toLowerCase().includes(q) || (c.channel || '').toLowerCase().includes(q);
  });

  const forward = async (target) => {
    setSending(target.id);
    try {
      const _fRes = await fetch('/api/channels?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          conversation_id: target.id,
          channel: target.channel,
          body: msg.body || '',
          ...(msg.attachments?.[0] ? { attachments: [msg.attachments[0]] } : {}),
        }),
      });
      if (!_fRes.ok) throw new Error('Forward failed');
      setDone(target.contact_name || 'conversation');
      setTimeout(onClose, 1500);
    } catch {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--nyasa-surface-2)] rounded-2xl w-full max-w-sm shadow-2xl border border-[var(--nyasa-border)]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nyasa-border)]">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Forward className="w-4 h-4 text-[#25D366]" />Forward to…
          </p>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] placeholder:text-gray-600"
          />
        </div>
        <div className="max-h-64 overflow-y-auto px-2 pb-3" style={{ scrollbarWidth: 'thin' }}>
          {loading && <p className="text-xs text-gray-500 text-center py-4">Loading…</p>}
          {done && <p className="text-xs text-[#25D366] text-center py-4 font-medium">✓ Forwarded to {done}</p>}
          {!loading && !done && filtered.map(c => (
            <button key={c.id} onClick={() => forward(c)}
              disabled={!!sending}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left disabled:opacity-60">
              <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center text-sm font-bold text-[#25D366] shrink-0">
                {(c.contact_name || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{c.contact_name || 'Unknown'}</p>
                <p className="text-[10px] text-gray-500 capitalize">{c.channel}</p>
              </div>
              {sending === c.id && <Loader2 className="w-3.5 h-3.5 text-[#25D366] animate-spin shrink-0" />}
            </button>
          ))}
          {!loading && !done && !filtered.length && (
            <p className="text-xs text-gray-600 text-center py-4">No conversations found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// WhatsApp-style action menu: a small always-reachable "chevron" button, a
// long-press (pointer-hold) on the bubble itself, and right-click on desktop
// all open the same dropdown — Copy / Share / Pin / Delete.
function MessageActionsMenu({ msg, isOut, open, onOpenChange, onCopy, onShare, onForward, onTogglePin, onDelete, onReact, onReply }) {
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
        {onReact && (
          <DropdownMenuItem onClick={onReact} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
            <Smile className="w-3.5 h-3.5" />React
          </DropdownMenuItem>
        )}
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
        <DropdownMenuItem onClick={onForward} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
          <Forward className="w-3.5 h-3.5" />Forward
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onShare} className="text-xs gap-2 hover:bg-white/10 focus:bg-white/10 cursor-pointer">
          <Share2 className="w-3.5 h-3.5" />Share externally
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

// ─────────────────────────────────────────────────────────────────────────────
// ImageAlbum — WhatsApp-style mosaic grid for grouped images
// ─────────────────────────────────────────────────────────────────────────────
function ImageAlbum({ images, onOpen }) {
  if (!images?.length) return null;
  const count = images.length;
  const shown = count > 4 ? images.slice(0, 4) : images;
  const extra = count > 4 ? count - 3 : 0;

  const Cell = ({ img, idx, className = '' }) => (
    <div
      className={`relative overflow-hidden rounded-md ${className}`}
      onClick={() => !img.sending && onOpen?.(img)}
    >
      <img
        src={img.url}
        alt=""
        className={`w-full h-full object-cover transition-opacity ${img.sending ? 'opacity-50' : 'opacity-100'}`}
      />
      {/* Upload spinner */}
      {img.sending && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </span>
      )}
      {/* +N overflow badge on 4th cell */}
      {extra > 0 && idx === 3 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55">
          <span className="text-white text-xl font-bold">+{extra}</span>
        </span>
      )}
      {/* Hover expand icon */}
      {!img.sending && !(extra > 0 && idx === 3) && (
        <span className="group absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors cursor-pointer">
          <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      )}
    </div>
  );

  // 1 image — single full-width
  if (count === 1) {
    return (
      <div className="mb-1 rounded-lg overflow-hidden" style={{ maxWidth: 240 }}>
        <Cell img={shown[0]} idx={0} className="h-48 w-full" />
      </div>
    );
  }

  // 2 images — side by side
  if (count === 2) {
    return (
      <div className="flex gap-0.5 mb-1 rounded-lg overflow-hidden" style={{ maxWidth: 240, height: 160 }}>
        {shown.map((img, i) => <Cell key={i} img={img} idx={i} className="flex-1" />)}
      </div>
    );
  }

  // 3 images — 1 large left + 2 stacked right
  if (count === 3) {
    return (
      <div className="flex gap-0.5 mb-1 rounded-lg overflow-hidden" style={{ maxWidth: 240, height: 200 }}>
        <Cell img={shown[0]} idx={0} className="w-3/5" />
        <div className="flex flex-col gap-0.5 flex-1">
          <Cell img={shown[1]} idx={1} className="flex-1" />
          <Cell img={shown[2]} idx={2} className="flex-1" />
        </div>
      </div>
    );
  }

  // 4+ images — 2×2 grid (4th cell may show +N)
  return (
    <div
      className="grid gap-0.5 mb-1 rounded-lg overflow-hidden"
      style={{ maxWidth: 240, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', height: 238 }}
    >
      {shown.map((img, i) => <Cell key={i} img={img} idx={i} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// groupMessages — merge consecutive same-sender image messages within 60s
// into a single synthetic album pseudo-message for rendering.
// Pure function — called during render, not stored in state.
// ─────────────────────────────────────────────────────────────────────────────
function groupMessages(messages) {
  const result = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const att = Array.isArray(msg.attachments) ? msg.attachments[0] : null;
    // Only group outbound/inbound image attachments; leave everything else solo
    const isImg = att?.type === 'image' && !msg._isAlbum;

    if (!isImg) { result.push(msg); i++; continue; }

    // Collect run of consecutive matching image messages
    const group = [msg];
    let j = i + 1;
    while (j < messages.length) {
      const next = messages[j];
      const nextAtt = Array.isArray(next.attachments) ? next.attachments[0] : null;
      if (
        nextAtt?.type === 'image' &&
        !next._isAlbum &&
        next.direction === msg.direction &&
        next.sender_name === msg.sender_name &&
        Math.abs(new Date(next.created_at || next.created_date) - new Date(msg.created_at || msg.created_date)) <= 60000
      ) {
        group.push(next);
        j++;
      } else break;
    }

    if (group.length === 1) {
      result.push(msg);
    } else {
      // Synthesise album pseudo-message
      const lastStatus = group[group.length - 1].status;
      result.push({
        ...msg,
        _isAlbum: true,
        _albumImages: group.map(m => ({
          ...(Array.isArray(m.attachments) ? m.attachments[0] : {}),
          msgId: m.id,
          sending: m.status === 'sending',
          failed: m.status === 'failed',
        })),
        _albumStatus: group.some(m => m.status === 'sending') ? 'sending'
          : group.some(m => m.status === 'failed') ? 'failed'
          : lastStatus || 'sent',
        attachments: null,
        body: null,
      });
    }
    i = j;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ReactionPicker — quick emoji bar that appears on hover (WhatsApp-style)
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function ReactionPicker({ onReact, side = 'left' }) {
  return (
    <div
      className={`absolute -top-9 ${side === 'right' ? 'right-0' : 'left-0'} z-20 flex items-center gap-0.5 bg-[#1F2C34] border border-white/10 rounded-full px-1.5 py-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      style={{ animation: 'none' }}
    >
      {QUICK_REACTIONS.map(emoji => (
        <button
          key={emoji}
          onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
          className="text-lg hover:scale-125 transition-transform duration-100 px-0.5"
          title={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReactionBadges — emoji + count pills below the bubble
// ─────────────────────────────────────────────────────────────────────────────
function ReactionBadges({ reactions, currentUserId, onReact }) {
  if (!reactions || typeof reactions !== 'object') return null;
  const entries = Object.entries(reactions).filter(([_, users]) => users?.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${'justify-start'}`}>
      {entries.map(([emoji, users]) => {
        const reactedByMe = users.some(u => u.id === currentUserId);
        return (
          <button
            key={emoji}
            onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] transition-colors ${
              reactedByMe
                ? 'bg-[#00A884]/30 border border-[#00A884]/50 text-white'
                : 'bg-black/20 border border-white/10 text-gray-300'
            }`}
          >
            <span className="text-xs leading-none">{emoji}</span>
            <span className="font-medium leading-none">{users.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function Bubble({ msg, menuOpenId, onOpenMenu, onCopy, onShare, onForward, onDelete, onTogglePin, onReact, currentUserId, onReply, onJumpToReply, bubbleRef, onOpenMedia }) {
  const isNote     = msg.direction === 'note';
  const isActivity = msg.direction === 'activity';
  const isOut      = msg.direction === 'outbound';
  const isDeleted  = !!msg.deleted_at;
  const ts         = msg.created_at || msg.created_date;
  const bubbleColor = isOut ? '#005C4B' : '#1F2C34';
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
      <span className="text-[11px] px-3 py-1.5 rounded-lg text-center" style={{background:"rgba(11,20,26,0.8)",color:"#8696A0"}}>{msg.body}</span>
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
            onCopy={() => onCopy(msg)} onShare={() => onShare(msg)} onForward={() => onForward(msg)}
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

      <div
        className="group relative max-w-[72%] px-3 py-2 shadow-sm text-sm leading-relaxed"
        style={{
          background: bubbleColor,
          color: '#E9EDEF',
          borderRadius: isOut ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
        }}
        onPointerDown={!isDeleted ? startPress : undefined}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={!isDeleted ? handleContextMenu : undefined}
      >
        {!isDeleted && onReact && (
          <ReactionPicker onReact={(emoji) => onReact(msg, emoji)} side={isOut ? 'right' : 'left'} />
        )}
        {msg.pinned && !isDeleted && (
          <Pin className={`w-3 h-3 absolute -top-1.5 ${isOut ? '-left-1.5' : '-right-1.5'} text-[#128C7E] fill-[#128C7E]/20`} />
        )}
        {msg.reply_to && !isDeleted && (
          <button
            onClick={e => { e.stopPropagation(); onJumpToReply?.(msg.reply_to.id); }}
            className="w-full text-left mb-1.5 pl-2 pr-2 py-1 rounded-md bg-black/20 border-l-[3px] border-[#00A884] overflow-hidden"
          >
            <p className="text-[10px] font-semibold text-[#00A884] truncate">{msg.reply_to.sender_name || 'Message'}</p>
            <p className="text-[11px] text-[#8696A0] truncate">{msg.reply_to.body || 'Attachment'}</p>
          </button>
        )}
        {isDeleted ? (
          <p className="italic text-gray-500 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />This message was deleted</p>
        ) : (
          <>
            {msg.channel === 'internal' && !isOut && msg.sender_name && (
              <p className="text-[10px] font-semibold text-[#00A884] mb-0.5">{msg.sender_name}</p>
            )}
            {msg._isAlbum && Array.isArray(msg._albumImages)
              ? <ImageAlbum images={msg._albumImages} onOpen={onOpenMedia} />
              : attachment
                ? <MediaAttachment att={attachment} onOpen={onOpenMedia} />
                : null}
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
          <p className="text-[10px]" style={{color:'#8696A0'}}>
            {ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}
          </p>
          {isOut && !isDeleted && <StatusIcon status={msg.status} errorReason={msg.error_reason} />}
        </div>
        {!isDeleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <ReactionBadges reactions={msg.reactions} currentUserId={currentUserId} onReact={(emoji) => onReact(msg, emoji)} />
        )}
        {!isDeleted && (
          <MessageActionsMenu msg={msg} isOut={isOut} open={menuOpen}
            onOpenChange={v => onOpenMenu(v ? msg.id : null)}
            onCopy={() => onCopy(msg)} onShare={() => onShare(msg)} onForward={() => onForward(msg)}
            onTogglePin={() => onTogglePin(msg)} onDelete={() => onDelete(msg)}
            onReact={() => onReact(msg, null)} onReply={() => onReply(msg)} />
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [body, setBody]           = useState('');
  const [tab, setTab]             = useState('reply'); // reply | note
  const [sending, setSending]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 }); // X of N counter
  const [showLocationSender, setShowLocationSender] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [canned, setCanned] = useState([]);
  const [aiAgents, setAiAgents] = useState([]);
  const [showAiPicker, setShowAiPicker] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactingToMsg, setReactingToMsg] = useState(null); // when reacting via context menu
  const [pinnedBannerIdx, setPinnedBannerIdx] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState(null); // { url, type } or null
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const docInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const messageRefs = useRef({}); // for the pinned-messages bar's "jump to" scroll
  const sendingRef = useRef(false); // synchronous lock — `sending` state alone can be bypassed
  // Track IDs of messages we've already inserted via the send/note response so
  // the realtime subscription can skip them (avoids optimistic duplicate).
  const settledIds = useRef(new Set());
                                     // if two triggers (e.g. Enter + click) fire before React re-renders
  const mediaRecorderRef = useRef(null); // holds the createVoiceRecorder() instance
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

  // Emoji picker is now a bottom-sheet with its own overlay — no document handler needed

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
      const previous = payload.old;
      if (!incoming?.id) return;

      // Status 'failed' — only log to console, don't show toast to users.
      // The red ✕ on the message bubble is the only UI feedback needed.
      if (incoming.status === 'failed' && previous?.status !== 'failed') {
        console.warn('[MessageThread] message failed:', incoming.id, incoming.error_reason);
      }

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
    // Reset textarea height back to 1 row immediately after send
    if (inputRef.current) inputRef.current.style.height = '';
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
      console.error('[MessageThread] send error:', e?.message);
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
      body: kind === 'image' ? '📷 Photo' : kind === 'video' ? '🎥 Video' : kind === 'audio' ? '🎤 Voice message' : '📎 Document',
      channel: conversation.channel, sender_name: user?.full_name || 'You', status: 'sending',
      created_at: new Date().toISOString(),
      // Mark attachment as sending so the bubble shows the upload overlay
      attachments: [{ url: localUrl, type: kind, sending: true }],
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
  const handleSendLocation = async (lat, lng, name) => {
    setShowLocationSender(false);
    try {
      await fetch('/api/channels?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          conversation_id: conversation.id,
          channel: conversation.channel,
          message_type: 'location',
          location: { latitude: lat, longitude: lng, name: name || undefined },
        }),
      });
    } catch (e) {
      console.error('[sendLocation]', e);
    }
  };

  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Google Maps Places-based location picker component (rendered as overlay)
  const LocationPickerOverlay = () => {
    const inputRef = useRef(null);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const [picked, setPicked] = useState(null); // { lat, lng, name }
    const [mapReady, setMapReady] = useState(false);

    // Load Google Maps SDK once
    useEffect(() => {
      const GMAP_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
      if (!GMAP_KEY) { setMapReady(false); return; }
      if (window.google?.maps) { setMapReady(true); return; }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAP_KEY}&libraries=places`;
      script.async = true;
      script.onload = () => setMapReady(true);
      document.head.appendChild(script);
    }, []);

    // Init map once SDK is loaded
    useEffect(() => {
      if (!mapReady || !mapRef.current) return;
      const center = { lat: -13.9626, lng: 33.7741 }; // Lilongwe default
      const map = new window.google.maps.Map(mapRef.current, { zoom: 13, center, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
      mapInstanceRef.current = map;
      const marker = new window.google.maps.Marker({ map, draggable: true, position: center, title: 'Drop here' });
      markerRef.current = marker;
      // Click on map to reposition
      map.addListener('click', (e) => {
        const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        marker.setPosition(pos);
        setPicked({ lat: pos.lat, lng: pos.lng, name: '' });
      });
      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        setPicked({ lat: pos.lat(), lng: pos.lng(), name: '' });
      });
      // Places autocomplete
      if (inputRef.current) {
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, { types: ['geocode','establishment'] });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.geometry) return;
          const pos = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
          map.setCenter(pos);
          map.setZoom(16);
          marker.setPosition(pos);
          setPicked({ lat: pos.lat, lng: pos.lng, name: place.name || place.formatted_address || '' });
        });
      }
    }, [mapReady]);

    return (
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-end justify-center" onClick={() => setShowLocationSender(false)}>
        <div className="bg-[var(--nyasa-surface-2)] w-full max-w-lg rounded-t-2xl border-t border-[var(--nyasa-border)] shadow-2xl"
             onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nyasa-border)]">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-[#25D366]" />Send Location</p>
            <button onClick={() => setShowLocationSender(false)} className="text-gray-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
          </div>
          {/* Search box */}
          <div className="px-4 pt-3 pb-2">
            <input ref={inputRef} placeholder="Search for a place…"
              className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] placeholder:text-gray-600" />
          </div>
          {/* Map */}
          <div ref={mapRef} className="w-full" style={{ height: 280 }}>
            {!mapReady && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--nyasa-surface-3)]">
                <MapPin className="w-8 h-8 text-gray-600" />
                <p className="text-xs text-gray-500 text-center px-6">Set <code className="text-[10px] bg-black/20 px-1 rounded">VITE_GOOGLE_MAPS_KEY</code> in your environment to enable the map picker.</p>
                {/* Manual fallback */}
                <div className="flex gap-2 mt-1">
                  <input id="_lat" placeholder="Latitude" className="w-28 bg-[var(--nyasa-surface-4)] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] placeholder:text-gray-600" />
                  <input id="_lng" placeholder="Longitude" className="w-28 bg-[var(--nyasa-surface-4)] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] placeholder:text-gray-600" />
                </div>
                <button onClick={() => {
                  const la = parseFloat(document.getElementById('_lat')?.value);
                  const ln = parseFloat(document.getElementById('_lng')?.value);
                  if (!isNaN(la) && !isNaN(ln)) setPicked({ lat: la, lng: ln, name: '' });
                }} className="text-xs bg-[#25D366]/20 text-[#25D366] px-3 py-1 rounded-full">Use coords</button>
              </div>
            )}
          </div>
          {/* Send bar */}
          <div className="px-4 py-3 flex items-center gap-3 border-t border-[var(--nyasa-border)]">
            {picked ? (
              <div className="flex-1 text-xs text-gray-400 truncate">
                {picked.name || `${Number(picked.lat).toFixed(5)}, ${Number(picked.lng).toFixed(5)}`}
              </div>
            ) : (
              <div className="flex-1 text-xs text-gray-600">Tap the map or search to pick a location</div>
            )}
            <button disabled={!picked} onClick={() => handleSendLocation(picked.lat, picked.lng, picked.name)}
              className="bg-[#25D366] hover:bg-[#22c55e] disabled:opacity-40 text-white text-xs font-semibold px-5 py-2 rounded-full transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    );
  };

  const sendMediaQueue = async (files) => {
    setUploading(true);
    // Split into image batch vs other files
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const otherFiles = files.filter(f => !f.type.startsWith('image/'));

    try {
      // ── Multi-image: send as album ───────────────────────────────────────
      if (imageFiles.length > 1) {
        const albumTempId = `album-temp-${Date.now()}`;
        // Build optimistic previews — all marked sending
        const localPreviews = imageFiles.map(f => ({
          url: URL.createObjectURL(f),
          type: 'image',
          sending: true,
        }));
        // Insert ONE album bubble immediately
        setMessages(prev => [...prev, {
          id: albumTempId,
          conversation_id: conversation.id,
          direction: 'outbound',
          body: null,
          channel: conversation.channel,
          sender_name: user?.full_name || 'You',
          status: 'sending',
          created_at: new Date().toISOString(),
          _isAlbum: true,
          _albumImages: localPreviews,
          _albumStatus: 'sending',
          attachments: null,
        }]);
        // Upload each image sequentially, updating its cell as it completes
        setUploadProgress({ current: 0, total: imageFiles.length });
        for (let i = 0; i < imageFiles.length; i++) {
          setUploadProgress({ current: i + 1, total: imageFiles.length });
          try {
            const msg = await sendMediaMessage(wId, conversation.id, imageFiles[i], 'image',
              user?.full_name || 'You', '', user?.id || null);
            if (msg?.id) settledIds.current.add(msg.id);
            setMessages(prev => prev.map(m => {
              if (m.id !== albumTempId) return m;
              const imgs = [...m._albumImages];
              imgs[i] = { ...imgs[i], sending: false,
                url: msg?.attachments?.[0]?.url || imgs[i].url };
              const allDone = imgs.every(x => !x.sending);
              return { ...m, _albumImages: imgs,
                _albumStatus: allDone ? 'sent' : 'sending',
                status: allDone ? 'sent' : 'sending' };
            }));
          } catch (e) {
            setMessages(prev => prev.map(m => {
              if (m.id !== albumTempId) return m;
              const imgs = [...m._albumImages];
              imgs[i] = { ...imgs[i], sending: false, failed: true };
              return { ...m, _albumImages: imgs };
            }));
          }
          if (i < imageFiles.length - 1) await new Promise(r => setTimeout(r, 350));
        }
        // Mark whole album done
        setMessages(prev => prev.map(m =>
          m.id === albumTempId ? { ...m, status: 'sent', _albumStatus: 'sent' } : m
        ));
      } else if (imageFiles.length === 1) {
        // Single image — existing individual path
        setUploadProgress({ current: 1, total: 1 });
        await handleSendMedia(imageFiles[0], 'image');
      }

      // ── Non-image files: always individual ──────────────────────────────
      setUploadProgress({ current: 0, total: otherFiles.length });
      for (let i = 0; i < otherFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: otherFiles.length });
        const file = otherFiles[i];
        const kind = file.type.startsWith('video/') ? 'video'
                   : file.type.startsWith('audio/') ? 'audio'
                   : 'document';
        await handleSendMedia(file, kind);
        if (i < otherFiles.length - 1) await new Promise(r => setTimeout(r, 350));
      }
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
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
      const vr = createVoiceRecorder((file) => {
        clearInterval(recordTimerRef.current);
        setRecording(false);
        setRecordSecs(0);
        mediaRecorderRef.current = null;
        sendMediaQueue([file]);
      });
      await vr.start();
      mediaRecorderRef.current = vr;
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch (e) {
      console.error('[VoiceNote] mic error:', e?.message);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop?.();
  };

  const cancelRecording = () => {
    clearInterval(recordTimerRef.current);
    mediaRecorderRef.current?.cancel?.();
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordSecs(0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Message actions: copy / share / pin / delete ──────────────────────────
  const handleCopyMessage = (msg) => {
    const text = msg.body || msg.attachments?.[0]?.url || '';
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  };

  const handleForwardMessage = (msg) => {
    setForwardMsg(msg);
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
    // Enforce max 3 pinned messages per conversation
    if (next) {
      const currentPinned = messages.filter(m => m.pinned && !m.deleted_at && m.id !== msg.id);
      if (currentPinned.length >= 3) {
        toast({ title: 'Pin limit reached', description: 'You can pin up to 3 messages per conversation. Unpin one first.', variant: 'destructive', duration: 4000 });
        return;
      }
    }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: next } : m));
    try {
      await setMessagePinned(msg.id, next);
    } catch (e) {
      console.error('[MessageThread] failed to toggle pin:', e);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: !next } : m));
    }
  };

  const handleReactMessage = async (msg, emoji) => {
    if (!emoji) {
      // If emoji is null, it came from the context menu — open the emoji picker
      setShowEmojiPicker(true);
      setReactingToMsg(msg);
      return;
    }
    // Optimistically update reactions
    setMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const reactions = { ...(m.reactions || {}) };
      const userId = user?.id || 'unknown';
      const userName = profile?.full_name || user?.email || 'Agent';
      if (reactions[emoji]) {
        const idx = reactions[emoji].findIndex(r => r.id === userId);
        if (idx >= 0) {
          reactions[emoji] = reactions[emoji].filter((_, i) => i !== idx);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...reactions[emoji], { id: userId, name: userName }];
        }
      } else {
        reactions[emoji] = [{ id: userId, name: userName }];
      }
      return { ...m, reactions };
    }));
    try {
      await setMessageReaction(msg.id, emoji, user?.id || 'unknown', profile?.full_name || user?.email || 'Agent');
    } catch (e) {
      console.error('[MessageThread] failed to set reaction:', e);
      // Revert on failure — reload messages
      getMessages(conversation.id).then(setMessages).catch(() => {});
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

      {/* Pinned messages bar — cycles through all pinned on tap */}
      {pinnedMessages.length > 0 && (
        <button
          onClick={() => {
            const nextIdx = (pinnedBannerIdx + 1) % pinnedMessages.length;
            setPinnedBannerIdx(nextIdx);
            scrollToMessage(pinnedMessages[nextIdx].id);
          }}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--nyasa-surface-3)] border-b border-[var(--nyasa-border)] text-left hover:bg-[#243139] transition-colors"
        >
          <Pin className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
          <p className="flex-1 min-w-0 text-xs text-gray-300 truncate">
            <span className="font-semibold text-[#25D366]">{pinnedMessages.length} pinned</span>
            {' · '}{pinnedMessages[pinnedBannerIdx]?.body || 'Attachment'}
          </p>
          <span className="text-[10px] text-[#8696A0] shrink-0 ml-auto">
            {pinnedBannerIdx + 1}/{pinnedMessages.length}
          </span>
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
          groupMessages(messages).map((msg, i, arr) => {
            const ts = msg.created_at || msg.created_date;
            // Use arr[i-1] (the grouped array), NOT messages[i-1] (raw) — otherwise
            // album collapsing shifts indices and every message gets its own "Today" pill
            const prev = i > 0 ? arr[i - 1] : null;
            const prevTs = prev ? (prev.created_at || prev.created_date) : null;
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
                  onForward={handleForwardMessage}
                  onTogglePin={handleTogglePinMessage}
                  onReact={handleReactMessage}
                  currentUserId={user?.id}
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
      <div className="shrink-0 border-t border-[rgba(255,255,255,0.06)] bg-[#1F2C34] px-2 pt-1.5 pb-2">
        {/* Upload progress banner — shown when sending multiple files */}
        {uploading && uploadProgress.total > 1 && (
          <div className="flex items-center gap-2.5 px-4 py-2 border-t border-[var(--nyasa-border)] bg-[#075E54]/20">
            <Loader2 className="w-3.5 h-3.5 text-[#25D366] animate-spin shrink-0" />
            <span className="text-xs text-[#25D366] font-semibold">
              Sending {uploadProgress.current} of {uploadProgress.total}…
            </span>
            {/* Progress bar */}
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#25D366] rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

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
        <div className="flex gap-1 mb-1.5 items-center justify-between">
          <div className="flex gap-1 items-center">
            {['reply', 'note'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors capitalize
                  ${tab === t ? 'bg-[#00A884]/20 text-[#00A884]' : 'text-[#8696A0] hover:text-gray-300'}`}>
                {t === 'note' ? '📝 Note' : '💬 Reply'}
              </button>
            ))}
          </div>

          {/* AI draft trigger — only shows if the workspace has any active agents */}
          {aiAgents.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowAiPicker(s => !s)} disabled={aiDrafting}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50">
                {aiDrafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI draft
              </button>
              {showAiPicker && (
                <div className="absolute right-0 bottom-full mb-1 z-10 bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-xl p-1.5 w-52 shadow-lg space-y-0.5">
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
          <div className="flex items-center gap-3 bg-[#2A3942] rounded-full px-4 py-2.5 mx-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-400 font-mono font-semibold">{String(Math.floor(recordSecs / 60)).padStart(2,'0')}:{String(recordSecs % 60).padStart(2,'0')}</span>
            <button onClick={cancelRecording} className="flex-1 text-xs text-[#8696A0] flex items-center gap-1 hover:text-red-400 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              Cancel
            </button>
            <button onClick={stopRecording} className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center shrink-0 shadow-md">
              <Square className="w-4 h-4 text-white fill-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 mx-1">
            {/* Hidden file inputs — one per category so each opens the right picker */}
            <input ref={fileInputRef} type="file"
              accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
              multiple className="hidden" onChange={onFilePicked} />
            <input ref={galleryInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onFilePicked} />
            <input ref={docInputRef} type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple className="hidden" onChange={onFilePicked} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFilePicked} />

            {/* Left pill: emoji + textarea + clip + camera */}
            <div className="flex items-end flex-1 bg-[#2A3942] rounded-2xl px-3 py-1.5 gap-2 min-w-0">
              {/* Emoji button */}
              <div className="relative shrink-0">
                <button
                  className="text-[#8696A0] hover:text-gray-200 pb-1.5 transition-colors"
                  tabIndex={-1}
                  onClick={() => {
                    const opening = !showEmojiPicker;
                    setShowEmojiPicker(s => !s);
                    if (opening) {
                      // Blur textarea to dismiss the system keyboard, making room for our panel
                      inputRef.current?.blur();
                    } else {
                      // Refocus when closing emoji panel
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }
                  }}
                  data-emoji-btn
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                {/* Emoji picker is now a bottom sheet — see below the composer */}
              </div>

              {/* Text input */}
              <textarea
                ref={inputRef}
                rows={1}
                className="flex-1 bg-transparent text-white text-sm focus:outline-none resize-none placeholder:text-[#8696A0] leading-[1.4] max-h-32 overflow-y-auto py-2 min-w-0"
                style={{ scrollbarWidth: 'thin' }}
                placeholder={tab === 'note' ? 'Add a note…' : 'Message'}
                value={body}
                onChange={e => {
                  const val = e.target.value;
                  setBody(val);
                  // Reset to 1 row when empty, otherwise grow up to 128px
                  e.target.style.height = 'auto';
                  e.target.style.height = (val === '' ? '' : Math.min(e.target.scrollHeight, 128) + 'px');
                  if (val.startsWith('/')) {
                    setShowCanned(true);
                  } else {
                    setShowCanned(false);
                  }
                }}
                onKeyDown={handleKeyDown}
              />

              {/* Clip + MapPin (right of textarea, inside pill) */}
              <div className="flex items-center gap-1 shrink-0 pb-1">
                <button
                  onClick={() => { if (tab !== 'note') setShowAttachMenu(true); }}
                  disabled={tab === 'note'}
                  className="text-[#8696A0] hover:text-gray-200 transition-colors disabled:opacity-30 p-1">
                  <Paperclip className="w-5 h-5" />
                </button>

              </div>
            </div>

            {/* Right: big green circle — mic when empty, send when typing */}
            {!body.trim() && tab !== 'note' ? (
              <button onClick={startRecording} disabled={uploading}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 shadow-md"
                style={{ background: '#00A884' }}>
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
            ) : (
              <button onClick={handleSend} disabled={!body.trim() || sending}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 shadow-md"
                style={{ background: '#00A884' }}>
                {sending ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Send className="w-5 h-5 text-white" />}
              </button>
            )}
          </div>
        )}
      </div>

      {lightboxMedia && <MediaLightbox att={lightboxMedia} onClose={() => setLightboxMedia(null)} />}
      {/* WhatsApp-style emoji keyboard — slides up from bottom, replaces keyboard */}
      {showEmojiPicker && (
        <div
          className="fixed inset-x-0 bottom-0 z-[99]"
          style={{ animation: 'slideUpEmoji 0.22s cubic-bezier(0.32,0.72,0,1) both' }}
        >
          <style>{`@keyframes slideUpEmoji { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          {/* Tap-outside overlay */}
          <div className="fixed inset-0 bottom-auto" style={{ top: 0, bottom: '44vh' }} onClick={() => setShowEmojiPicker(false)} />
          <div className="relative bg-[#1F2C34] border-t border-white/10 shadow-2xl" style={{ height: '44vh', minHeight: '280px', maxHeight: '380px' }}>
            <EmojiPicker
              theme="dark"
              onEmojiClick={(emojiData) => {
                if (reactingToMsg) {
                  handleReactMessage(reactingToMsg, emojiData.emoji);
                  setReactingToMsg(null);
                  setShowEmojiPicker(false);
                } else {
                  setBody(prev => prev + emojiData.emoji);
                  inputRef.current?.focus();
                }
              }}
              searchPlaceholder="Search emoji…"
              skinTonesDisabled
              height="100%"
              width="100%"
              lazyLoadEmojis
              style={{ background: '#1F2C34', border: 'none' }}
              previewConfig={{ showPreview: false }}
            />
          </div>
        </div>
      )}


      {/* ── Attachment menu bottom-sheet (WhatsApp style) ── */}
      {showAttachMenu && (
        <div className="fixed inset-0 z-[100]" onClick={() => setShowAttachMenu(false)}>
          <div
            className="absolute inset-x-0 bottom-0 bg-[#1F2C34] rounded-t-2xl pt-3 pb-8 px-6 shadow-2xl"
            style={{ animation: 'slideUpEmoji 0.22s cubic-bezier(0.32,0.72,0,1) both' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

            {/* Row 1 */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              {/* Document */}
              <button
                className="flex flex-col items-center gap-2"
                onClick={() => { setShowAttachMenu(false); docInputRef.current?.click(); }}
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#7B5EA7' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414A2 2 0 0018.414 8L13 2.586A2 2 0 0011.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
                  </svg>
                </span>
                <span className="text-[11px] text-[#8696A0]">Document</span>
              </button>

              {/* Gallery */}
              <button
                className="flex flex-col items-center gap-2"
                onClick={() => { setShowAttachMenu(false); galleryInputRef.current?.click(); }}
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#1E88E5' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </span>
                <span className="text-[11px] text-[#8696A0]">Gallery</span>
              </button>

              {/* Camera */}
              <button
                className="flex flex-col items-center gap-2"
                onClick={() => { setShowAttachMenu(false); cameraInputRef.current?.click(); }}
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#E91E63' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <span className="text-[11px] text-[#8696A0]">Camera</span>
              </button>

              {/* Quick Reply / Canned */}
              <button
                className="flex flex-col items-center gap-2"
                onClick={() => { setShowAttachMenu(false); setBody('/'); setShowCanned(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#F4A100' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <span className="text-[11px] text-[#8696A0]">Quick Reply</span>
              </button>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-4 gap-4">
              {/* Location */}
              {conversation.channel === 'whatsapp' && (
                <button
                  className="flex flex-col items-center gap-2"
                  onClick={() => { setShowAttachMenu(false); setShowLocationSender(true); }}
                >
                  <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#00BCD4' }}>
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <span className="text-[11px] text-[#8696A0]">Location</span>
                </button>
              )}

              {/* Audio file */}
              <button
                className="flex flex-col items-center gap-2"
                onClick={() => {
                  setShowAttachMenu(false);
                  // open file picker filtered to audio
                  const inp = document.createElement('input');
                  inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true;
                  inp.onchange = (ev) => onFilePicked(ev);
                  inp.click();
                }}
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#4CAF50' }}>
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                  </svg>
                </span>
                <span className="text-[11px] text-[#8696A0]">Audio</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showLocationSender && <LocationPickerOverlay />}
      {forwardMsg && (
        <ForwardModal
          msg={forwardMsg}
          workspaceId={workspaceId}
          onClose={() => setForwardMsg(null)}
        />
      )}
    </div>
  );
}
