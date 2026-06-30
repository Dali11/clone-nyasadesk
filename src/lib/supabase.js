import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  if (_client) return _client;

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    console.warn('[Nyasadesk] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set.');
    return null;
  }

  _client = createClient(supabaseUrl, supabaseAnon);
  return _client;
}

// Proxy so existing `supabase.auth.*` / `supabase.from(...)` calls still work,
// but the client is only created on first actual use (not at import time).
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getClient();
    if (!client) return undefined;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});