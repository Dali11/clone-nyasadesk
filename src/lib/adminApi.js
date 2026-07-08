// src/lib/adminApi.js — shared, resilient fetch helper for every /admin/* page.
//
// Bug this fixes: every admin page independently called
// `supabase.auth.getSession()` and used whatever access_token came back, with
// no fallback. On a mobile PWA that's been backgrounded for a while, the
// cached token can be expired before the SDK's background auto-refresh timer
// gets a chance to fire (timers don't run while backgrounded) -- so the very
// first admin API call goes out with a dead token, the server correctly 403s
// it, and the page shows "Admin access required" even though the user IS a
// platform admin. It looks exactly like a permissions problem but is really
// a stale-token problem, and self-resolves on a manual reload -- which is
// confusing enough that a real user reported it as "admin access broken".
//
// Fix: on any 403, force `supabase.auth.refreshSession()` and retry the
// request ONCE with the fresh token before surfacing an error. A genuine
// non-admin still correctly gets denied (refreshing the session doesn't
// change their email/allowlist status), so this doesn't weaken the real
// server-side check at all -- it just stops token staleness from being
// misreported as an access problem.
import { supabase } from '@/lib/supabase';

async function getAccessToken(forceRefresh) {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data?.session?.access_token || null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function doFetch(path, opts, token) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

// Use for every call to /api/admin/*. Returns the raw fetch Response --
// callers keep their existing `res.json()` / `res.ok` handling.
export async function adminFetch(path, opts = {}) {
  let token = await getAccessToken(false);
  let res = await doFetch(path, opts, token);
  if (res.status === 403) {
    const freshToken = await getAccessToken(true);
    if (freshToken && freshToken !== token) {
      res = await doFetch(path, opts, freshToken);
    }
  }
  return res;
}
