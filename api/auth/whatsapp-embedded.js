// api/auth/whatsapp-embedded.js
// WhatsApp Embedded Signup callback handler.
//
// Two modes:
//   GET  — OAuth redirect callback from Facebook.  Facebook redirects here
//          with ?code=...&state=WORKSPACE_ID after the user completes the
//          Embedded Signup flow.  We exchange the code via WasapFlow, persist
//          the channel config, then redirect back to /settings?tab=channels.
//   POST — Programmatic API used by the frontend (legacy / advanced paths).

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = 'https://nyasadesk1.vercel.app';

export default async function handler(req, res) {
  // ── GET: OAuth redirect callback from Facebook ───────────────────────
  if (req.method === 'GET') {
    const { code, state, error, error_reason } = req.query;
    const workspaceId = state;

    // User cancelled or Facebook returned an error
    if (error) {
      const msg = encodeURIComponent(error_reason || error || 'Facebook authorization failed');
      return res.redirect(302, `${PROD_URL}/settings?tab=channels&wa_error=${msg}`);
    }
    if (!code || !workspaceId) {
      return res.redirect(302, `${PROD_URL}/settings?tab=channels&wa_error=${encodeURIComponent('Missing authorization code')}`);
    }

    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const provider = getProvider('whatsapp:wasapflow');
      const result = await provider.connect(workspaceId, {
        mode: 'embedded_signup',
        code,
        workspace_id: workspaceId,
      }, { sb });

      return res.redirect(302, `${PROD_URL}/settings?tab=channels&wa=connected`);
    } catch (e) {
      console.error('[wa-embedded/callback]', e);
      const msg = encodeURIComponent(e.message || 'Connection failed');
      return res.redirect(302, `${PROD_URL}/settings?tab=channels&wa_error=${msg}`);
    }
  }

  // ── POST: programmatic API (legacy / advanced) ───────────────────────
  res.setHeader('Access-Control-Allow-Origin', PROD_URL);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  const { code, access_token, workspace_id, phone_number_id, waba_id, provider: providerHint, _action } = req.body || {};

  // Frontend calls this to get the Embedded Signup config (config_id, solution_id)
  if (_action === 'get_config') {
    return res.status(200).json({
      config_id: process.env.META_CONFIG_ID || null,
      solution_id: process.env.BIRD_SOLUTION_ID || null,
      app_id: process.env.FACEBOOK_APP_ID || null,
    });
  }

  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });
  if (!code && !access_token) return res.status(400).json({ error: 'Missing code or access_token' });

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const providerKey = providerHint ? `whatsapp:${providerHint}` : 'whatsapp:wasapflow';
    const provider = getProvider(providerKey);

    const authData = {
      mode: 'embedded_signup',
      code: code || null,
      access_token: access_token || null,
      phone_number_id: phone_number_id || null,
      waba_id: waba_id || null,
      workspace_id,
    };

    const result = await provider.connect(workspace_id, authData, { sb });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[wa-embedded]', e);
    return res.status(500).json({ error: e.message });
  }
}
