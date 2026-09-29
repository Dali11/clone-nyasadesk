// ── Embedded-signup interstitial (2026-09-26, rewritten 2026-09-27) ─────────
// WHY THIS PAGE EXISTS: installed PWAs (added-to-home-screen) can't host the
// FB.login popup callback, and opening facebook.com directly via window.open
// makes Android hand the URL to the native Facebook app (verified app-link).
// So the PWA opens THIS page (same origin, never app-linked) in a new tab.
//
// WHAT IT DOES NOW (2026-09-27 rewrite): a plain dialog/oauth redirect only
// shows a GENERIC login — Meta's embedded signup wizard (business / WABA /
// phone-number steps) renders ONLY via the SDK popup, so the old
// "navigate this tab to dialog/oauth" flow connected nothing on phones.
// This page now runs the FULL SDK signup right here in this normal browser
// tab: preload config + SDK on mount, tap the button → FB.login fires
// synchronously in the gesture, the wizard runs in the popup, the session
// info (waba_id / phone_number_id) arrives via postMessage, and this page
// completes the connection by POSTing the code to the same endpoint the
// Settings page uses. The opening PWA window polls the DB and reflects the
// connection the moment it lands.
import { useEffect, useRef, useState } from 'react';
import { buildFacebookDialogUrl } from '@/lib/facebookDialog';
import { getChannelConfigs } from '@/lib/channels';

export default function FBRedirect() {
  const [phase, setPhase] = useState('loading'); // loading | ready | busy | done | error
  const [error, setError] = useState('');
  const [setupPin, setSetupPin] = useState(null);
  const ws = new URLSearchParams(window.location.search).get('ws') || '';
  const configRef = useRef(null);
  const signupDataRef = useRef(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const configRes = await fetch('/api/auth/whatsapp-embedded', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _action: 'get_config' }),
        });
        const configData = await configRes.json();
        if (!configData.config_id || !configData.app_id) {
          if (dead) return;
          setError("Facebook signup isn't configured. Close this tab and connect from NyasaDesk Settings.");
          setPhase('error');
          return;
        }
        // Load the SDK before the user can tap, so FB.login can fire
        // synchronously inside the tap gesture (mobile popup rule).
        await new Promise((resolve) => {
          if (window.FB) return resolve();
          window.fbAsyncInit = () => resolve();
          const script = document.createElement('script');
          script.src = 'https://connect.facebook.net/en_US/sdk.js';
          script.async = true;
          script.onload = () => { if (window.FB) resolve(); };
          setTimeout(resolve, 6000);
        });
        if (dead) return;
        if (!window.FB) {
          setError('Facebook SDK failed to load. Check your connection and refresh this page.');
          setPhase('error');
          return;
        }
        window.FB.init({ appId: configData.app_id, version: 'v26.0', cookie: true });
        configRef.current = configData;
        setPhase('ready');
      } catch {
        if (!dead) { setError('Could not reach Facebook. Refresh this page or connect from NyasaDesk Settings.'); setPhase('error'); }
      }
    })();
    return () => { dead = true; };
  }, []);

  // FOCUS POLLING (2026-09-29): mobile browsers suspend this tab while the
  // wizard popup runs, which can kill the SDK's postMessage relay — the user
  // finishes on Facebook, comes back, and this page is stuck on
  // "Completing signup…". Poll the DB whenever this tab wakes up; if the
  // connection landed another way, show done. If it never lands, the
  // "Continue in this tab" fallback below runs the wizard via the redirect
  // flow, which completes server-side and needs no relay at all.
  useEffect(() => {
    if (phase !== 'busy') return;
    let dead = false;
    let baseline = null; // config.connected_at snapshot; captured on first check
    const check = async () => {
      if (dead) return;
      try {
        if (!ws) return;
        const rows = await getChannelConfigs(ws);
        const wa = rows.find(r => r.channel === 'whatsapp');
        const connAt = (wa?.config?.connected_at || 'none');
        // FRESH-CONFIG GUARD (2026-09-29 audit): workspaces being
        // RE-connected (WABA migration) already have an old config — without
        // this, the first poll would report the OLD connection as success
        // while the new signup never landed. First check captures the
        // baseline; only a CHANGED connected_at counts as fresh.
        if (baseline === null) { baseline = connAt; return; }
        if (connAt !== baseline && wa?.enabled && wa.config && (wa.config.waba_id || wa.config.access_token || wa.config.phone_number_id)) {
          dead = true;
          if (wa.config.setup_pin) setSetupPin(wa.config.setup_pin);
          setPhase('done');
        }
      } catch { /* keep waiting */ }
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      dead = true;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [phase, ws]);

  // Session-info listener — identical contract to Settings.jsx (sessionInfoVersion 3).
  const startSignup = () => {
    if (!configRef.current || !window.FB) return;
    setError('');
    const listener = (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.data?.waba_id || data.data?.phone_number_id) signupDataRef.current = data.data;
          else if (data.waba_id || data.phone_number_id) signupDataRef.current = data;
          else if (data.event === 'FINISH' && data.data) signupDataRef.current = data.data;
        }
      } catch {}
    };
    window.addEventListener('message', listener);
    setPhase('busy');

    // The FB SDK rejects async callbacks — plain sync wrapper, async helper.
    const finish = async (response) => {
      window.removeEventListener('message', listener);
      if (!response?.authResponse?.code) {
        // Popup cancelled or blocked. If NO window ever opened (blocked), the
        // SDK can never deliver the code on this device — take over THIS tab
        // and run the wizard via the full-page dialog redirect instead:
        // Meta ends it by navigating here to redirect_uri?code=..., and the
        // GET callback in api/auth/whatsapp-embedded.js completes the signup
        // server-side (no popup, no SDK relay needed).
        if (!response || response.status === undefined) {
          setPhase('busy');
          setError('Popup blocked — continuing in this tab instead…');
          window.location.href = buildFacebookDialogUrl(configRef.current, ws);
          return;
        }
        setPhase('ready');
        setError('The Facebook window was cancelled. Tap "Continue with Facebook" to try again.');
        return;
      }
      try {
        const captured = signupDataRef.current || {};
        const res = await fetch('/api/auth/whatsapp-embedded', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: response.authResponse.code, workspace_id: ws,
            waba_id: captured.waba_id || null, phone_number_id: captured.phone_number_id || null,
          }),
        });
        const d = await res.json();
        if (d.ok) {
          if (d.setup_pin) setSetupPin(d.setup_pin);
          setPhase('done');
        } else {
          setPhase('error');
          setError(d.error || 'Connection failed. Close this tab and try again from NyasaDesk Settings.');
        }
      } catch (e) {
        setPhase('error');
        setError(e.message || 'Connection failed. Close this tab and try again from NyasaDesk Settings.');
      }
    };

    try {
      window.FB.login((response) => { finish(response); }, {
        config_id: configRef.current.config_id,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: '3' },
      });
    } catch (e) {
      setPhase('error');
      setError('Facebook login failed to start: ' + (e.message || e));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#13131d' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {phase === 'done' ? (
          <>
            <h2 className="text-lg font-semibold text-white mb-2">Connected ✓</h2>
            <p className="text-sm text-white/60 mb-4">
              Your WhatsApp channel is connected. You can close this tab and return to NyasaDesk.
              {setupPin && <span className="block mt-2 text-white/80">Setup PIN: <b>{setupPin}</b></span>}
            </p>
            <button onClick={() => window.close()} className="w-full py-2.5 rounded-lg bg-white/10 text-white text-sm">Close this tab</button>
          </>
        ) : phase === 'error' ? (
          <>
            <h2 className="text-lg font-semibold text-white mb-2">Couldn't connect</h2>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button onClick={() => window.close()} className="w-full py-2.5 rounded-lg bg-white/10 text-white text-sm">Close this tab</button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white mb-2">Connect WhatsApp</h2>
            <p className="text-sm text-white/60 mb-4">
              Tap the button and complete the Facebook steps in the window that opens — keep
              everything in this tab. Log in with your phone number or email, not the Facebook app.
            </p>
            <button onClick={startSignup} disabled={phase === 'loading' || phase === 'busy'}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#1877F2] hover:bg-[#0f6add] disabled:opacity-60">
              {phase === 'loading' ? 'Getting ready…' : phase === 'busy' ? 'Completing signup…' : 'Continue with Facebook'}
            </button>
            {(phase === 'ready' || phase === 'busy') && (
              <button onClick={() => { setPhase('busy'); window.location.href = buildFacebookDialogUrl(configRef.current, ws); }}
                className="w-full mt-3 py-2.5 rounded-xl text-xs text-white/70 bg-white/5 hover:bg-white/10 border border-white/10">
                {phase === 'busy' ? 'Stuck or no window? Continue in this tab instead' : 'No window opening? Continue in this tab instead'}
              </button>
            )}
            {phase === 'busy' && <p className="text-[11px] text-white/40 mt-3">Finish the steps in the Facebook window — this page will update when done.</p>}
          </>
        )}
      </div>
    </div>
  );
}
