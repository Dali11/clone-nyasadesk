// api/auth/whatsapp-embedded.js
// Receives the token from WhatsApp Embedded Signup (Meta's official flow).
// Called from the frontend after the user completes embedded signup.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_SECRET   = process.env.FACEBOOK_APP_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyasadesk1.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  const { code, workspace_id } = req.body || {};
  if (!code || !workspace_id)   return res.status(400).json({ error: 'Missing code or workspace_id' });

  try {
    const APP_ID = process.env.FACEBOOK_APP_ID;
    // Exchange code for token via Graph API
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    const accessToken = tokenData.access_token;

    // Get the WABA and phone number details
    const wabaRes  = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${accessToken}&access_token=${APP_ID}|${APP_SECRET}`
    );
    const wabaData = await wabaRes.json();

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    await sb.from('channel_configs').upsert({
      workspace_id,
      channel:  'whatsapp',
      enabled:  true,
      config: {
        access_token:    accessToken,
        connected_via:  'embedded_signup',
        waba_data:       wabaData?.data || {},
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,channel' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[wa-embedded]', e);
    return res.status(500).json({ error: e.message });
  }
}
