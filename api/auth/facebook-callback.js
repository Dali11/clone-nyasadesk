// api/auth/facebook-callback.js
// Handles the OAuth code→token exchange for Facebook (Messenger) login.
// After user approves, Facebook redirects to:
//   https://nyasadesk1.vercel.app/api/auth/facebook-callback?code=...&state=...

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID        = process.env.FACEBOOK_APP_ID;
const APP_SECRET    = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI  = 'https://nyasadesk1.vercel.app/api/auth/facebook-callback';
const PROD_URL      = 'https://nyasadesk1.vercel.app';

export default async function handler(req, res) {
  const { code, state, error: fbError } = req.query;

  if (fbError) {
    return res.redirect(`${PROD_URL}/settings?tab=channels&error=fb_denied`);
  }
  if (!code || !state) {
    return res.redirect(`${PROD_URL}/settings?tab=channels&error=fb_invalid`);
  }

  try {
    // 1. Exchange code for user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    const userToken = tokenData.access_token;

    // 2. Get the list of pages the user manages + their page tokens
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    // 3. Get user info
    const meRes  = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${userToken}`);
    const meData = await meRes.json();

    // 4. Save to Supabase — store pages list against workspace_id from state
    const workspaceId = state;
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    const pages = (pagesData.data || []).map(p => ({
      page_id:      p.id,
      page_name:    p.name,
      page_token:   p.access_token,
    }));

    // If only one page, auto-configure Messenger
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

    // Redirect back to settings with success + pages list as query params
    const pagesParam = encodeURIComponent(JSON.stringify(pages));
    return res.redirect(
      `${PROD_URL}/settings?tab=channels&fb_connected=1&pages=${pagesParam}&workspace=${workspaceId}`
    );
  } catch (e) {
    console.error('[fb-callback]', e);
    return res.redirect(`${PROD_URL}/settings?tab=channels&error=fb_failed&msg=${encodeURIComponent(e.message)}`);
  }
}
