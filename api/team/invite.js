import { createClient } from '@supabase/supabase-js';
import { PLAN_LIMITS } from '../_lib/adminAuth.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, role = 'user', workspace_id, redirect_to } = req.body || {};
    if (!email || !workspace_id) {
      return res.status(400).json({ error: 'email and workspace_id are required' });
    }

    // Auth: verify the caller's session and that they're allowed to invite
    // people into this workspace. Previously this endpoint had ZERO auth
    // check — anyone who knew a workspace_id (public via the support-page
    // URL / widget embed) could invite an email of their choosing into that
    // workspace as 'admin'. Now: caller must be a real, logged-in member of
    // this workspace, AND either the original owner (auth.uid() ===
    // workspace_id) or already have the 'admin' role — plain agents can't
    // invite anyone.
    const authHeader = req.headers.authorization || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return res.status(401).json({ error: 'Missing Authorization header' });

    const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: callerData, error: callerErr } = await sbAnon.auth.getUser(callerToken);
    if (callerErr || !callerData?.user) return res.status(401).json({ error: 'Invalid or expired session' });
    const callerId = callerData.user.id;

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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

    // Seat-limit enforcement — the workspace's plan (set by the owner via
    // billing, or by a platform admin manually today since there's no
    // automated billing yet) actually caps how many people can be invited,
    // rather than just being a number shown on a pricing page.
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
      // Pre-assign them to the inviter's workspace so they land straight in the shared inbox
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
  } catch (e) {
    console.error('[team/invite] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
