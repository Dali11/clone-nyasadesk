// api/auth/facebook-callback.js
// Handles the OAuth code→token exchange for both Facebook Messenger AND
// WhatsApp Embedded Signup (both use this same redirect_uri to keep the
// Meta app's "Valid OAuth Redirect URIs" list to one entry).
// After user approves, Facebook redirects to:
//   https://nyasadesk1.vercel.app/api/auth/facebook-callback?code=...&state=...
//
// `state` is a base64-encoded JSON blob: { workspace_id, provider }
// where provider is 'messenger' or 'whatsapp'. Old links that sent a bare
// workspace_id as state still work (treated as 'messenger').

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID        = process.env.FACEBOOK_APP_ID;
const APP_SECRET    = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI  = 'https://nyasadesk1.vercel.app/api/auth/facebook-callback';
const PROD_URL      = 'https://nyasadesk1.vercel.app';

function decodeState(raw) {
  try {
    const json = Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && parsed.workspace_id) return parsed;
  } catch (e) { /* fall through */ }
  // Backward-compat: old Messenger links sent a bare workspace_id as state
  return { workspace_id: raw, provider: 'messenger' };
}

export default async function handler(req, res) {
  const { code, state: rawState, error: fbError } = req.query;

  if (fbError) {
    return res.redirect(`${PROD_URL}/settings?tab=channels&error=fb_denied`);
  }
  if (!code || !rawState) {
    return res.redirect(`${PROD_URL}/settings?tab=channels&error=fb_invalid`);
  }

  const { workspace_id: workspaceId, provider } = decodeState(rawState);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // 1. Exchange code for a short-lived user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    const shortToken = tokenData.access_token;

    if (provider === 'whatsapp') {
      // 2a. Exchange for a long-lived token (~60 days)
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
      );
      const longData = await longRes.json();
      if (longData.error) throw new Error(longData.error.message);
      const longToken = longData.access_token;

      // 2b. Find the WhatsApp Business Account granted during Embedded Signup.
      // The postMessage event Meta's JS SDK normally sends isn't available on
      // a plain redirect flow, so we read the granted asset back from the
      // token's granular scopes instead — this is Meta's documented fallback.
      const appToken = `${APP_ID}|${APP_SECRET}`;
      const debugRes = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${longToken}&access_token=${appToken}`
      );
      const debugData = await debugRes.json();
      const granular = debugData.data?.granular_scopes || [];
      const wabaScope = granular.find(s => s.scope === 'whatsapp_business_management');
      const wabaId = wabaScope?.target_ids?.[0];
      if (!wabaId) {
        throw new Error('No WhatsApp Business Account was granted during signup. Please try again and make sure to select a business number.');
      }

      // 2c. Get the phone number added to that WABA
      const phonesRes = await fetch(
        `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${longToken}`
      );
      const phonesData = await phonesRes.json();
      const phone = phonesData.data?.[0];
      if (!phone) {
        throw new Error('No phone number found on the connected WhatsApp Business Account.');
      }

      // 2d. Subscribe our app to the WABA's webhooks — required or inbound
      // messages will never route to us even though the account is linked.
      await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps?access_token=${longToken}`, {
        method: 'POST',
      });

      await sb.from('channel_configs').upsert({
        workspace_id: workspaceId,
        channel:      'whatsapp',
        enabled:      true,
        config: {
          waba_id:          wabaId,
          phone_number_id:  phone.id,
          phone_number:     phone.display_phone_number,
          access_token:     longToken,
          connected_via:    'embedded_signup_redirect',
          provider:         'cloud',
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,channel' });

      return res.redirect(`${PROD_URL}/settings?tab=channels&wa=connected`);
    }

    // ── Messenger (existing behavior, unchanged) ───────────────────────
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${shortToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    const meRes  = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${shortToken}`);
    const meData = await meRes.json();

    const pages = (pagesData.data || []).map(p => ({
      page_id:      p.id,
      page_name:    p.name,
      page_token:   p.access_token,
    }));

    const firstPage = pages[0];
    if (firstPage) {
      await sb.from('channel_configs').upsert({
        workspace_id: workspaceId,
        channel:      'messenger',
        enabled:      true,
        config: {
          page_id:      firstPage.page_id,
          page_name:    firstPage.page_name,
          page_token:   firstPage.page_token,
          connected_via: 'oauth',
          fb_user_name:  meData.name,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,channel' });
    }

    const pagesParam = encodeURIComponent(JSON.stringify(pages));
    return res.redirect(
      `${PROD_URL}/settings?tab=channels&fb_connected=1&pages=${pagesParam}&workspace=${workspaceId}`
    );
  } catch (e) {
    console.error('[fb-callback]', e);
    const isWhatsapp = provider === 'whatsapp';
    return res.redirect(
      isWhatsapp
        ? `${PROD_URL}/settings?tab=channels&wa_error=${encodeURIComponent(e.message)}`
        : `${PROD_URL}/settings?tab=channels&error=fb_failed&msg=${encodeURIComponent(e.message)}`
    );
  }
}
