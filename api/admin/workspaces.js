import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin, PLAN_LIMITS, PLAN_PRICING } from '../_lib/adminAuth.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform admin endpoint — serves THREE admin resources out of one file via
// ?resource=, instead of three separate serverless functions. This project
// is already at Vercel Hobby's 12-serverless-functions-per-deployment cap,
// so new admin features get routed through this file rather than adding
// more entries under api/**.
//   (default)          — GET workspace list, PATCH a workspace's plan
//   ?resource=overview — GET platform-wide aggregate stats
//   ?resource=admins   — GET/POST/DELETE the platform_admin_emails allowlist
export default async function handler(req, res) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const admin = await requirePlatformAdmin(req, sb);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

  const resource = req.query?.resource;
  if (resource === 'overview') return handleOverview(req, res, sb);
  if (resource === 'admins') return handleAdmins(req, res, sb, admin);
  return handleWorkspaces(req, res, sb, admin);
}

// ── Workspaces (default resource) ─────────────────────────────────────────
// "Workspace" = a root owner profile (workspace_id IS NULL); every other
// profile with workspace_id pointing at that owner's id is a teammate inside it.
async function handleWorkspaces(req, res, sb, admin) {
  if (req.method === 'GET') {
    try {
      const { data: owners, error } = await sb
        .from('profiles')
        .select('id, full_name, workspace_name, plan, sla_hours, updated_at')
        .is('workspace_id', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const workspaces = await Promise.all((owners || []).map(async (o) => {
        const [authUserRes, teamCountRes, convCountRes, msgCountRes] = await Promise.all([
          sb.auth.admin.getUserById(o.id).catch(() => ({ data: null })),
          sb.from('profiles').select('id', { count: 'exact', head: true }).or(`workspace_id.eq.${o.id},id.eq.${o.id}`),
          sb.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', o.id),
          sb.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', o.id),
        ]);
        const plan = o.plan || 'starter';
        const limit = PLAN_LIMITS[plan];
        return {
          id: o.id,
          full_name: o.full_name,
          workspace_name: o.workspace_name,
          email: authUserRes?.data?.user?.email || null,
          plan,
          seat_limit: limit === Infinity ? 'Unlimited' : limit,
          team_count: teamCountRes?.count || 0,
          conversation_count: convCountRes?.count || 0,
          message_count: msgCountRes?.count || 0,
          signed_up_at: authUserRes?.data?.user?.created_at || null,
        };
      }));

      return res.status(200).json({ workspaces, admin_email: admin.email });
    } catch (e) {
      console.error('[admin/workspaces] GET error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { workspace_id, plan } = req.body || {};
      if (!workspace_id || !Object.keys(PLAN_LIMITS).includes(plan)) {
        return res.status(400).json({ error: 'workspace_id and a valid plan are required' });
      }
      const { error } = await sb.from('profiles').update({ plan }).eq('id', workspace_id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/workspaces] PATCH error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Overview (?resource=overview) ─────────────────────────────────────────
// Aggregate stats for the Admin > Overview dashboard. Deliberately avoids
// per-owner auth.admin calls (unlike handleWorkspaces, which needs
// emails/signup dates per row) so it stays fast/cheap regardless of scale.
async function handleOverview(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

// ── Admins allowlist (?resource=admins) ───────────────────────────────────
// Manage platform_admin_emails, the table requirePlatformAdmin() checks
// against. An admin can never remove their own email — avoids accidentally
// locking every admin out at once.
async function handleAdmins(req, res, sb, admin) {
  if (req.method === 'GET') {
    try {
      const { data, error } = await sb
        .from('platform_admin_emails')
        .select('email, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ admins: data || [] });
    } catch (e) {
      console.error('[admin/admins] GET error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
      const { error } = await sb.from('platform_admin_emails').insert({ email });
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/admins] POST error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email is required' });
      if (email === admin.email.toLowerCase()) {
        return res.status(400).json({ error: "You can't remove your own admin access" });
      }
      const { error } = await sb.from('platform_admin_emails').delete().eq('email', email);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/admins] DELETE error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
