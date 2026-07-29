/* Nyasadesk WhatsApp Widget v3.0
 * Floating WhatsApp button — redirects to WhatsApp app with prefilled message.
 *
 * Usage:
 *   <script src="https://nyasadesk.com/widget.js" data-workspace-id="YOUR_ID"></script>
 *
 * The widget fetches the workspace's WhatsApp number + greeting from the
 * Nyasadesk backend, then shows a floating WhatsApp button. When a visitor
 * clicks it, it opens https://wa.me/<number>?text=<prefilled_message>
 * directly in the WhatsApp app (or web fallback).
 *
 * Options:
 *   data-workspace-id  (required) — workspace ID from Nyasadesk settings
 *   data-position      (optional) — "bottom-right" (default) or "bottom-left"
 *   data-prefill       (optional) — custom prefilled message text
 *   data-label         (optional) — tooltip text on hover (default: "Chat with us")
 */
(function () {
  'use strict';

  const API    = 'https://nyasadesk.com/api/widget/chat';
  const script = document.currentScript || document.querySelector('script[data-workspace-id]');
  const WID    = script?.getAttribute('data-workspace-id');
  let POSITION = (script?.getAttribute('data-position') || 'bottom-right').toLowerCase();
  const CUSTOM_PREFILL = script?.getAttribute('data-prefill') || '';
  const CUSTOM_LABEL    = script?.getAttribute('data-label') || '';

  if (!WID) { console.warn('[Nyasadesk] data-workspace-id is required'); return; }

  // ── State ─────────────────────────────────────────────────────────────────
  let waNumber = '';
  let greeting = 'Hi! I found you on your website and would like to chat.';
  let label    = 'Chat with us';
  let agentName = 'Support Team';

  // ── Fetch workspace config ────────────────────────────────────────────────
  const loadConfig = async () => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', workspace_id: WID }),
      });
      const data = await res.json();
      waNumber  = data.wa_number || '';
      greeting  = data.greeting || greeting;
      label     = CUSTOM_LABEL || data.label || label;
      agentName = data.agent_name || agentName;
    } catch (e) {
      console.warn('[Nyasadesk] Could not load widget config', e);
    }
    render();
  };

  // ── Build the floating button + popup ────────────────────────────────────
  const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  const host = document.createElement('div');
  host.id = 'nyasa-wa-widget';
  host.style.cssText = 'position:fixed;z-index:2147483640;' +
    (POSITION === 'bottom-left' ? 'bottom:22px;left:22px;' : 'bottom:22px;right:22px;');
  document.body.appendChild(host);

  const style = document.createElement('style');
  style.textContent = `
    #nyasa-wa-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #nyasa-wa-fab {
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: #25D366; color: #fff; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(37,211,102,0.4); transition: transform .2s, box-shadow .2s;
      animation: nyasa-pulse 2.5s ease-in-out infinite;
    }
    #nyasa-wa-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(37,211,102,0.5); }
    #nyasa-wa-fab svg { width: 30px; height: 30px; }
    @keyframes nyasa-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(37,211,102,0.4); }
      50% { box-shadow: 0 4px 20px rgba(37,211,102,0.4), 0 0 0 12px rgba(37,211,102,0.12); }
    }
    #nyasa-wa-popup {
      position: absolute; bottom: 72px;
      ${POSITION === 'bottom-left' ? 'left: 0;' : 'right: 0;'}
      width: 320px; max-width: calc(100vw - 44px);
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      background: #fff; opacity: 0; transform: translateY(12px) scale(0.95);
      pointer-events: none; transition: all .25s cubic-bezier(.4,0,.2,1);
    }
    #nyasa-wa-popup.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
    #nyasa-wa-popup .header {
      background: linear-gradient(135deg, #075E54 0%, #128C7E 100%);
      padding: 16px; display: flex; align-items: center; gap: 12px;
    }
    #nyasa-wa-popup .header .avatar {
      width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #nyasa-wa-popup .header .avatar svg { width: 22px; height: 22px; fill: #fff; }
    #nyasa-wa-popup .header .info { flex: 1; }
    #nyasa-wa-popup .header .name { font-size: 15px; font-weight: 700; color: #fff; }
    #nyasa-wa-popup .header .status { font-size: 12px; color: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 5px; }
    #nyasa-wa-popup .header .status .dot { width: 7px; height: 7px; border-radius: 50%; background: #4ADE80; }
    #nyasa-wa-popup .header .close {
      background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.7);
      font-size: 22px; padding: 4px; line-height: 1;
    }
    #nyasa-wa-popup .header .close:hover { color: #fff; }
    #nyasa-wa-popup .body {
      padding: 20px 16px; background: #ECE5DD; min-height: 100px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cg fill='%2300000005'%3E%3Cpath d='M20 10c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z'/%3E%3C/g%3E%3C/svg%3E");
    }
    #nyasa-wa-popup .body .bubble {
      background: #fff; border-radius: 2px 12px 12px 12px; padding: 10px 14px;
      font-size: 14px; line-height: 1.5; color: #1a2530; max-width: 85%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08); position: relative;
    }
    #nyasa-wa-popup .body .bubble .time {
      font-size: 10px; color: #999; text-align: right; margin-top: 4px;
    }
    #nyasa-wa-popup .footer { padding: 12px 16px; background: #fff; border-top: 1px solid #f0f0f0; }
    #nyasa-wa-popup .footer .btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 12px; border: none; border-radius: 10px; cursor: pointer;
      background: #25D366; color: #fff; font-size: 15px; font-weight: 600;
      transition: background .2s; text-decoration: none;
    }
    #nyasa-wa-popup .footer .btn:hover { background: #1FB855; }
    #nyasa-wa-popup .footer .btn svg { width: 20px; height: 20px; fill: currentColor; }
    #nyasa-wa-popup .footer .hint { text-align: center; font-size: 11px; color: #999; margin-top: 8px; }
  `;
  host.appendChild(style);

  const fab = document.createElement('button');
  fab.id = 'nyasa-wa-fab';
  fab.innerHTML = WA_SVG;
  fab.setAttribute('aria-label', 'Chat on WhatsApp');
  host.appendChild(fab);

  const popup = document.createElement('div');
  popup.id = 'nyasa-wa-popup';
  popup.innerHTML = `
    <div class="header">
      <div class="avatar">${WA_SVG}</div>
      <div class="info">
        <div class="name" id="nyasa-wa-name">${agentName}</div>
        <div class="status"><span class="dot"></span> <span>typically replies in minutes</span></div>
      </div>
      <button class="close" id="nyasa-wa-close">&times;</button>
    </div>
    <div class="body">
      <div class="bubble">
        ${greeting.replace(/</g, '&lt;')}
        <div class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
    <div class="footer">
      <a class="btn" id="nyasa-wa-go" href="#" target="_blank" rel="noopener">
        ${WA_SVG}
        <span>Chat on WhatsApp</span>
      </a>
      <div class="hint">Opens WhatsApp app with a message ready to send</div>
    </div>
  `;
  host.appendChild(popup);

  // ── Interactions ─────────────────────────────────────────────────────────
  let isOpen = false;

  const togglePopup = (open) => {
    isOpen = open !== undefined ? open : !isOpen;
    popup.classList.toggle('open', isOpen);
  };

  fab.addEventListener('click', () => {
    togglePopup();
  });

  document.getElementById('nyasa-wa-close').addEventListener('click', () => togglePopup(false));

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen && !host.contains(e.target)) togglePopup(false);
  });

  // ── Render with config ───────────────────────────────────────────────────
  function render() {
    const nameEl = document.getElementById('nyasa-wa-name');
    if (nameEl) nameEl.textContent = agentName;

    // Update greeting bubble
    const bubble = popup.querySelector('.bubble');
    if (bubble) {
      bubble.innerHTML = `${greeting.replace(/</g, '&lt;')}<div class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
    }

    // Set the WhatsApp link
    const goBtn = document.getElementById('nyasa-wa-go');
    if (goBtn && waNumber) {
      const prefill = CUSTOM_PREFILL || greeting;
      const cleanNumber = waNumber.replace(/[^0-9]/g, '');
      goBtn.href = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(prefill)}`;
    } else if (goBtn && !waNumber) {
      // No number configured — disable the button
      goBtn.style.opacity = '0.5';
      goBtn.style.pointerEvents = 'none';
      goBtn.querySelector('span').textContent = 'WhatsApp not configured';
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  loadConfig();
})();
