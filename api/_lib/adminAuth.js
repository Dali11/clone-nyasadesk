// api/_lib/adminAuth.js — shared platform-admin auth check for /api/admin/*.
// Underscore-prefixed so Vercel never routes this file directly.
import { createClient } from './dbFactory.js';

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

// Hardcoded fallback only -- the real, admin-editable source of truth is the
// `plan_pricing` DB table (see getPlanPricing below). These constants exist
// purely so pricing/checkout never hard-fails if that table is ever empty
// or briefly unreachable.
export const PLAN_PRICING_MWK = { starter: 15000, growth: 30000, scale: 120000 };
export const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };
// Legacy alias kept for any older imports that haven't been updated yet.
export const PLAN_PRICING = PLAN_PRICING_MWK;

// Live pricing, editable by platform admins via /api/admin/workspaces?resource=pricing
// (see AdminPricing.jsx). Read by billing.js (marketing page + checkout amount)
// and admin/workspaces.js (MRR calc) so a price change takes effect everywhere
// immediately, with zero deploys. Falls back to the hardcoded constants above
// if the table is empty or the query fails for any reason.
export async function getPlanPricing(sbServiceRole) {
  try {
    const { data, error } = await sbServiceRole.from('plan_pricing').select('plan, label, price_mwk');
    if (error || !data || data.length === 0) throw error || new Error('empty plan_pricing table');
    const pricing = { ...PLAN_PRICING_MWK };
    const labels = { ...PLAN_LABEL };
    for (const row of data) { pricing[row.plan] = row.price_mwk; labels[row.plan] = row.label; }
    return { pricing, labels };
  } catch (e) {
    console.error('[getPlanPricing] falling back to hardcoded defaults:', e?.message || e);
    return { pricing: PLAN_PRICING_MWK, labels: PLAN_LABEL };
  }
}
