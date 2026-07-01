// api/_lib/adminAuth.js — shared platform-admin auth check for /api/admin/*.
// Underscore-prefixed so Vercel never routes this file directly.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';

// Verifies the caller's Supabase session token, then checks their email
// against the platform_admin_emails allowlist using the (trusted,
// service-role) client passed in. Returns { email, userId } if authorized,
// or null otherwise — callers should 403 on null.
export async function requirePlatformAdmin(req, sbServiceRole) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data, error } = await sbAnon.auth.getUser(token);
  if (error || !data?.user?.email) return null;

  const { data: row } = await sbServiceRole
    .from('platform_admin_emails')
    .select('email')
    .eq('email', data.user.email)
    .maybeSingle();
  if (!row) return null;

  return { email: data.user.email, userId: data.user.id };
}

// Single source of truth for plan → seat limit, shared between the admin
// panel (display) and /api/team/invite (actual enforcement).
export const PLAN_LIMITS = { starter: 2, growth: 5, scale: Infinity };
