
/* Nyasadesk Live Chat Widget v1.1
 * Floating bubble:  <script src="https://nyasadesk1.vercel.app/widget.js" data-workspace-id="YOUR_ID"></script>
 * Inline / support-page embed (fills its container, always open, no popup bubble):
 *   <div id="nyasa-inline-target"></div>
 *   <script src="https://nyasadesk1.vercel.app/widget.js" data-workspace-id="YOUR_ID" data-mode="inline"></script>
 */
(function () {
  'use strict';

  const API    = 'https://nyasadesk1.vercel.app/api/widget/chat';
  const script = document.currentScript || document.querySelector('script[data-workspace-id]');
  const WID    = script?.getAttribute('data-workspace-id');
  const MODE   = (script?.getAttribute('data-mode') || 'popup').toLowerCase(); // 'popup' | 'inline'
  if (!WID) { console.warn('[Nyasadesk] data-workspace-id is required'); return; }

  const INLINE = MODE === 'inline';

  // ── State ─────────────────────────────────────────────────────────────────
  let sessionId    = localStorage.getItem('nyasa_session_' + WID) || null;
  let visitorName  = localStorage.getItem('nyasa_name_' + WID)  || null;
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

  // ── DOM Build ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #nyasa-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; }
    #nyasa-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483640;
      width: 58px; height: 58px; border-radius: 50%;
      background: var(--nyasa-color); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25); transition: transform .2s, box-shadow .2s;
    }
    #nyasa-fab:hover { transform: scale(1.08); box-shadow: 0 6px 32px rgba(0,0,0,0.3); }
    #nyasa-fab svg { width: 26px; height: 26px; fill: #fff; }
    #nyasa-badge {
      position: absolute; top: -3px; right: -3px;
      background: #EF4444; color: #fff; font-size: 10px; font-weight: 700;
      min-width: 18px; height: 18px; border-radius: 9px; padding: 0 4px;
      display: none; align-items: center; justify-content: center;
      border: 2px solid #fff;
    }
    #nyasa-window {
      position: fixed; bottom: 96px; right: 24px; z-index: 2147483639;
      width: 360px; max-width: calc(100vw - 32px);
      height: 520px; max-height: calc(100vh - 120px);
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 48px rgba(0,0,0,0.35);
      display: flex; flex-direction: column;
      transform-origin: bottom right;
      transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s;
    }
    #nyasa-window.closed { transform: scale(0.7) translateY(20px); opacity: 0; pointer-events: none; }
    /* ── Inline / support-page mode: fill the container instead of floating ── */
    #nyasa-widget.nyasa-inline #nyasa-window {
      position: static; width: 100%; height: 100%; max-width: none; max-height: none;
      border-radius: 12px; box-shadow: none; transform: none !important; opacity: 1 !important;
      pointer-events: auto !important; min-height: 480px;
    }
    #nyasa-widget.nyasa-inline { display: block; width: 100%; height: 100%; }
    #nyasa-header {
      background: var(--nyasa-color); padding: 14px 16px;
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
      flex: 1; overflow-y: auto; padding: 16px; background: #ECE5DD;
      display: flex; flex-direction: column; gap: 10px;
    }
    #nyasa-msgs::-webkit-scrollbar { width: 4px; }
    #nyasa-msgs::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
    .nyasa-bubble { display: flex; flex-direction: column; max-width: 78%; }
    .nyasa-bubble.out { align-self: flex-end; align-items: flex-end; }
    .nyasa-bubble.in  { align-self: flex-start; align-items: flex-start; }
    .nyasa-bubble .text {
      padding: 10px 14px 11px; font-size: 14px; line-height: 1.45; word-break: break-word;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    }
    .nyasa-bubble.out .text { background: #DCF8C6; color: #1a1a1a; border-radius: 12px 3px 12px 12px; }
    .nyasa-bubble.in  .text { background: #fff;      color: #1a1a1a; border-radius: 3px 12px 12px 12px; }
    .nyasa-bubble .meta { font-size: 10px; color: #888; margin-top: 3px; padding: 0 4px; }
    .nyasa-system { text-align: center; font-size: 11px; color: #888; padding: 4px 0; }
    #nyasa-name-gate { background: #fff; padding: 16px; border-top: 1px solid #eee; flex-shrink: 0; }
    #nyasa-name-gate p { font-size: 12px; color: #666; margin-bottom: 8px; }
    #nyasa-name-gate input {
      width: 100%; border: 1px solid #ddd; border-radius: 10px; padding: 8px 12px;
      font-size: 13px; margin-bottom: 8px; outline: none;
    }
    #nyasa-name-gate input:focus { border-color: var(--nyasa-color); }
    #nyasa-name-gate button {
      width: 100%; padding: 9px; border: none; border-radius: 10px;
      background: var(--nyasa-color); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    #nyasa-composer { background: #f0f0f0; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
    #nyasa-input {
      flex: 1; border: none; background: #fff; border-radius: 22px;
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
    #nyasa-powered { background: #f0f0f0; text-align: center; font-size: 10px; color: #aaa; padding: 4px 0 6px; flex-shrink: 0; }
    #nyasa-powered a { color: #aaa; text-decoration: none; }
    @media (max-width: 420px) {
      #nyasa-window { bottom: 84px; right: 12px; width: calc(100vw - 24px); }
      #nyasa-fab { bottom: 16px; right: 16px; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'nyasa-widget';
  if (INLINE) {
    root.className = 'nyasa-inline';
    // In inline mode, mount into a target container if present, else right where the script tag is
    const target = document.getElementById('nyasa-inline-target') || script.parentElement || document.body;
    target.appendChild(root);
  } else {
    document.body.appendChild(root);
  }

  root.innerHTML = `
    ${INLINE ? '' : `
    <button id="nyasa-fab" title="Chat with us">
      <span id="nyasa-badge"></span>
      <svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
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
        <textarea id="nyasa-input" placeholder="Type a message…" rows="1"></textarea>
        <button id="nyasa-send" disabled>
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
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
  const closeBtn    = document.getElementById('nyasa-close');
  const headerName  = document.getElementById('nyasa-header-name');

  const showComposerOrGate = () => {
    if (!visitorName) { nameGate.style.display = 'block'; composer.style.display = 'none'; }
    else { nameGate.style.display = 'none'; composer.style.display = 'flex'; }
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  api({ action: 'start', session_id: sessionId }).then(data => {
    color = data.color || '#25D366';
    root.style.setProperty('--nyasa-color', color);
    if (data.session_id) { sessionId = data.session_id; localStorage.setItem('nyasa_session_' + WID, sessionId); }
    const label = data.label || 'Chat with us';
    if (fab) fab.title = label;
    if (headerName) headerName.textContent = data.agent_name || 'Support Team';
    addMsg('in', data.greeting || 'Hi! How can we help?', new Date().toISOString());
    if (!INLINE) {
      badge.style.display = 'flex';
      badge.textContent = '1';
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
  const addMsg = (dir, text, ts) => {
    const b = document.createElement('div');
    b.className = `nyasa-bubble ${dir}`;
    b.innerHTML = `<div class="text">${esc(text)}</div><div class="meta">${fmt(ts)}</div>`;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
  };

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
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
    addMsg('out', text, now);
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

  // ── Polling for agent replies ─────────────────────────────────────────────
  const poll = async () => {
    if (!sessionId || !visitorName) return;
    try {
      const data = await api({ action: 'poll', session_id: sessionId, since: lastPollAt });
      for (const m of data.messages || []) {
        addMsg('in', m.body, m.created_at);
        lastPollAt = m.created_at;
        if (!open) {
          const n = parseInt(badge.textContent || '0') + 1;
          badge.textContent = n;
          badge.style.display = 'flex';
        }
      }
    } catch {}
  };

  const startPolling = () => { if (!pollTimer) pollTimer = setInterval(poll, 4000); };
  const stopPolling  = () => { clearInterval(pollTimer); pollTimer = null; };
})();
