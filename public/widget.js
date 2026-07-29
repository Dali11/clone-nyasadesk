/* Nyasadesk WhatsApp Widget v3.2
 * Floating WhatsApp button — one tap opens WhatsApp directly with prefilled message.
 *
 * Usage:
 *   <script src="https://nyasadesk.com/widget.js" data-workspace-id="YOUR_ID"></script>
 *
 * Options:
 *   data-workspace-id  (required) — workspace ID from Nyasadesk settings
 *   data-position      (optional) — "bottom-right" (default) or "bottom-left"
 *   data-prefill       (optional) — override the admin-configured prefill message
 */
(function () {
  'use strict';

  const API    = 'https://nyasadesk.com/api/widget/chat';
  const script = document.currentScript || document.querySelector('script[data-workspace-id]');
  const WID    = script?.getAttribute('data-workspace-id');
  const POSITION      = (script?.getAttribute('data-position') || 'bottom-right').toLowerCase();
  const CUSTOM_PREFILL = script?.getAttribute('data-prefill') || '';

  if (!WID) { console.warn('[Nyasadesk] data-workspace-id is required'); return; }

  let waNumber = '';
  let prefillMessage = 'Hi! I found you on your website and would like to chat.';
  let agentName = 'Support Team';

  // ── Fetch workspace config ─────────────────────────────────────────────
  const loadConfig = async () => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', workspace_id: WID }),
      });
      const data = await res.json();
      waNumber       = data.wa_number || '';
      prefillMessage = data.prefill_message || data.greeting || prefillMessage;
      agentName      = data.agent_name || agentName;
    } catch (e) {
      console.warn('[Nyasadesk] Could not load widget config', e);
    }
    render();
  };

  // ── WhatsApp SVG ───────────────────────────────────────────────────────
  const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  // ── Build the floating button ──────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'nyasa-wa-widget';
  host.style.cssText = 'position:fixed;z-index:2147483640;' +
    (POSITION === 'bottom-left' ? 'bottom:24px;left:24px;' : 'bottom:24px;right:24px;');
  document.body.appendChild(host);

  const style = document.createElement('style');
  style.textContent = `
    #nyasa-wa-fab {
      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
      background: #25D366; color: #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(37,211,102,0.5);
      transition: transform .18s, box-shadow .18s;
      animation: nyasa-pulse 2.8s ease-in-out infinite;
      position: relative;
      text-decoration: none;
    }
    #nyasa-wa-fab:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(37,211,102,0.6); }
    @keyframes nyasa-pulse {
      0%, 100% { box-shadow: 0 4px 16px rgba(37,211,102,0.5); }
      50% { box-shadow: 0 4px 16px rgba(37,211,102,0.5), 0 0 0 10px rgba(37,211,102,0.15); }
    }
    #nyasa-wa-tooltip {
      position: absolute;
      ${POSITION === 'bottom-left' ? 'left: 66px;' : 'right: 66px;'}
      bottom: 50%; transform: translateY(50%);
      background: #1a1a1a; color: #fff;
      font-size: 13px; font-weight: 500; white-space: nowrap;
      padding: 6px 12px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      pointer-events: none; opacity: 0;
      transition: opacity .2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    #nyasa-wa-tooltip::after {
      content: '';
      position: absolute; top: 50%; transform: translateY(-50%);
      ${POSITION === 'bottom-left' ? 'left: -5px; border-width: 5px 5px 5px 0; border-color: transparent #1a1a1a transparent transparent;' : 'right: -5px; border-width: 5px 0 5px 5px; border-color: transparent transparent transparent #1a1a1a;'}
      border-style: solid;
    }
    #nyasa-wa-fab:hover #nyasa-wa-tooltip { opacity: 1; }
  `;
  host.appendChild(style);

  const fab = document.createElement('a');
  fab.id = 'nyasa-wa-fab';
  fab.setAttribute('aria-label', 'Chat on WhatsApp');
  fab.setAttribute('target', '_blank');
  fab.setAttribute('rel', 'noopener noreferrer');
  fab.href = '#';
  fab.innerHTML = WA_SVG + '<span id="nyasa-wa-tooltip">' + agentName + '</span>';
  host.appendChild(fab);

  // ── Render with config ─────────────────────────────────────────────────
  function render() {
    // Update tooltip with agent name
    const tooltip = fab.querySelector('#nyasa-wa-tooltip');
    if (tooltip) tooltip.textContent = agentName;

    if (waNumber) {
      const prefill  = CUSTOM_PREFILL || prefillMessage;
      const cleanNum = waNumber.replace(/[^0-9]/g, '');
      fab.href = 'https://wa.me/' + cleanNum + '?text=' + encodeURIComponent(prefill);
    } else {
      fab.href = 'https://wa.me/';
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  loadConfig();
})();
