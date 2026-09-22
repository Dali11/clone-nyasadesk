// dbFactory.js — env-switched client factory.
// DATA_BACKEND=neon (with NEON_CONNECTION_STRING) returns the Neon Postgres adapter
// with the same call surface as supabase-js, so api code is unchanged either way.
import { createClient as supabaseCreateClient } from '@supabase/supabase-js';
import { createPgClient } from './pgCompat.js';

export function createClient(url, key, opts) {
  if (process.env.DATA_BACKEND === 'neon' && process.env.NEON_CONNECTION_STRING) {
    return createPgClient();
  }
  return supabaseCreateClient(url, key, opts);
}
