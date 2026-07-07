import { createClient } from '@supabase/supabase-js';
import { PLAN_LIMITS } from './_lib/adminAuth.js';

// Merged from the old api/team/list.js + api/team/invite.js (GET = list,
// POST = invite) — done purely to reduce the project's serverless function
// count under Vercel Hobby's 12-function-per-deployment cap; behavior is
// unchanged. Both are frontend-only endpoints (no external provider ever
// calls these URLs), so merging them carries zero external-reconfiguration risk.

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verifyCaller(req, res, sb, sbAnon) {
  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) { res.status(401).json({ error: 'Missing Authorization header' }); return null; }

  const { data: callerData, error: callerErr } = await sbAnon.auth.getUser(callerToken);
  if (callerErr || !callerData?.user) { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
  return callerData.user.id;
}

async function listHandler(req, res, sb, sbAnon) {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return; // response already sent

  const { data: callerProfile } = await sb.from('profiles').select('workspace_id').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, role, avatar_url, workspace_id, updated_at')
    .or(`workspace_id.eq.${workspace_id},id.eq.${workspace_id}`)
    .order('updated_at', { ascending: true });

  if (error) throw error;

  // profiles has no email column (lives in auth.users) — attach it via admin API
  const users = await Promise.all((data || []).map(async (p) => {
    try {
      const { data: authUser } = await sb.auth.admin.getUserById(p.id);
      return { ...p, email: authUser?.user?.email || null };
    } catch {
      return { ...p, email: null };
    }
  }));

  return res.status(200).json({ users });
}

async function inviteHandler(req, res, sb, sbAnon) {
  const { email, role = 'user', workspace_id, redirect_to } = req.body || {};
  if (!email || !workspace_id) {
    return res.status(400).json({ error: 'email and workspace_id are required' });
  }

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return; // response already sent

  const { data: callerProfile } = await sb.from('profiles').select('workspace_id, role').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  const isOwner = String(callerId) === String(workspace_id);
  const isAdmin = callerProfile?.role === 'admin';
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Only admins can invite new team members' });
  }

  // Seat-limit enforcement — the workspace's plan actually caps team size.
  const { data: ownerProfile } = await sb.from('profiles').select('plan').eq('id', workspace_id).maybeSingle();
  const plan = ownerProfile?.plan || 'starter';
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  if (limit !== Infinity) {
    const { count: currentSeats } = await sb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .or(`workspace_id.eq.${workspace_id},id.eq.${workspace_id}`);
    if ((currentSeats || 0) >= limit) {
      return res.status(403).json({
        error: `Your ${plan} plan is limited to ${limit} team member${limit === 1 ? '' : 's'}. Upgrade your plan to invite more.`,
      });
    }
  }

  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirect_to || 'https://nyasadesk1.vercel.app/login',
  });

  if (error) {
    return res.status(400).json({ error: error.message || 'Failed to send invite' });
  }

  const newUserId = data?.user?.id;
  if (newUserId) {
    const { error: profileErr } = await sb.from('profiles').upsert({
      id: newUserId,
      workspace_id,
      role,
      full_name: email.split('@')[0],
      onboarding_complete: true,
    });
    if (profileErr) console.error('[team/invite] profile upsert error:', profileErr);
  }

  return res.status(200).json({ success: true, user_id: newUserId });
}

// Push-notification subscribe/unsubscribe -- merged in here (rather than a
// new file) to stay within Vercel Hobby's 12-function cap. Frontend-only
// endpoint, keyed off action=push-subscribe / action=push-unsubscribe.
async function pushSubscribeHandler(req, res, sb, sbAnon) {
  const { subscription, workspace_id } = req.body || {};
  if (!subscription?.endpoint || !workspace_id) {
    return res.status(400).json({ error: 'subscription and workspace_id are required' });
  }
  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: callerId, owner_id: workspace_id,
    endpoint: subscription.endpoint, subscription,
  }, { onConflict: 'endpoint' });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

async function pushUnsubscribeHandler(req, res, sb, sbAnon) {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  const { error } = await sb.from('push_subscriptions').delete()
    .eq('endpoint', endpoint).eq('user_id', callerId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);

    const action = req.query.action;
    if (action === 'push-subscribe' && req.method === 'POST') return await pushSubscribeHandler(req, res, sb, sbAnon);
    if (action === 'push-unsubscribe' && req.method === 'POST') return await pushUnsubscribeHandler(req, res, sb, sbAnon);

    if (req.method === 'GET') return await listHandler(req, res, sb, sbAnon);
    if (req.method === 'POST') return await inviteHandler(req, res, sb, sbAnon);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[team] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
