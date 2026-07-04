/* Nyasadesk Live Chat Widget v1.2
 * Floating bubble:  <script src="https://nyasadesk1.vercel.app/widget.js" data-workspace-id="YOUR_ID"></script>
 * Inline / support-page embed (fills its container, always open, no popup bubble):
 *   <div id="nyasa-inline-target"></div>
 *   <script src="https://nyasadesk1.vercel.app/widget.js" data-workspace-id="YOUR_ID" data-mode="inline"></script>
 *
 * Theming: the widget auto-adapts to the host site — it inherits the page's
 * font, follows OS/browser light-dark mode automatically, and (in inline
 * mode) reads the real background/text color of the container it's mounted
 * in so it visually blends into the surrounding page instead of looking like
 * a foreign popup. Force a theme with data-theme="light" | "dark" | "auto".
 */
(function () {
  'use strict';

  const API    = 'https://nyasadesk1.vercel.app/api/widget/chat';
  const script = document.currentScript || document.querySelector('script[data-workspace-id]');
  const WID    = script?.getAttribute('data-workspace-id');
  const MODE   = (script?.getAttribute('data-mode') || 'popup').toLowerCase(); // 'popup' | 'inline'
  const THEME  = (script?.getAttribute('data-theme') || 'auto').toLowerCase(); // 'auto' | 'light' | 'dark'
  let POSITION = (script?.getAttribute('data-position') || 'bottom-right').toLowerCase(); // 'bottom-right' | 'bottom-left' — set from Settings > Channels > Website, baked into the copied embed snippet
  // Whether to sniff the REAL host page's background/text/font (for genuine
  // 3rd-party site embeds). Our own hosted Support Page already declares an
  // explicit theme and correct contrast on its own — it opts out of this
  // heuristic via data-native-detect="false" so it never inherits stray
  // colors from the rest of the app's UI.
  const NATIVE_DETECT = script?.getAttribute('data-native-detect') !== 'false';
  if (!WID) { console.warn('[Nyasadesk] data-workspace-id is required'); return; }

  const INLINE = MODE === 'inline';

  // ── State ─────────────────────────────────────────────────────────────────
  let sessionId    = localStorage.getItem('nyasa_session_' + WID) || null;
  let visitorName  = localStorage.getItem('nyasa_name_' + WID)  || null;
  const isReturningVisitor = !!sessionId; // has a real prior session — replay their history instead of a fresh greeting
  let color        = '#25D366';
  let lastPollAt   = new Date().toISOString();
  let open         = INLINE ? true : false;
  let pollTimer    = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const api = (body) => fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: WID, ...body }),
  }).then(r => r.json());

  const esc = s => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = iso => {
    const d = new Date(iso);
    const h = d.getHours(), m = String(d.getMinutes()).padStart(2,'0');
    return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  };

  // ── Theme detection ───────────────────────────────────────────────────────
  // Parse "rgb(r,g,b)" / "rgba(r,g,b,a)" into perceived luminance (0-255).
  const luminanceOf = (colorStr) => {
    if (!colorStr) return null;
    const m = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    const [_, r, g, b, a] = m;
    if (a !== undefined && parseFloat(a) < 0.15) return null; // effectively transparent
    return (0.299 * r + 0.587 * g + 0.114 * b);
  };

  const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  let isDark = THEME === 'dark' ? true : THEME === 'light' ? false : prefersDark();

  // In inline mode, try to read the REAL host container so we blend into the
  // actual page instead of guessing — this is the "feels native" part.
  let hostBg = null, hostText = null, hostFont = null, hostRadius = null;
  if (INLINE && THEME === 'auto' && NATIVE_DETECT) {
    try {
      const mountEl = document.getElementById('nyasa-inline-target') || script.parentElement || document.body;
      // Walk up until we find a container with a real (non-transparent) background.
      let node = mountEl;
      for (let i = 0; i < 6 && node; i++) {
        const cs = window.getComputedStyle(node);
        const lum = luminanceOf(cs.backgroundColor);
        if (lum !== null) { hostBg = cs.backgroundColor; isDark = lum < 128; break; }
        node = node.parentElement;
      }
      const bodyStyle = window.getComputedStyle(document.body);
      hostText = bodyStyle.color || null;
      hostFont = bodyStyle.fontFamily || null;
      const btnLike = document.querySelector('button, a.btn, [class*="btn"]');
      if (btnLike) {
        const br = window.getComputedStyle(btnLike).borderRadius;
        if (br && parseFloat(br) >= 0) hostRadius = br;
      }
    } catch (e) { /* cross-origin or unreadable — fall back to auto light/dark */ }
  }

  // ── DOM Build ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #nyasa-widget, #nyasa-widget * {
      box-sizing: border-box; margin: 0; padding: 0;
      font-family: var(--nyasa-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    }
    #nyasa-widget {
      --nyasa-color: #25D366;
      --nyasa-header-grad: linear-gradient(135deg, #075E54 0%, #128C7E 100%);
      --nyasa-page-bg: #ECE5DD; --nyasa-panel-bg: #ffffff; --nyasa-in-bubble: #ffffff;
      --nyasa-out-bubble: #DCF8C6; --nyasa-text: #1a1a1a; --nyasa-muted: #888888;
      --nyasa-border: #eeeeee; --nyasa-radius: 16px;
    }
    /* Dark theme mirrors the real Nyasadesk inbox exactly: #0B141A message
       canvas, #202C33 header/composer bars, WhatsApp-green outbound bubbles —
       so the widget reads as the same product, not a bolted-on extra. */
    #nyasa-widget.nyasa-theme-dark {
      --nyasa-page-bg: #0B141A; --nyasa-panel-bg: #202C33; --nyasa-in-bubble: #202C33;
      --nyasa-out-bubble: #005C4B; --nyasa-text: #EDEDED; --nyasa-muted: #8696A0; --nyasa-border: rgba(255,255,255,0.08);
    }
    #nyasa-fab {
      position: fixed; bottom: 22px; right: 22px; z-index: 2147483640;
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--nyasa-header-grad); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.28); transition: transform .2s, box-shadow .2s;
    }
    #nyasa-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.32); }
    #nyasa-fab svg { width: 27px; height: 27px; }
    #nyasa-badge {
      position: absolute; top: -3px; right: -3px;
      background: #EF4444; color: #fff; font-size: 10px; font-weight: 700;
      min-width: 18px; height: 18px; border-radius: 9px; padding: 0 4px;
      display: none; align-items: center; justify-content: center;
      border: 2px solid #fff;
    }
    #nyasa-window {
      position: fixed; bottom: 86px; right: 22px; z-index: 2147483639;
      width: 320px; max-width: calc(100vw - 28px);
      height: 460px; max-height: calc(100vh - 110px);
      border-radius: var(--nyasa-radius); overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.4);
      border: 1px solid var(--nyasa-border);
      display: flex; flex-direction: column;
      background: var(--nyasa-panel-bg);
      transform-origin: bottom right;
      transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s;
    }
    #nyasa-window.closed { transform: scale(0.7) translateY(20px); opacity: 0; pointer-events: none; }
    /* ── Inline / support-page mode: fill the container instead of floating ── */
    #nyasa-widget.nyasa-inline #nyasa-window {
      position: static; width: 100%; height: 100%; max-width: none; max-height: none;
      border-radius: var(--nyasa-radius); box-shadow: none; transform: none !important; opacity: 1 !important;
      pointer-events: auto !important; min-height: 480px;
    }
    #nyasa-widget.nyasa-inline { display: block; width: 100%; height: 100%; background: var(--nyasa-page-bg); border-radius: var(--nyasa-radius); }
    #nyasa-header {
      background: var(--nyasa-header-grad); padding: 12px 14px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    #nyasa-header .avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    #nyasa-header .info { flex: 1; }
    #nyasa-header .name { font-size: 14px; font-weight: 700; color: #fff; }
    #nyasa-header .status { font-size: 11px; color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 4px; }
    #nyasa-header .dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; display: inline-block; }
    #nyasa-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.8); font-size: 20px; padding: 4px; }
    #nyasa-msgs {
      flex: 1; overflow-y: auto; padding: 10px 16px; background: var(--nyasa-page-bg);
      background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0);
      background-size: 20px 20px;
      display: flex; flex-direction: column; gap: 2px;
    }
    #nyasa-widget:not(.nyasa-theme-dark) #nyasa-msgs { background-image: none; }
    #nyasa-msgs::-webkit-scrollbar { width: 4px; }
    #nyasa-msgs::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 2px; }
    .nyasa-bubble { display: flex; flex-direction: column; max-width: 80%; margin: 1px 0; }
    .nyasa-bubble.out { align-self: flex-end; align-items: flex-end; }
    .nyasa-bubble.in  { align-self: flex-start; align-items: flex-start; }
    /* WhatsApp-style bubble: generous padding, and the timestamp sits tucked
       inline at the bottom-right of the last line (via the float trick)
       instead of floating as a separate row below the bubble. */
    .nyasa-bubble .text {
      position: relative;
      padding: 8px 12px 9px 12px;
      font-size: 14px; line-height: 19px; word-break: break-word; white-space: pre-wrap;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13); color: var(--nyasa-text);
    }
    .nyasa-bubble.out .text { background: var(--nyasa-out-bubble); border-radius: 10px 2px 10px 10px; }
    .nyasa-bubble.in  .text { background: var(--nyasa-in-bubble);  border-radius: 2px 10px 10px 10px; color: var(--nyasa-text); }
    /* Invisible inline copy of the timestamp reserves trailing space at the
       end of the last line, so the real (absolutely-positioned) timestamp
       never overlaps the message text — this is the fix for the bug where
       the time sat on top of the last word instead of tucked beside it. */
    .nyasa-bubble .meta-spacer { visibility: hidden; font-size: 11px; padding-left: 32px; }
    .nyasa-bubble .meta {
      position: absolute; right: 11px; bottom: 6px;
      font-size: 10.5px; line-height: 1; color: var(--nyasa-muted); white-space: nowrap; opacity: 0.85;
    }
    .nyasa-bubble.out .meta { color: rgba(255,255,255,0.75); }
    #nyasa-widget.nyasa-theme-dark .nyasa-bubble.out .meta { color: rgba(255,255,255,0.65); }
    #nyasa-widget.nyasa-theme-dark .nyasa-bubble.out .text { color: #E9FBF3; }
    .nyasa-system { text-align: center; font-size: 11px; color: var(--nyasa-muted); padding: 4px 0; }
    #nyasa-name-gate { background: var(--nyasa-panel-bg); padding: 16px; border-top: 1px solid var(--nyasa-border); flex-shrink: 0; }
    #nyasa-name-gate p { font-size: 12px; color: var(--nyasa-muted); margin-bottom: 8px; }
    #nyasa-name-gate input {
      width: 100%; border: 1px solid var(--nyasa-border); border-radius: 10px; padding: 8px 12px;
      font-size: 13px; margin-bottom: 8px; outline: none; background: var(--nyasa-panel-bg); color: var(--nyasa-text);
    }
    #nyasa-name-gate input:focus { border-color: var(--nyasa-color); }
    #nyasa-name-gate button {
      width: 100%; padding: 9px; border: none; border-radius: 10px;
      background: var(--nyasa-color); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    #nyasa-composer { background: var(--nyasa-panel-bg); padding: 8px 12px; display: flex; gap: 6px; align-items: flex-end; flex-shrink: 0; border-top: 1px solid var(--nyasa-border); }
    #nyasa-attach {
      width: 36px; height: 36px; border-radius: 50%; border: none; background: transparent;
      color: var(--nyasa-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .15s;
    }
    #nyasa-attach:hover { background: rgba(128,128,128,0.12); }
    #nyasa-attach svg { width: 19px; height: 19px; fill: currentColor; }
    #nyasa-input {
      flex: 1; border: none; background: var(--nyasa-page-bg); color: var(--nyasa-text); border-radius: 22px;
      padding: 9px 14px; font-size: 13px; resize: none; outline: none;
      max-height: 100px; line-height: 1.4;
    }
    #nyasa-send {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: var(--nyasa-color); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s;
    }
    #nyasa-send:disabled { background: #ccc; cursor: default; }
    #nyasa-send svg { width: 18px; height: 18px; fill: #fff; }
    /* WhatsApp-style read receipts on the visitor's own sent messages —
       single grey check = sent/stored, double blue check = an agent has
       opened the conversation. Mirrors StatusIcon in the real team inbox. */
    .nyasa-bubble .ticks { display: inline-flex; margin-left: 3px; vertical-align: -1px; }
    .nyasa-bubble .ticks svg { width: 14px; height: 14px; }
    .nyasa-bubble .ticks.sent svg { fill: none; stroke: rgba(255,255,255,0.7); }
    #nyasa-widget:not(.nyasa-theme-dark) .nyasa-bubble .ticks.sent svg { stroke: rgba(0,0,0,0.45); }
    .nyasa-bubble .ticks.read svg { fill: none; stroke: #53BDEB; }
    .nyasa-bubble .attach-img { display: block; max-width: 220px; max-height: 220px; border-radius: 10px; margin-bottom: 4px; object-fit: cover; }
    .nyasa-bubble .attach-video { display: block; max-width: 220px; max-height: 220px; border-radius: 10px; margin-bottom: 4px; }
    #nyasa-powered { background: var(--nyasa-panel-bg); text-align: center; font-size: 10px; color: var(--nyasa-muted); padding: 4px 0 6px; flex-shrink: 0; }
    #nyasa-powered a { color: var(--nyasa-muted); text-decoration: none; }
    @media (max-width: 420px) {
      #nyasa-window { bottom: 84px; right: 12px; width: calc(100vw - 24px); }
      #nyasa-fab { bottom: 16px; right: 16px; }
    }
    /* ── Voice notes (WhatsApp-style) ────────────────────────────────────── */
    #nyasa-mic {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: var(--nyasa-color); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: background .15s, opacity .15s;
    }
    #nyasa-mic:hover { opacity: 0.88; }
    #nyasa-mic svg { width: 20px; height: 20px; fill: #fff; }
    #nyasa-mic.recording { background: #EF4444; animation: nyasa-pulse 1.2s ease-in-out infinite; }
    @keyframes nyasa-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
    /* Recording slide-over replaces the text input row */
    #nyasa-recording-bar {
      display: none; flex: 1; align-items: center; gap: 8px;
      padding: 0 4px; height: 40px;
    }
    #nyasa-recording-bar.active { display: flex; }
    #nyasa-recording-bar .rec-dot {
      width: 10px; height: 10px; border-radius: 50%; background: #EF4444; flex-shrink: 0;
      animation: nyasa-blink 1s ease-in-out infinite;
    }
    @keyframes nyasa-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    #nyasa-recording-bar .rec-timer {
      font-size: 13px; font-weight: 600; color: var(--nyasa-text); font-variant-numeric: tabular-nums;
    }
    #nyasa-recording-bar .rec-wave {
      flex: 1; height: 24px; display: flex; align-items: center; gap: 2px; overflow: hidden;
    }
    #nyasa-recording-bar .rec-wave span {
      flex: 1; background: var(--nyasa-muted); border-radius: 2px; min-height: 4px;
      transition: height .08s ease;
    }
    #nyasa-rec-cancel {
      width: 32px; height: 32px; border-radius: 50%; border: none; background: transparent;
      color: #EF4444; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #nyasa-rec-cancel svg { width: 18px; height: 18px; fill: currentColor; }
    /* Audio player inside bubbles — compact, WhatsApp-style */
    .nyasa-audio { display: flex; align-items: center; gap: 8px; padding: 6px 4px; min-width: 180px; }
    .nyasa-audio .play-btn {
      width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--nyasa-color); color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #nyasa-widget.nyasa-theme-dark .nyasa-audio .play-btn { background: #25D366; }
    #nyasa-widget:not(.nyasa-theme-dark) .nyasa-bubble.in .nyasa-audio .play-btn { background: #075E54; }
    .nyasa-audio .play-btn svg { width: 15px; height: 15px; fill: #fff; }
    .nyasa-audio .play-btn.pause svg { fill: #fff; }
    .nyasa-audio .track {
      flex: 1; height: 4px; border-radius: 2px; background: rgba(128,128,128,0.25); position: relative; cursor: pointer;
    }
    .nyasa-audio .track-fill { height: 100%; border-radius: 2px; background: var(--nyasa-color); width: 0%; transition: width .1s linear; }
    #nyasa-widget.nyasa-theme-dark .nyasa-audio .track-fill { background: #25D366; }
    #nyasa-widget:not(.nyasa-theme-dark) .nyasa-bubble.in .nyasa-audio .track-fill { background: #075E54; }
    .nyasa-audio .dur { font-size: 11px; color: var(--nyasa-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    #nyasa-widget.nyasa-theme-dark .nyasa-bubble.out .nyasa-audio .dur { color: rgba(255,255,255,0.6); }

        /* ── Media preview / caption overlay (WhatsApp-style) ─────────────────── */
    #nyasa-preview {
      position: absolute; inset: 0; z-index: 10; background: #000;
      display: none; flex-direction: column; border-radius: var(--nyasa-radius); overflow: hidden;
    }
    #nyasa-preview.active { display: flex; }
    #nyasa-preview .preview-header {
      display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      background: rgba(0,0,0,0.85); flex-shrink: 0;
    }
    #nyasa-preview .preview-header .pv-title { color: #fff; font-size: 14px; font-weight: 600; flex: 1; }
    #nyasa-preview .preview-close {
      background: none; border: none; cursor: pointer; color: #fff; font-size: 22px; padding: 4px;
    }
    #nyasa-preview .preview-media {
      flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;
      background: #0a0a0a; min-height: 0;
    }
    #nyasa-preview .preview-media img {
      max-width: 100%; max-height: 100%; object-fit: contain;
    }
    #nyasa-preview .preview-media video {
      max-width: 100%; max-height: 100%; object-fit: contain;
    }
    #nyasa-preview .preview-caption-bar {
      display: flex; gap: 8px; align-items: flex-end; padding: 10px 12px;
      background: rgba(0,0,0,0.85); flex-shrink: 0;
    }
    #nyasa-preview .preview-caption {
      flex: 1; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1);
      color: #fff; border-radius: 22px; padding: 10px 16px; font-size: 14px;
      outline: none; resize: none; max-height: 80px; line-height: 1.4;
      font-family: inherit;
    }
    #nyasa-preview .preview-caption::placeholder { color: rgba(255,255,255,0.5); }
    #nyasa-preview .preview-send {
      width: 42px; height: 42px; border-radius: 50%; border: none;
      background: var(--nyasa-color); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #nyasa-preview .preview-send svg { width: 20px; height: 20px; fill: #fff; }

        /* Widget position — configurable in Settings > Channels > Website, baked into the embed snippet */
    #nyasa-widget.nyasa-pos-left #nyasa-fab { left: 24px; right: auto; }
    #nyasa-widget.nyasa-pos-left #nyasa-window { left: 24px; right: auto; transform-origin: bottom left; }
    @media (max-width: 420px) {
      #nyasa-widget.nyasa-pos-left #nyasa-window { left: 12px; right: auto; }
      #nyasa-widget.nyasa-pos-left #nyasa-fab { left: 16px; right: auto; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'nyasa-widget';
  // Resolve to a concrete theme class using the JS-computed isDark value —
  // this covers explicit dark/light AND 'auto', so there's no separate CSS
  // media-query path to fall out of sync with what we just calculated.
  if (isDark) root.classList.add('nyasa-theme-dark');
  if (POSITION === 'bottom-left') root.classList.add('nyasa-pos-left');
  if (INLINE) {
    root.classList.add('nyasa-inline');
    // In inline mode, mount into a target container if present, else right where the script tag is
    const target = document.getElementById('nyasa-inline-target') || script.parentElement || document.body;
    target.appendChild(root);
  } else {
    document.body.appendChild(root);
  }

  // Apply host-detected theme values (inline mode only) as inline CSS vars —
  // these override the auto light/dark defaults with the page's real colors.
  if (hostFont) root.style.setProperty('--nyasa-font', hostFont);
  if (hostRadius) root.style.setProperty('--nyasa-radius', hostRadius);
  if (hostBg) {
    root.style.setProperty('--nyasa-page-bg', hostBg);
    root.style.setProperty('--nyasa-panel-bg', hostBg);
    if (hostText) {
      root.style.setProperty('--nyasa-text', hostText);
      root.style.setProperty('--nyasa-muted', hostText);
    }
    root.style.setProperty('--nyasa-in-bubble', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)');
    root.style.setProperty('--nyasa-border', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
  }

  root.innerHTML = `
    ${INLINE ? '' : `
    <button id="nyasa-fab" title="Chat with us">
      <span id="nyasa-badge"></span>
      <svg viewBox="0 0 32 32" fill="none"><path fill="#fff" d="M16.004 0C7.168 0 .004 7.164.004 16c0 2.824.736 5.476 2.024 7.788L0 32l8.36-2.196A15.932 15.932 0 0 0 16.004 32C24.84 32 32.004 24.836 32.004 16S24.84 0 16.004 0z" opacity="0"/><path fill="#fff" d="M16.004 2.912c-7.176 0-13.088 5.912-13.088 13.088 0 2.348.628 4.552 1.72 6.452L2.96 29.08l5.76-1.516a13.028 13.028 0 0 0 7.284 2.216c7.176 0 13.088-5.912 13.088-13.088S23.18 2.912 16.004 2.912zm0 23.84a10.708 10.708 0 0 1-5.464-1.496l-.392-.236-4.088 1.076 1.092-3.988-.256-.404a10.72 10.72 0 0 1-1.64-5.704c0-5.94 4.836-10.776 10.78-10.776 5.94 0 10.776 4.836 10.776 10.776s-4.836 10.776-10.776 10.776z"/><path fill="#fff" d="M16.004 5.224c-5.94 0-10.776 4.836-10.776 10.776 0 2.072.592 4.068 1.712 5.78l-1.144 4.18 4.28-1.124a10.756 10.756 0 0 0 5.928 1.784c5.94 0 10.776-4.836 10.776-10.776S21.944 5.224 16.004 5.224z M13.224 10.468c-.232-.516-.476-.528-.696-.536l-.596-.008c-.208 0-.544.076-.828.392s-1.088 1.064-1.088 2.596 1.112 3.012 1.268 3.224c.156.212 2.176 3.516 5.356 4.784 2.656 1.06 3.196.848 3.772.796.576-.052 1.856-.76 2.12-1.492.264-.732.264-1.36.184-1.492-.08-.132-.288-.212-.6-.372s-1.856-.916-2.144-1.02c-.288-.104-.496-.156-.704.156-.208.312-.808 1.02-.992 1.228-.184.208-.368.236-.68.078-.312-.156-1.316-.484-2.508-1.548-.928-.828-1.552-1.848-1.736-2.16-.184-.312-.02-.48.136-.636.14-.14.312-.368.468-.552.156-.184.208-.312.312-.52.104-.208.052-.392-.024-.552-.078-.16-.704-1.7-.964-2.328z"/></svg>
    </button>`}
    <div id="nyasa-window" class="${INLINE ? '' : 'closed'}">
      <div id="nyasa-header">
        <div class="avatar">💬</div>
        <div class="info">
          <div class="name" id="nyasa-header-name">Support Team</div>
          <div class="status"><span class="dot"></span> Online</div>
        </div>
        ${INLINE ? '' : '<button id="nyasa-close" title="Close">✕</button>'}
      </div>
      <div id="nyasa-msgs"></div>
      <div id="nyasa-name-gate" style="display:none">
        <p>Before we start, what's your name?</p>
        <input id="nyasa-name-input" placeholder="Your name" maxlength="60" />
        <input id="nyasa-email-input" placeholder="Email (optional)" type="email" style="margin-bottom:8px" />
        <button id="nyasa-name-btn">Start Chat</button>
      </div>
      <div id="nyasa-composer" style="display:none">
        <button id="nyasa-attach" title="Attach image or video">
          <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg>
        </button>
        <input type="file" id="nyasa-file" accept="image/*,video/*" style="display:none" />
        <div id="nyasa-recording-bar">
          <span class="rec-dot"></span>
          <span class="rec-timer">0:00</span>
          <div class="rec-wave" id="nyasa-rec-wave"></div>
          <button id="nyasa-rec-cancel" title="Cancel">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div>
        <textarea id="nyasa-input" placeholder="Type a message…" rows="1"></textarea>
        <button id="nyasa-mic" title="Record voice note">
          <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
        </button>
        <button id="nyasa-send" disabled style="display:none">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div id="nyasa-preview">
        <div class="preview-header">
          <button class="preview-close" id="nyasa-pv-close">✕</button>
          <span class="pv-title">Send media</span>
        </div>
        <div class="preview-media" id="nyasa-pv-media"></div>
        <div class="preview-caption-bar">
          <textarea class="preview-caption" id="nyasa-pv-caption" placeholder="Add caption…" rows="1"></textarea>
          <button class="preview-send" id="nyasa-pv-send">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
      <div id="nyasa-powered"><a href="https://nyasadesk1.vercel.app" target="_blank">Powered by Nyasadesk</a></div>
    </div>
  `;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fab        = document.getElementById('nyasa-fab');
  const win         = document.getElementById('nyasa-window');
  const badge       = document.getElementById('nyasa-badge');
  const msgs        = document.getElementById('nyasa-msgs');
  const nameGate    = document.getElementById('nyasa-name-gate');
  const composer    = document.getElementById('nyasa-composer');
  const nameInput   = document.getElementById('nyasa-name-input');
  const emailInput  = document.getElementById('nyasa-email-input');
  const nameBtn     = document.getElementById('nyasa-name-btn');
  const input       = document.getElementById('nyasa-input');
  const sendBtn     = document.getElementById('nyasa-send');
  const attachBtn   = document.getElementById('nyasa-attach');
  const fileInput   = document.getElementById('nyasa-file');
  const micBtn      = document.getElementById('nyasa-mic');
  const sendBtn2    = document.getElementById('nyasa-send');
  const recBar      = document.getElementById('nyasa-recording-bar');
  const recWave     = document.getElementById('nyasa-rec-wave');
  const recCancel   = document.getElementById('nyasa-rec-cancel');
  const recTimer    = recBar.querySelector('.rec-timer');
  const preview     = document.getElementById('nyasa-preview');
  const pvMedia     = document.getElementById('nyasa-pv-media');
  const pvCaption   = document.getElementById('nyasa-pv-caption');
  const pvSend      = document.getElementById('nyasa-pv-send');
  const pvClose     = document.getElementById('nyasa-pv-close');
  let pendingFile   = null;  // file waiting in the preview overlay
  const closeBtn    = document.getElementById('nyasa-close');
  const headerName  = document.getElementById('nyasa-header-name');
  let lastReadAt    = null; // ISO string — an agent has read everything up to this point

  const showComposerOrGate = () => {
    if (!visitorName) { nameGate.style.display = 'block'; composer.style.display = 'none'; }
    else { nameGate.style.display = 'none'; composer.style.display = 'flex'; }
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  // Returning visitors (their browser already has a stored session_id for
  // this workspace) get their real past conversation replayed instead of a
  // fresh canned greeting every time — chat history is fully persistent on
  // both ends and only ever goes away if the business explicitly deletes it.
  const loadHistory = async () => {
    try {
      const data = await api({ action: 'history', session_id: sessionId });
      lastReadAt = data.last_read_at || null;
      const history = data.messages || [];
      if (history.length === 0) return false;
      for (const m of history) {
        addMsg(m.direction === 'outbound' ? 'in' : 'out', m.body, m.created_at, m.attachments, m.status);
        lastPollAt = m.created_at;
      }
      refreshTicks();
      return true;
    } catch { return false; }
  };

  api({ action: 'start', session_id: sessionId }).then(async (data) => {
    color = data.color || '#25D366';
    root.style.setProperty('--nyasa-color', color);
    if (data.last_read_at) lastReadAt = data.last_read_at;
    if (data.session_id) { sessionId = data.session_id; localStorage.setItem('nyasa_session_' + WID, sessionId); }
    // Self-heal position if this site's copied snippet is stale vs. what's
    // now saved in Settings (the data-position attribute already applied it
    // instantly with zero flash for anyone on the latest snippet).
    const wantsLeft = (data.position || 'bottom-right') === 'bottom-left';
    root.classList.toggle('nyasa-pos-left', wantsLeft);
    const label = data.label || 'Chat with us';
    if (fab) fab.title = label;
    if (headerName) headerName.textContent = data.agent_name || 'Support Team';

    const hadHistory = isReturningVisitor ? await loadHistory() : false;
    if (!hadHistory) addMsg('in', data.greeting || 'Hi! How can we help?', new Date().toISOString());

    if (!INLINE) {
      // Don't nag returning visitors with a fake "1 new message" badge for
      // history they've already seen — only genuinely new replies (via poll)
      // should badge from here on.
      if (!hadHistory) { badge.style.display = 'flex'; badge.textContent = '1'; }
    } else {
      showComposerOrGate();
      startPolling();
      if (visitorName) input.focus();
    }
  }).catch(() => {
    root.style.setProperty('--nyasa-color', '#25D366');
    if (INLINE) showComposerOrGate();
  });

  // ── Toggle (popup mode only) ─────────────────────────────────────────────
  const toggleOpen = () => {
    open = !open;
    win.classList.toggle('closed', !open);
    badge.style.display = 'none';
    badge.textContent = '0';
    if (open) {
      showComposerOrGate();
      if (visitorName) input.focus();
      startPolling();
      msgs.scrollTop = msgs.scrollHeight;
    } else {
      stopPolling();
    }
  };
  if (fab) fab.addEventListener('click', toggleOpen);
  if (closeBtn) closeBtn.addEventListener('click', toggleOpen);

  // ── Name gate ─────────────────────────────────────────────────────────────
  nameBtn.addEventListener('click', () => {
    const n = nameInput.value.trim();
    if (!n) { nameInput.focus(); return; }
    visitorName = n;
    localStorage.setItem('nyasa_name_' + WID, n);
    nameGate.style.display = 'none';
    composer.style.display = 'flex';
    input.focus();
  });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameBtn.click(); });

  // ── Messaging ─────────────────────────────────────────────────────────────
  // Two small inline SVG tick sets — single check (sent) / double check
  // (read) — same shapes the real inbox uses, just sized for the widget.
  const TICK_SENT = '<svg viewBox="0 0 16 16"><path d="M2 8.5l3.2 3.5L14 3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TICK_READ = '<svg viewBox="0 0 20 16"><path d="M1 8.5l3.2 3.5L11 4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8.5l3.2 3.5L19 4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const addMsg = (dir, text, ts, attachment, status) => {
    const b = document.createElement('div');
    b.className = `nyasa-bubble ${dir}`;
    b.dataset.ts = ts;
    const time = fmt(ts);
    const att = Array.isArray(attachment) ? attachment[0] : attachment;
    let mediaHtml = '';
    if (att?.url) {
      if (att.type === 'audio') {
        mediaHtml = `<div class="nyasa-audio" data-url="${att.url}">
          <button class="play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
          <div class="track"><div class="track-fill"></div></div>
          <span class="dur">0:00</span>
        </div>`;
      } else if (att.type === 'video') {
        mediaHtml = `<video class="attach-video" src="${att.url}" controls></video>`;
      } else {
        mediaHtml = `<img class="attach-img" src="${att.url}" alt="attachment" />`;
      }
    }
    // Skip rendering placeholder caption text like "📷 Photo" twice when there's
    // already a real media element — same rule the team inbox uses.
    const showText = text && !(att && ['📷 Photo','🎥 Video','🎤 Voice note'].includes(text));
    const ticksHtml = dir === 'out' ? `<span class="ticks ${status === 'read' ? 'read' : 'sent'}">${status === 'read' ? TICK_READ : TICK_SENT}</span>` : '';
    // Timestamp sits absolutely-positioned at the bottom-right of the bubble;
    // an invisible inline copy right after the text reserves the matching
    // trailing space on the last line so the real timestamp never overlaps
    // the message itself — same trick WhatsApp Web uses.
    b.innerHTML = `<div class="text">${mediaHtml}${showText ? esc(text) : ''}<span class="meta-spacer">${time}</span><span class="meta">${time}${ticksHtml}</span></div>`;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
    // Wire up audio player if this bubble has one
    const audioEl = b.querySelector('.nyasa-audio');
    if (audioEl) wireAudioPlayer(audioEl);
  };

  // ── Audio player logic ────────────────────────────────────────────────────
  // Mini WhatsApp-style player: play/pause toggle, clickable seek bar,
  // duration display, and a singleton lock so starting one voice note
  // auto-pauses any other one currently playing.
  let currentAudio = null;
  function wireAudioPlayer(container) {
    const url = container.dataset.url;
    const btn = container.querySelector('.play-btn');
    const track = container.querySelector('.track');
    const fill = container.querySelector('.track-fill');
    const durEl = container.querySelector('.dur');
    let audio = new Audio(url);
    let isPlaying = false;

    const fmtDur = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

    const setPlaying = (playing) => {
      isPlaying = playing;
      btn.classList.toggle('pause', playing);
      btn.innerHTML = playing
        ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaying) { audio.pause(); return; }
      // Singleton: pause any other audio currently playing
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
      }
      currentAudio = audio;
      audio.play();
      setPlaying(true);
    });

    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        durEl.textContent = fmtDur(audio.currentTime) + ' / ' + fmtDur(audio.duration);
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      durEl.textContent = '0:00 / ' + fmtDur(audio.duration);
    });

    audio.addEventListener('ended', () => {
      setPlaying(false);
      fill.style.width = '0%';
      durEl.textContent = '0:00 / ' + fmtDur(audio.duration);
    });

    audio.addEventListener('pause', () => {
      setPlaying(false);
      if (currentAudio === audio) currentAudio = null;
    });

    track.addEventListener('click', (e) => {
      if (!audio.duration) return;
      const rect = track.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  }

  // Re-evaluates every one of the visitor's own bubbles against the latest
  // lastReadAt — flips single-grey ticks to double-blue the moment an agent
  // opens the conversation (checked on every poll tick, so it updates live
  // without the visitor needing to do anything).
  const refreshTicks = () => {
    if (!lastReadAt) return;
    const readCutoff = new Date(lastReadAt).getTime();
    msgs.querySelectorAll('.nyasa-bubble.out').forEach(b => {
      const ts = new Date(b.dataset.ts).getTime();
      const tickEl = b.querySelector('.ticks');
      if (tickEl && ts <= readCutoff && !tickEl.classList.contains('read')) {
        tickEl.classList.remove('sent');
        tickEl.classList.add('read');
        tickEl.innerHTML = TICK_READ;
      }
    });
  };

  input.addEventListener('input', () => {
    const hasText = !!input.value.trim();
    sendBtn.disabled = !hasText;
    sendBtn.style.display = hasText ? 'flex' : 'none';
    micBtn.style.display = hasText ? 'none' : 'flex';
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
  });

  sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text || !visitorName) return;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    const now = new Date().toISOString();
    addMsg('out', text, now, null, 'sent');
    api({
      action: 'send', session_id: sessionId,
      name: visitorName, email: emailInput?.value || null,
      body: text, page_url: window.location.href,
    }).catch(() => {
      const errBubble = document.createElement('div');
      errBubble.className = 'nyasa-system';
      errBubble.textContent = '⚠ Message failed to send';
      msgs.appendChild(errBubble);
    });
  });

  // ── Attachments (image/video) ────────────────────────────────────────────
  // ── Media preview + caption (WhatsApp-style) ─────────────────────────────
  // Instead of sending immediately, picking a file opens a full-screen
  // preview overlay where the user can add a caption before sending.
  attachBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || !visitorName) return;
    if (file.size > 6 * 1024 * 1024) {
      const errBubble = document.createElement('div');
      errBubble.className = 'nyasa-system';
      errBubble.textContent = '⚠ File too large (max 6MB)';
      msgs.appendChild(errBubble);
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }
    // Show the preview overlay
    pendingFile = file;
    const kind = file.type.startsWith('video') ? 'video' : 'image';
    const localUrl = URL.createObjectURL(file);
    pvMedia.innerHTML = kind === 'video'
      ? `<video src="${localUrl}" controls autoplay></video>`
      : `<img src="${localUrl}" alt="preview" />`;
    pvCaption.value = '';
    preview.classList.add('active');
    pvCaption.focus();
  });

  // Cancel preview
  pvClose.addEventListener('click', () => {
    preview.classList.remove('active');
    pvMedia.innerHTML = '';
    pendingFile = null;
  });

  // Auto-grow caption textarea
  pvCaption.addEventListener('input', () => {
    pvCaption.style.height = 'auto';
    pvCaption.style.height = Math.min(pvCaption.scrollHeight, 80) + 'px';
  });
  pvCaption.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pvSend.click(); }
  });

  // Send media + caption
  pvSend.addEventListener('click', async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    const caption = pvCaption.value.trim();
    const kind = file.type.startsWith('video') ? 'video' : 'image';
    pendingFile = null;
    preview.classList.remove('active');
    pvMedia.innerHTML = '';

    const now = new Date().toISOString();
    const localUrl = URL.createObjectURL(file);
    // If there's a caption, show it as the bubble text alongside the media
    addMsg('out', caption, now, [{ url: localUrl, type: kind }], 'sent');

    try {
      const file_base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api({
        action: 'upload', session_id: sessionId,
        name: visitorName, email: emailInput?.value || null,
        file_base64, file_name: file.name, file_type: file.type, kind,
        body: caption || null, page_url: window.location.href,
      });
    } catch {
      const errBubble = document.createElement('div');
      errBubble.className = 'nyasa-system';
      errBubble.textContent = '⚠ Upload failed';
      msgs.appendChild(errBubble);
      msgs.scrollTop = msgs.scrollHeight;
    }
  });

  // ── Voice notes (MediaRecorder) ───────────────────────────────────────────
  // WhatsApp-style: mic button replaces send when input is empty. Tap to
  // start recording, tap again (or the send/checkmark) to stop+send, or
  // tap the cancel (trash) button to discard. Shows a live timer + a
  // pseudo-waveform of volume levels while recording.
  let mediaRecorder = null;
  let audioChunks = [];
  let recStartTime = 0;
  let recTimerInt = null;
  let recAnalyser = null;
  let recStream = null;
  let waveBars = [];

  const fmtRec = ms => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  const stopRecordingUI = () => {
    clearInterval(recTimerInt);
    micBtn.classList.remove('recording');
    recBar.classList.remove('active');
    input.style.display = '';
    attachBtn.style.display = '';
    // Reset wave bars
    waveBars.forEach(b => b.style.height = '4px');
  };

  micBtn.addEventListener('click', async () => {
    // If already recording, stop and send
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    // Start recording
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const errBubble = document.createElement('div');
      errBubble.className = 'nyasa-system';
      errBubble.textContent = '⚠ Microphone permission denied';
      msgs.appendChild(errBubble);
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }

    // Build wave bars (24 bars)
    recWave.innerHTML = '';
    waveBars = [];
    for (let i = 0; i < 24; i++) {
      const bar = document.createElement('span');
      bar.style.height = '4px';
      recWave.appendChild(bar);
      waveBars.push(bar);
    }

    audioChunks = [];
    mediaRecorder = new MediaRecorder(recStream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const duration = Date.now() - recStartTime;
      stopRecordingUI();
      // Stop all tracks to release the mic
      recStream.getTracks().forEach(t => t.stop());

      if (audioChunks.length === 0) return;
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      // Discard if too short (< 1 second)
      if (duration < 1000) {
        const errBubble = document.createElement('div');
        errBubble.className = 'nyasa-system';
        errBubble.textContent = '⚠ Recording too short';
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }

      const localUrl = URL.createObjectURL(blob);
      const now = new Date().toISOString();
      addMsg('out', '', now, [{ url: localUrl, type: 'audio' }], 'sent');

      // Upload
      try {
        const file_base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await api({
          action: 'upload', session_id: sessionId,
          name: visitorName, email: emailInput?.value || null,
          file_base64, file_name: 'voice.webm', file_type: 'audio/webm',
          kind: 'audio', page_url: window.location.href,
        });
      } catch {
        const errBubble = document.createElement('div');
        errBubble.className = 'nyasa-system';
        errBubble.textContent = '⚠ Voice note failed to send';
        msgs.appendChild(errBubble);
        msgs.scrollTop = msgs.scrollHeight;
      }
    };

    mediaRecorder.start();
    recStartTime = Date.now();
    micBtn.classList.add('recording');
    recBar.classList.add('active');
    input.style.display = 'none';
    attachBtn.style.display = 'none';

    // Timer + volume meter
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(recStream);
    recAnalyser = audioCtx.createAnalyser();
    recAnalyser.fftSize = 64;
    source.connect(recAnalyser);
    const dataArr = new Uint8Array(recAnalyser.frequencyBinCount);

    recTimerInt = setInterval(() => {
      const elapsed = Date.now() - recStartTime;
      recTimer.textContent = fmtRec(elapsed);
      // Update wave bars from volume data
      if (recAnalyser) {
        recAnalyser.getByteFrequencyData(dataArr);
        for (let i = 0; i < waveBars.length; i++) {
          const idx = Math.floor(i * dataArr.length / waveBars.length);
          const vol = dataArr[idx] || 0;
          waveBars[i].style.height = Math.max(4, (vol / 255) * 24) + 'px';
        }
      }
    }, 100);
  });

  // Cancel recording (discard)
  recCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      // Set onstop to do nothing (discard)
      mediaRecorder.onstop = () => {
        stopRecordingUI();
        recStream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.stop();
    }
  });

  // ── Polling for agent replies ─────────────────────────────────────────────
  const poll = async () => {
    if (!sessionId || !visitorName) return;
    try {
      const data = await api({ action: 'poll', session_id: sessionId, since: lastPollAt });
      if (data.last_read_at) lastReadAt = data.last_read_at;
      for (const m of data.messages || []) {
        addMsg('in', m.body, m.created_at, m.attachments);
        lastPollAt = m.created_at;
        if (!open) {
          const n = parseInt(badge.textContent || '0') + 1;
          badge.textContent = n;
          badge.style.display = 'flex';
        }
      }
      refreshTicks();
    } catch {}
  };

  const startPolling = () => { if (!pollTimer) pollTimer = setInterval(poll, 4000); };
  const stopPolling  = () => { clearInterval(pollTimer); pollTimer = null; };
})();
