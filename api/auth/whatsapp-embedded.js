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
//          subscribes our webhook to the WABA, and saves the channel config.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID        = process.env.FACEBOOK_APP_ID;
const APP_SECRET    = process.env.FACEBOOK_APP_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyasadesk1.vercel.app');
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
  if (!code)        return res.status(400).json({ error: 'Missing authorization code' });

  try {
    // 1. Exchange the code for a short-lived user access token. FB.login()'s
    // JS SDK code flow uses an empty redirect_uri (there's no real redirect —
    // the code arrives via postMessage back into the same page).
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    const shortToken = tokenData.access_token;

    // 2. Exchange for a long-lived token (~60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error(longData.error.message);
    const longToken = longData.access_token;

    // 3. Resolve the WABA. Prefer the postMessage hint the frontend captured
    // during signup (most reliable — comes straight from Meta's own event);
    // fall back to reading it off the token's granted granular scopes.
    let wabaId = hintedWabaId || null;
    if (!wabaId) {
      const appToken = `${APP_ID}|${APP_SECRET}`;
      const debugRes = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${longToken}&access_token=${appToken}`
      );
      const debugData = await debugRes.json();
      const granular = debugData.data?.granular_scopes || [];
      const wabaScope = granular.find(s => s.scope === 'whatsapp_business_management');
      wabaId = wabaScope?.target_ids?.[0] || null;
    }
    if (!wabaId) {
      throw new Error('No WhatsApp Business Account was granted during signup. Please try again and make sure to select a business number.');
    }

    // 4. Resolve the phone number — prefer the hinted one, else the first on the WABA.
    let phone = null;
    if (hintedPhoneId) {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v19.0/${hintedPhoneId}?fields=id,display_phone_number&access_token=${longToken}`
      );
      const phoneData = await phoneRes.json();
      if (!phoneData.error) phone = phoneData;
    }
    if (!phone) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${longToken}`
      );
      const phonesData = await phonesRes.json();
      phone = phonesData.data?.[0] || null;
    }
    if (!phone) {
      throw new Error('No phone number found on the connected WhatsApp Business Account.');
    }

    // 5. Subscribe our app to the WABA's webhooks — required or inbound
    // messages will never route to us even though the account is linked.
    await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps?access_token=${longToken}`, {
      method: 'POST',
    });

    const config = {
      waba_id:          wabaId,
      phone_number_id:  phone.id,
      phone_number:     phone.display_phone_number,
      access_token:     longToken,
      connected_via:    'embedded_signup',
      provider:         'cloud',
    };

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    await sb.from('channel_configs').upsert({
      workspace_id: workspaceId,
      channel:      'whatsapp',
      enabled:      true,
      config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    return res.status(200).json({ ok: true, config });
  } catch (e) {
    console.error('[wa-embedded]', e);
    return res.status(500).json({ error: e.message || 'Connection failed' });
  }
}
