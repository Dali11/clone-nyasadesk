// ─────────────────────────────────────────────────────────────────────────────
// Facebook Embedded Signup — full-page redirect variant ("redirect flow").
// 2026-09-29: the FB.login popup is unreliable on mobile (blocked popups,
// app-link hijack, PWA windows that can't host the callback), so the
// /fb-redirect tab needs a fallback that doesn't use the SDK popup: navigate
// the whole tab to Meta's dialog URL. With response_type=code Meta completes
// the OAuth dialog by redirecting the browser window to redirect_uri with
// ?code=...&state=... — the GET callback in api/auth/whatsapp-embedded.js
// completes the signup server-side (session-gated, workspace from state).
//
// THE CRITICAL PARAMETER is config_id: it is what makes Facebook render the
// embedded signup WIZARD (business portfolio → WABA/phone → permissions)
// instead of a generic login. The 2026-09-27 "redirect shows a generic login"
// conclusion came from a dialog URL without config_id. Verified 2026-09-29:
// Meta accepts this exact URL and builds its own cancel_url pointing back at
// nyasadesk.com, so the redirect_uri is valid and whitelisted.
//
// state carries the workspace_id (base64 JSON, matching the GET callback's
// parser). redirect_uri must exactly match what that handler uses when
// exchanging the code: https://<req.headers.host>/api/auth/whatsapp-embedded
// — hence defaulting to window.location.origin here.
// ─────────────────────────────────────────────────────────────────────────────

export function buildFacebookDialogUrl({ app_id, config_id }, workspaceId, redirectUri) {
  const state = btoa(JSON.stringify({ workspace_id: workspaceId || '' }));
  const uri = redirectUri || (window.location.origin + '/api/auth/whatsapp-embedded');
  return 'https://www.facebook.com/v26.0/dialog/oauth'
    + '?client_id=' + encodeURIComponent(app_id)
    + '&config_id=' + encodeURIComponent(config_id)
    + '&redirect_uri=' + encodeURIComponent(uri)
    + '&response_type=code'
    + '&state=' + encodeURIComponent(state);
}
