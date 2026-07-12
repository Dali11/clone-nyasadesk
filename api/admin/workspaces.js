import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin, PLAN_LIMITS, PLAN_PRICING_MWK, PLAN_LABEL, getPlanPricing } from '../_lib/adminAuth.js';

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
//   ?resource=pricing  — GET/PATCH the plan_pricing table (monthly price per plan)
export default async function handler(req, res) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const admin = await requirePlatformAdmin(req, sb);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

  const resource = req.query?.resource;
  if (resource === 'overview') return handleOverview(req, res, sb);
  if (resource === 'admins') return handleAdmins(req, res, sb, admin);
  if (resource === 'transactions') return handleTransactions(req, res, sb);
  if (resource === 'pricing') return handlePricing(req, res, sb);
  if (resource === 'churn') return handleChurn(req, res, sb);
  if (resource === 'ai-usage') return handleAiUsage(req, res, sb);
  if (resource === 'audit-log') return handleAuditLog(req, res, sb);
  if (resource === 'workspace-detail') return handleWorkspaceDetail(req, res, sb);
  if (resource === 'users') return handleUsers(req, res, sb, admin);
  return handleWorkspaces(req, res, sb, admin);
}

// Best-effort audit trail for admin mutations -- every suspend/reactivate,
// plan change, and admin-allowlist edit gets logged here. Never blocks or
// fails the actual action if logging itself has a hiccup.
async function logAudit(sb, admin, action, targetWorkspaceId, details) {
  try {
    await sb.from('admin_audit_log').insert({
      admin_email: admin?.email || 'unknown',
      action,
      target_workspace_id: targetWorkspaceId || null,
      details: details || {},
    });
  } catch (e) {
    console.error('[admin_audit_log] failed to write entry (non-fatal):', e?.message || e);
  }
}

// ── Workspaces (default resource) ─────────────────────────────────────────
// "Workspace" = a root owner profile (workspace_id IS NULL); every other
// profile with workspace_id pointing at that owner's id is a teammate inside it.
async function handleWorkspaces(req, res, sb, admin) {
  if (req.method === 'GET') {
    try {
      const livePricing = await getPlanPricing(sb);
      const { data: owners, error } = await sb
        .from('profiles')
        .select('id, full_name, workspace_name, plan, sla_hours, subscription_status, trial_ends_at, current_period_end, updated_at')
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
          plan_label: livePricing.labels[plan] || plan,
          plan_price_mwk: livePricing.pricing[plan] ?? null,
          seat_limit: limit === Infinity ? 'Unlimited' : limit,
          subscription_status: o.subscription_status || 'trialing',
          trial_ends_at: o.trial_ends_at,
          current_period_end: o.current_period_end,
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
      const { workspace_id, plan, subscription_status, trial_ends_at, extend_trial_days } = req.body || {};
      if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

      const updates = {};
      if (plan !== undefined) {
        if (!Object.keys(PLAN_LIMITS).includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
        updates.plan = plan;
      }
      if (subscription_status !== undefined) {
        // 'suspended' is a real hard block (see App.jsx SuspendedGate) --
        // distinct from 'canceled' (which just means no active paid plan,
        // but the workspace can still log in and see a "resubscribe" state).
        if (!['trialing', 'active', 'past_due', 'canceled', 'suspended'].includes(subscription_status)) {
          return res.status(400).json({ error: 'Invalid subscription_status' });
        }
        updates.subscription_status = subscription_status;
      }
      if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at;
      if (extend_trial_days) {
        const { data: cur } = await sb.from('profiles').select('trial_ends_at').eq('id', workspace_id).maybeSingle();
        const base = cur?.trial_ends_at && new Date(cur.trial_ends_at) > new Date() ? new Date(cur.trial_ends_at) : new Date();
        base.setDate(base.getDate() + Number(extend_trial_days));
        updates.trial_ends_at = base.toISOString();
        updates.subscription_status = 'trialing';
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

      const { error } = await sb.from('profiles').update(updates).eq('id', workspace_id);
      if (error) throw error;
      await logAudit(sb, admin, 'workspace_update', workspace_id, { updates, extend_trial_days: extend_trial_days || undefined });
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
    const [ownersRes, usersRes, convRes, msgRes, livePricing] = await Promise.all([
      sb.from('profiles').select('id, workspace_name, plan, subscription_status, trial_ends_at, current_period_end, updated_at').is('workspace_id', null),
      sb.from('profiles').select('id', { count: 'exact', head: true }),
      sb.from('conversations').select('id', { count: 'exact', head: true }),
      sb.from('messages').select('id', { count: 'exact', head: true }),
      getPlanPricing(sb),
    ]);
    if (ownersRes.error) throw ownersRes.error;
    if (usersRes.error) throw usersRes.error;
    if (convRes.error) throw convRes.error;
    if (msgRes.error) throw msgRes.error;

    const owners = ownersRes.data || [];
    const plan_breakdown = {};
    for (const key of Object.keys(PLAN_LIMITS)) plan_breakdown[key] = { count: 0, mrr: 0 };

    // Split revenue: locked = paid workspaces (active + past_due, already
    // converted and committed). Pipeline = trialing workspaces (potential
    // revenue if they convert, NOT yet real MRR). past_due is treated as
    // locked because they already converted — it's a collections issue, not
    // a pre-conversion pipeline issue.
    let mrr_locked = 0;
    let mrr_pipeline = 0;
    let trial_count = 0;
    let active_count = 0;

    for (const o of owners) {
      const plan = plan_breakdown[o.plan] ? o.plan : 'starter';
      const price = livePricing.pricing[plan] || 0;
      plan_breakdown[plan].count += 1;
      plan_breakdown[plan].mrr += price;

      const status = o.subscription_status || 'trialing';
      if (status === 'active' || status === 'past_due') {
        mrr_locked += price;
        active_count += 1;
      } else if (status === 'trialing') {
        mrr_pipeline += price;
        trial_count += 1;
      }
      // canceled/suspended: excluded from both (no revenue)
    }

    const conversion_rate = (trial_count + active_count) > 0
      ? Math.round((active_count / (trial_count + active_count)) * 100)
      : 0;

    const recent_workspaces = [...owners]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, 5);

    return res.status(200).json({
      totals: {
        workspaces: owners.length,
        users: usersRes.count || 0,
        conversations: convRes.count || 0,
        messages: msgRes.count || 0,
        mrr: mrr_locked + mrr_pipeline,   // legacy field — kept for back-compat
        mrr_locked,
        mrr_pipeline,
        trial_count,
        active_count,
        conversion_rate,
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
      await logAudit(sb, admin, 'admin_added', null, { email });
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
      await logAudit(sb, admin, 'admin_removed', null, { email });
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/admins] DELETE error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}


// ── Transactions (?resource=transactions) ─────────────────────────────────
// Platform-wide payment history for the admin console.
async function handleTransactions(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: txns, error } = await sb
      .from('transactions')
      .select('id, workspace_id, tx_ref, plan, amount, currency, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    // Attach workspace names for display
    const workspaceIds = [...new Set((txns || []).map(t => t.workspace_id))];
    let names = {};
    if (workspaceIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, workspace_name, full_name').in('id', workspaceIds);
      names = Object.fromEntries((profs || []).map(p => [p.id, p.workspace_name || p.full_name || 'Unknown']));
    }

    return res.status(200).json({
      transactions: (txns || []).map(t => ({
        ...t,
        workspace_name: names[t.workspace_id] || 'Unknown',
        plan_label: PLAN_LABEL[t.plan] || t.plan,
      })),
    });
  } catch (e) {
    console.error('[admin/transactions] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
// ── Pricing (?resource=pricing) ───────────────────────────────────────────
// Admin-editable plan pricing, backed by the plan_pricing table. This is the
// live source of truth read by billing.js (marketing page + checkout amount
// charged) and this file's own MRR calc -- a price change here takes effect
// everywhere immediately, no deploy needed.
async function handlePricing(req, res, sb) {
  if (req.method === 'GET') {
    try {
      const { data, error } = await sb.from('plan_pricing').select('plan, label, price_mwk, updated_at').order('price_mwk', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ plans: data || [] });
    } catch (e) {
      console.error('[admin/pricing] GET error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { plan, price_mwk } = req.body || {};
      if (!plan || !Object.keys(PLAN_LIMITS).includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
      const price = Number(price_mwk);
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) {
        return res.status(400).json({ error: 'price_mwk must be a whole number >= 0' });
      }
      const { error } = await sb.from('plan_pricing').update({ price_mwk: price, updated_at: new Date().toISOString() }).eq('plan', plan);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/pricing] PATCH error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Churn / at-risk (?resource=churn) ─────────────────────────────────────
// Flags workspaces likely to churn: trial ending within 3 days (or already
// expired without upgrading), past_due billing, or an active/paid workspace
// gone quiet (no conversation activity in 14+ days). Not a hard rule engine
// -- just surfaces the list with a reason so an admin can proactively reach
// out, sorted most-urgent first.
async function handleChurn(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: owners, error } = await sb
      .from('profiles')
      .select('id, workspace_name, full_name, plan, subscription_status, trial_ends_at, updated_at')
      .is('workspace_id', null);
    if (error) throw error;

    const now = new Date();
    const at_risk = [];
    for (const o of owners || []) {
      let reason = null, urgency = 0;
      if (o.subscription_status === 'past_due') { reason = 'Payment past due'; urgency = 3; }
      else if (o.subscription_status === 'trialing' && o.trial_ends_at) {
        const daysLeft = Math.ceil((new Date(o.trial_ends_at) - now) / 86400000);
        if (daysLeft <= 0) { reason = 'Trial expired, not upgraded'; urgency = 3; }
        else if (daysLeft <= 3) { reason = `Trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`; urgency = 2; }
      }
      if (!reason && o.subscription_status === 'active') {
        const { data: lastConv } = await sb.from('conversations')
          .select('last_message_at').eq('workspace_id', o.id)
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
        const lastActivity = lastConv?.last_message_at ? new Date(lastConv.last_message_at) : null;
        const idleDays = lastActivity ? Math.floor((now - lastActivity) / 86400000) : null;
        if (idleDays !== null && idleDays >= 14) { reason = `No activity in ${idleDays} days`; urgency = 1; }
      }
      if (reason) at_risk.push({ id: o.id, workspace_name: o.workspace_name || o.full_name || 'Untitled', plan: o.plan, subscription_status: o.subscription_status, reason, urgency });
    }
    at_risk.sort((a, b) => b.urgency - a.urgency);
    return res.status(200).json({ at_risk });
  } catch (e) {
    console.error('[admin/churn] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}

// ── AI usage cost dashboard (?resource=ai-usage) ──────────────────────────
// Aggregates ai_usage_logs per workspace over the last 30 days -- the actual
// OpenAI $ cost being incurred per workspace, so admins can see if any one
// workspace's AI usage is disproportionate to what they're paying (Scale
// plan is flat-rate, so this is a cost-monitoring tool, not billing itself).
async function handleAiUsage(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: logs, error } = await sb.from('ai_usage_logs')
      .select('workspace_id, total_tokens, estimated_cost_usd, created_at')
      .gte('created_at', since);
    if (error) throw error;

    const byWorkspace = {};
    let totalCost = 0, totalCalls = 0;
    for (const l of logs || []) {
      if (!byWorkspace[l.workspace_id]) byWorkspace[l.workspace_id] = { cost: 0, tokens: 0, calls: 0 };
      byWorkspace[l.workspace_id].cost += l.estimated_cost_usd || 0;
      byWorkspace[l.workspace_id].tokens += l.total_tokens || 0;
      byWorkspace[l.workspace_id].calls += 1;
      totalCost += l.estimated_cost_usd || 0;
      totalCalls += 1;
    }

    const workspaceIds = Object.keys(byWorkspace);
    let names = {};
    if (workspaceIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, workspace_name, full_name').in('id', workspaceIds);
      names = Object.fromEntries((profs || []).map(p => [p.id, p.workspace_name || p.full_name || 'Unknown']));
    }

    const usage = Object.entries(byWorkspace)
      .map(([workspace_id, v]) => ({ workspace_id, workspace_name: names[workspace_id] || 'Unknown', ...v }))
      .sort((a, b) => b.cost - a.cost);

    return res.status(200).json({ usage, totals: { cost_usd: totalCost, calls: totalCalls, window_days: 30 } });
  } catch (e) {
    console.error('[admin/ai-usage] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}

// ── Audit log (?resource=audit-log) ───────────────────────────────────────
async function handleAuditLog(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: entries, error } = await sb.from('admin_audit_log')
      .select('id, admin_email, action, target_workspace_id, details, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    const workspaceIds = [...new Set((entries || []).map(e => e.target_workspace_id).filter(Boolean))];
    let names = {};
    if (workspaceIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, workspace_name, full_name').in('id', workspaceIds);
      names = Object.fromEntries((profs || []).map(p => [p.id, p.workspace_name || p.full_name || 'Unknown']));
    }

    return res.status(200).json({
      entries: (entries || []).map(e => ({ ...e, target_workspace_name: e.target_workspace_id ? (names[e.target_workspace_id] || 'Unknown') : null })),
    });
  } catch (e) {
    console.error('[admin/audit-log] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}

// ── Workspace detail / "view as" (?resource=workspace-detail) ────────────
// Deliberately NOT real session impersonation (no auth token is ever
// generated for the admin as that user) -- that would mean assuming a
// customer's identity, which is a much bigger trust/security line to cross
// than a platform admin needs for support purposes. Instead this is a
// read-only deep-dive: team roster, recent conversations, recent
// transactions, and AI agent status, all fetched service-role so an admin
// can see exactly what the workspace owner sees without ever holding their
// credentials.
async function handleWorkspaceDetail(req, res, sb) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).json({ error: 'workspace_id is required' });

    const [ownerRes, teamRes, convRes, txnRes, agentRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', workspaceId).maybeSingle(),
      sb.from('profiles').select('id, full_name, role, updated_at').or(`workspace_id.eq.${workspaceId},id.eq.${workspaceId}`),
      sb.from('conversations').select('id, contact_name, channel, status, last_message, last_message_at').eq('workspace_id', workspaceId).order('last_message_at', { ascending: false }).limit(10),
      sb.from('transactions').select('id, tx_ref, plan, amount, currency, status, created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(10),
      sb.from('ai_agents').select('id, name, status, automation_mode, enabled_channels').eq('workspace_id', workspaceId),
    ]);
    if (ownerRes.error) throw ownerRes.error;
    if (!ownerRes.data) return res.status(404).json({ error: 'Workspace not found' });

    return res.status(200).json({
      workspace: ownerRes.data,
      team: teamRes.data || [],
      recent_conversations: convRes.data || [],
      recent_transactions: txnRes.data || [],
      ai_agents: agentRes.data || [],
    });
  } catch (e) {
    console.error('[admin/workspace-detail] GET error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}

// ── Users (?resource=users) ───────────────────────────────────────────────
// Individual user management across all workspaces.
// GET  — list all profiles with workspace info
// POST — { action: 'reset_password', user_id, email } — send reset email
// DELETE — { user_id } — delete the user (cannot delete platform admins)
async function handleUsers(req, res, sb, admin) {
  if (req.method === 'GET') {
    try {
      const { data: profiles, error } = await sb
        .from('profiles')
        .select('id, full_name, workspace_id, workspace_name, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Resolve email from auth.users for each profile
      const { data: adminEmails } = await sb
        .from('platform_admin_emails')
        .select('email');
      const adminEmailSet = new Set((adminEmails || []).map(r => r.email));

      const users = await Promise.all((profiles || []).map(async (p) => {
        const { data: authUser } = await sb.auth.admin.getUserById(p.id).catch(() => ({ data: null }));
        // For teammates, look up their owner's workspace_name
        let workspaceName = p.workspace_name;
        if (!workspaceName && p.workspace_id) {
          const { data: owner } = await sb.from('profiles').select('workspace_name, full_name').eq('id', p.workspace_id).maybeSingle();
          workspaceName = owner?.workspace_name || owner?.full_name || null;
        }
        const email = authUser?.user?.email || null;
        return {
          id:                p.id,
          full_name:         p.full_name || null,
          email,
          role:              p.role || (p.workspace_id ? 'agent' : 'owner'),
          workspace_id:      p.workspace_id || p.id,
          workspace_name:    workspaceName || null,
          joined_at:         authUser?.user?.created_at || p.created_at,
          is_platform_admin: email ? adminEmailSet.has(email) : false,
        };
      }));

      return res.status(200).json({ users });
    } catch (e) {
      console.error('[admin/users] GET error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const { action, user_id, email } = req.body || {};
    if (action === 'reset_password') {
      if (!email) return res.status(400).json({ error: 'email is required' });
      try {
        const { error } = await sb.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: 'https://nyasadesk.com/reset-password' },
        });
        if (error) throw error;
        await logAudit(sb, admin, 'user_password_reset', user_id, { email });
        return res.status(200).json({ success: true });
      } catch (e) {
        console.error('[admin/users] reset_password error:', e);
        return res.status(500).json({ error: e.message || 'Failed to send reset email' });
      }
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    try {
      // Safety: cannot delete platform admins
      const { data: authUser } = await sb.auth.admin.getUserById(user_id);
      const email = authUser?.user?.email;
      if (email) {
        const { data: adminRow } = await sb.from('platform_admin_emails').select('email').eq('email', email).maybeSingle();
        if (adminRow) return res.status(403).json({ error: 'Cannot remove platform admins' });
      }
      const { error } = await sb.auth.admin.deleteUser(user_id);
      if (error) throw error;
      await logAudit(sb, admin, 'user_deleted', user_id, { email });
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/users] DELETE error:', e);
      return res.status(500).json({ error: e.message || 'Failed to remove user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
