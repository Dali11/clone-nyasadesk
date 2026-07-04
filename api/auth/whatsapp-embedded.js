// api/auth/whatsapp-embedded.js
// Receives the code + session info from WhatsApp Embedded Signup (Meta's FB.login).
// Delegates to the WhatsApp provider via the provider abstraction layer.
// For Bird: creates workspace, installs connector, subscribes webhooks — all automated.

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

    // If a specific provider is requested, use it; otherwise use the default (Bird)
    const providerKey = providerHint ? `whatsapp:${providerHint}` : 'whatsapp';
    const provider = getProvider(providerKey);

    // Build auth data with all available fields
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
