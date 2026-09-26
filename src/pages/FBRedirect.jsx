// ── Android App-Links interstitial (2026-09-26) ─────────────────────────────
// Opening https://www.facebook.com/dialog/oauth... directly via window.open
// from an installed PWA / TWA (the APK) makes Android resolve facebook.com as
// a VERIFIED APP LINK — the OS opens the native Facebook app instead of the
// browser tab, and the whole Embedded Signup (Login for Business) flow is lost
// ("just logging into the Facebook app"). In a plain browser tab the same flow
// works because the navigation happens INSIDE the page.
// Fix: the new tab always opens on OUR origin first (never an app-link target),
// and this page then navigates the tab to Facebook's dialog. An in-tab
// navigation is handled by the browser itself — no App Link handoff — so the
// dialog (login + business onboarding) runs in the same tab and redirects back
// to /api/auth/whatsapp-embedded → /settings, which completes the connection.
import { useEffect, useState } from 'react';

export default function FBRedirect() {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const ws = new URLSearchParams(window.location.search).get('ws');
        const configRes = await fetch('/api/auth/whatsapp-embedded', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _action: 'get_config' }),
        });
        const configData = await configRes.json();
        if (!configData.config_id || !configData.app_id) {
          setError("Facebook signup isn't configured. Close this tab and connect from Nyasadesk Settings.");
          return;
        }
        const redirectUri = window.location.origin + '/api/auth/whatsapp-embedded';
        const state = btoa(JSON.stringify({ workspace_id: ws, v: 1 }));
        const u = 'https://www.facebook.com/v26.0/dialog/oauth' +
          `?client_id=${configData.app_id}` +
          `&config_id=${configData.config_id}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${encodeURIComponent(state)}` +
          '&response_type=code&display=page';
        if (dead) return;
        setUrl(u);
        window.location.replace(u); // in-tab navigation — stays in the browser
      } catch (e) {
        if (!dead) setError('Could not reach Facebook. Close this tab and try again from Nyasadesk Settings.');
      }
    })();
    return () => { dead = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#13131d' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <h2 className="text-lg font-semibold text-white mb-2">Opening Facebook…</h2>
        {error ? (
          <>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button onClick={() => window.close()} className="w-full py-2.5 rounded-lg bg-white/10 text-white text-sm">Close this tab</button>
          </>
        ) : (
          <>
            <p className="text-sm text-white/60 mb-4">Taking you to Facebook Login for Business. Keep everything in this tab.</p>
            {url && (
              <a href={url} className="inline-block py-2.5 px-4 rounded-lg bg-[#25D366] text-[#0B141A] text-sm font-medium">
                Tap here if Facebook doesn't open
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
