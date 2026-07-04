// api/auth/whatsapp-embedded.js
// Receives the access token from WhatsApp Embedded Signup (Meta's FB.login flow).
// Delegates to the WhatsApp provider via the provider abstraction layer.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyasadesk1.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  const { code, access_token, workspace_id } = req.body || {};
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });
  if (!code && !access_token) return res.status(400).json({ error: 'Missing code or access_token' });

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const provider = getProvider('whatsapp');

    // If we got a code, the provider will exchange it for a token.
    // If we got an access_token directly (from FB.login), pass it through.
    const authData = code
      ? { mode: 'embedded_signup', code, workspace_id }
      : { mode: 'embedded_signup', code: null, access_token, workspace_id };

    // If we have a direct access_token (not a code), we need a slightly different path
    if (access_token && !code) {
      // Skip the code exchange and go straight to WABA/phone discovery
      const APP_ID = process.env.FACEBOOK_APP_ID;
      const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

      // Get WABA details
      const debugRes = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${access_token}&access_token=${APP_ID}|${APP_SECRET}`
      );
      const debugData = await debugRes.json();

      // Try to find WABA ID from the token's granular scopes
      let wabaId = null;
      if (debugData?.data?.granular_scopes) {
        const waScope = debugData.data.granular_scopes.find(s => s.scope === 'whatsapp_business_management');
        wabaId = waScope?.target?.[0];
      }
      if (!wabaId) wabaId = debugData?.data?.profile_id;

      // Get phone numbers
      let phoneNumberId = null, phoneNumber = null, businessName = null;
      if (wabaId) {
        const phonesRes = await fetch(
          `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${access_token}`
        );
        const phonesData = await phonesRes.json();
        if (phonesData.data?.length) {
          const phone = phonesData.data[0];
          phoneNumberId = phone.id;
          phoneNumber = phone.display_phone_number;
          businessName = phone.verified_name;
        }
        // Register webhook subscription
        try {
          await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
            method: 'POST', headers: { Authorization: `Bearer ${access_token}` },
          });
        } catch (e) { /* non-fatal */ }
      }

      const verifyToken = `nyasa_wa_${workspace_id.slice(-8)}_${Date.now().toString(36)}`;
      const config = {
        access_token, phone_number_id: phoneNumberId, phone_number: phoneNumber,
        business_name: businessName, waba_id: wabaId, verify_token,
        connected_via: 'embedded_signup', connected_at: new Date().toISOString(),
      };

      const { data, error } = await sb.from('channel_configs').upsert({
        workspace_id, channel: 'whatsapp', enabled: true, config,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,channel' }).select('*').single();

      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, phone_number: phoneNumber, business_name: businessName });
    }

    // Standard code exchange path via the provider
    const result = await provider.connect(workspace_id, authData, { sb });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[wa-embedded]', e);
    return res.status(500).json({ error: e.message });
  }
}
