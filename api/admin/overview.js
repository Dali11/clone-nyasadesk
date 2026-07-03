import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin, PLAN_LIMITS, PLAN_PRICING } from '../_lib/adminAuth.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform admin endpoint — aggregate stats across every workspace, for the
// Admin > Overview dashboard. Deliberately avoids per-owner auth.admin calls
// (unlike /api/admin/workspaces, which needs emails/signup dates per row) so
// this stays fast and cheap even as the number of workspaces grows.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const admin = await requirePlatformAdmin(req, sb);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

  try {
    const [ownersRes, usersRes, convRes, msgRes] = await Promise.all([
      sb.from('profiles').select('id, workspace_name, plan, subscription_status, updated_at').is('workspace_id', null),
      sb.from('profiles').select('id', { count: 'exact', head: true }),
      sb.from('conversations').select('id', { count: 'exact', head: true }),
      sb.from('messages').select('id', { count: 'exact', head: true }),
    ]);
    if (ownersRes.error) throw ownersRes.error;
    if (usersRes.error) throw usersRes.error;
    if (convRes.error) throw convRes.error;
    if (msgRes.error) throw msgRes.error;

    const owners = ownersRes.data || [];
    const plan_breakdown = {};
    for (const key of Object.keys(PLAN_LIMITS)) plan_breakdown[key] = { count: 0, mrr: 0 };

    let mrr = 0;
    for (const o of owners) {
      const plan = plan_breakdown[o.plan] ? o.plan : 'starter';
      plan_breakdown[plan].count += 1;
      plan_breakdown[plan].mrr += PLAN_PRICING[plan] || 0;
      mrr += PLAN_PRICING[plan] || 0;
    }

    const recent_workspaces = [...owners]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, 5);

    return res.status(200).json({
      totals: {
        workspaces: owners.length,
        users: usersRes.count || 0,
        conversations: convRes.count || 0,
        messages: msgRes.count || 0,
        mrr,
      },
      plan_breakdown,
      recent_workspaces,
    });
  } catch (e) {
    console.error('[admin/overview] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
