// api/auth/whatsapp-embedded.js
// WhatsApp Embedded Signup callback handler.
//
//   POST — Called by the frontend after FB.login() (JS SDK popup) succeeds.
//          Meta's Embedded Signup wizard (WABA/phone-number picker) is
//          rendered by the JS SDK itself, so this MUST use FB.login(),
//          not a plain OAuth redirect (a redirect only shows the generic
//          login screen — confirmed directly against Meta's docs).
//          Exchanges the auth code for a long-lived token via the Graph
//          API directly, resolves the granted WABA (from the postMessage
//          hint the frontend captured, falling back to the token's
//          granted scopes if that's missing), fetches the phone number,
//          runs autoSetup (registers if needed, subscribes webhooks,
//          fetches messaging limits), and saves the channel config.

import { createClient } from '../_lib/dbFactory.js';

// ── Session + workspace gate (2026-09-26 security audit) ─────────────────────
// This endpoint attaches a WhatsApp Business Account (from Meta's embedded
// signup code exchange) to a workspace. It previously trusted the client's
// workspace_id with no session — an attacker could attach their own WABA to
// any workspace UUID. Now requires a Better Auth session whose workspace
// matches (platform admins excepted).
import { auth } from '../_lib/betterAuth.js';

async function enforceCallerWorkspace(req, workspaceId) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const sb0 = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: profile } = await sb0.from('profiles').select('id, workspace_id').eq('id', session.user.id).maybeSingle();
  const W = profile?.workspace_id || session.user.id;
  const { data: pa } = await sb0.from('platform_admin_emails').select('email').eq('email', session.user.email || '').maybeSingle();
  if (pa) return { uid: session.user.id, W };
  if (workspaceId !== W) throw Object.assign(new Error('Not your workspace'), { status: 403 });
  return { uid: session.user.id, W };
}
import { autoSetup, subscribeWebhooks } from '../_lib/whatsappSetup.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID        = process.env.FACEBOOK_APP_ID;
const APP_SECRET    = process.env.FACEBOOK_APP_SECRET;

// Accept requests from either the canonical custom domain or the underlying
// Vercel domain (both serve the exact same deployment) instead of hardcoding
// one — avoids this silently breaking again the next time a domain changes.
const ALLOWED_ORIGINS = ['https://nyasadesk.com', 'https://nyasadesk1.vercel.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || (origin && /\.vercel\.app$/.test(origin));
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  const { code, workspace_id: workspaceId, phone_number_id: hintedPhoneId, waba_id: hintedWabaId, _action } = req.body || {};

  // Frontend calls this (with _action set, no code) to fetch the Embedded
  // Signup config_id used to build the FB.login() call.
  if (_action === 'get_config') {
    return res.status(200).json({
      config_id: process.env.META_CONFIG_ID || null,
      app_id: process.env.FACEBOOK_APP_ID || null,
    });
  }

  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace_id' });
  try { await enforceCallerWorkspace(req, workspaceId); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  if (!code)        return res.status(400).json({ error: 'Missing authorization code' });

  // ── Step 1: Exchange the code for a short-lived user access token ──────
  // FB.login()'s JS SDK code flow uses an empty redirect_uri (there's no
  // real redirect — the code arrives via postMessage back into the same page).
  let shortToken;
  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v26.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    shortToken = tokenData.access_token;
  } catch (e) {
    console.error('[wa-embedded] token exchange failed:', e);
    return res.status(400).json({ error: `Failed to exchange authorization code: ${e.message || 'Unknown error'}` });
  }

  // ── Step 2: Exchange for a long-lived token (~60 days) ─────────────────
  let longToken;
  try {
    const longRes = await fetch(
      `https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error(longData.error.message);
    longToken = longData.access_token;
  } catch (e) {
    console.error('[wa-embedded] long-lived token exchange failed:', e);
    return res.status(400).json({ error: `Failed to obtain a long-lived access token: ${e.message || 'Unknown error'}` });
  }

  // ── Step 3: Resolve the WABA ───────────────────────────────────────────
  // Prefer the postMessage hint the frontend captured during signup (most
  // reliable — comes straight from Meta's own event); fall back to reading
  // it off the token's granted granular scopes.
  let wabaId = hintedWabaId || null;
  if (!wabaId) {
    try {
      const appToken = `${APP_ID}|${APP_SECRET}`;
      const debugRes = await fetch(
        `https://graph.facebook.com/v26.0/debug_token?input_token=${longToken}&access_token=${appToken}`
      );
      const debugData = await debugRes.json();
      const granular = debugData.data?.granular_scopes || [];
      const wabaScope = granular.find((s) => s.scope === 'whatsapp_business_management');
      wabaId = wabaScope?.target_ids?.[0] || null;
    } catch (e) {
      console.error('[wa-embedded] WABA resolution failed:', e);
      return res.status(400).json({ error: `Could not resolve the WhatsApp Business Account from the token: ${e.message || 'Unknown error'}` });
    }
  }
  if (!wabaId) {
    return res.status(400).json({
      error: 'No WhatsApp Business Account was granted during signup. Please try again and make sure to select a business number.',
    });
  }

  // ── Step 4: Resolve the phone number ───────────────────────────────────
  // Prefer the hinted one, else the first on the WABA.
  let phone = null;
  try {
    if (hintedPhoneId) {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v26.0/${hintedPhoneId}?fields=id,display_phone_number,verified_name,quality_rating,name_status,account_mode&access_token=${longToken}`
      );
      const phoneData = await phoneRes.json();
      if (!phoneData.error) phone = phoneData;
    }
    if (!phone) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/v26.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status,account_mode&access_token=${longToken}`
      );
      const phonesData = await phonesRes.json();
      phone = phonesData.data?.[0] || null;
    }
  } catch (e) {
    console.error('[wa-embedded] phone resolution failed:', e);
    return res.status(400).json({ error: `Could not resolve a phone number: ${e.message || 'Unknown error'}` });
  }
  if (!phone) {
    return res.status(400).json({
      error: 'No phone number found on the connected WhatsApp Business Account.',
    });
  }

  // ── Step 5: Run autoSetup ──────────────────────────────────────────────
  // Registers the phone if needed (auto-generating a PIN), subscribes
  // webhooks, and fetches messaging limits. Non-critical steps (limits)
  // are caught internally and returned as null.
  let setupResult;
  try {
    setupResult = await autoSetup(longToken, wabaId, phone.id);
  } catch (e) {
    console.error('[wa-embedded] autoSetup failed:', e);
    return res.status(500).json({ error: `Setup failed: ${e.message || 'Unknown error'}` });
  }

  const richPhone = setupResult.phone || phone;

  // ── Step 6: Build the config object with all rich fields ───────────────
  // Derive the same verify_token that subscribeWebhooks() sent to Meta
  // (nyasa_ + last 8 chars of wabaId) and store it so the webhook handler
  // can match Meta's GET verification ping instead of relying on the regex fallback.
  const verifyToken = `nyasa_${wabaId.slice(-8)}`;

  const config = {
    waba_id:          wabaId,
    phone_number_id:  phone.id,
    verify_token:     verifyToken,
    phone_number:     richPhone.display_phone_number || phone.display_phone_number,
    verified_name:    richPhone.verified_name || phone.verified_name || null,
    quality_rating:   richPhone.quality_rating || phone.quality_rating || null,
    name_status:      richPhone.name_status || phone.name_status || null,
    account_mode:     richPhone.account_mode || phone.account_mode || null,
    access_token:     longToken,
    connected_via:    'embedded_signup',
    provider:         'cloud',
    auto_registered:  setupResult.auto_registered,
    // Meta reports COEXISTENCE when the user completed the in-dialog QR
    // handshake to keep the number live on the WhatsApp Business App.
    // providers/whatsapp.js echo detection keys off this flag.
    coexistence_mode: (richPhone.account_mode || phone.account_mode) === 'COEXISTENCE',
    setup_pin:        setupResult.auto_pin || null,
    connected_at:     new Date().toISOString(),
  };

  // ── Step 7: Upsert to channel_configs ──────────────────────────────────
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error: upsertError } = await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel:      'whatsapp',
      enabled:      true,
      config,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    if (upsertError) throw new Error(upsertError.message);
  } catch (e) {
    console.error('[wa-embedded] channel_configs upsert failed:', e);
    return res.status(500).json({ error: `Connected successfully but failed to save config: ${e.message || 'Unknown error'}` });
  }

  // ── Step 8: Return success with config + auto-registration details ─────
  return res.status(200).json({
    ok: true,
    config,
    auto_registered: setupResult.auto_registered,
    setup_pin: setupResult.auto_pin,
  });
}
