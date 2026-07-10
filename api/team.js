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

  // Step 1: look up workspace name from the owner's profile
  const { data: ownerProfile2 } = await sb.from('profiles')
    .select('workspace_name, full_name').eq('id', workspace_id).maybeSingle();
  const workspaceName = ownerProfile2?.workspace_name || ownerProfile2?.full_name || 'your team';

  // Step 2: generate a Supabase invite link (creates the user, returns a sign-in URL)
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: redirect_to || 'https://nyasadesk.com/onboarding',
      data: { workspace_name: workspaceName, workspace_id, role },
    },
  });

  if (linkErr) {
    return res.status(400).json({ error: linkErr.message || 'Failed to create invite' });
  }

  const newUserId = linkData?.user?.id;
  const inviteUrl = linkData?.properties?.action_link;

  // Step 3: upsert profile immediately (before email, so the user exists in our DB)
  if (newUserId) {
    const { full_name: providedName } = req.body || {};
    const { error: profileErr } = await sb.from('profiles').upsert({
      id: newUserId,
      workspace_id,
      role: role === 'user' ? 'user' : role,
      full_name: providedName?.trim() || email.split('@')[0],
      onboarding_complete: true,
    }, { onConflict: 'id' });
    if (profileErr) console.error('[team/invite] profile upsert error:', profileErr);
  }

  // Step 4: send branded invite email via Resend (falls back to Supabase default if no key)
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY && inviteUrl) {
    const { full_name: providedName } = req.body || {};
    const agentName = providedName?.trim() || email.split('@')[0];
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111B21;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#075E54;padding:28px 32px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:#25D366;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                <span style="color:white;font-size:18px;font-weight:bold;">N</span>
              </div>
              <span style="color:white;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Nyasadesk</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px;">
            <h1 style="margin:0 0 8px;color:#E9EDF0;font-size:22px;font-weight:700;line-height:1.3;">
              You've been invited to join<br>
              <span style="color:#25D366;">${workspaceName}</span>
            </h1>
            <p style="margin:16px 0;color:#8696A0;font-size:15px;line-height:1.6;">
              Hi ${agentName}, you've been added to the <strong style="color:#E9EDF0;">${workspaceName}</strong> workspace on Nyasadesk as <strong style="color:#E9EDF0;">${role === 'user' ? 'an Agent' : role === 'sales_manager' ? 'a Sales Manager' : 'an Admin'}</strong>.
            </p>
            <p style="margin:0 0 28px;color:#8696A0;font-size:15px;line-height:1.6;">
              Click the button below to set your password and access the shared inbox.
            </p>
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${inviteUrl}"
                style="display:inline-block;padding:14px 32px;background:#25D366;color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.1px;">
                Accept Invitation
              </a>
            </div>
            <p style="margin:0;color:#4B5563;font-size:12px;line-height:1.6;text-align:center;">
              This invitation link expires in 24 hours.<br>
              If you weren't expecting this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
            <p style="margin:0;color:#4B5563;font-size:11px;">Nyasadesk · nyasadesk.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: \`Bearer \${RESEND_KEY}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nyasadesk <noreply@nyasadesk.com>',
          to: [email],
          subject: \`You've been invited to join \${workspaceName}\`,
          html: emailHtml,
        }),
      });
    } catch (emailErr) {
      console.error('[team/invite] Resend error (non-fatal):', emailErr);
      // Don't fail the whole request — account was created, link is valid.
      // Supabase also sends its own default invite email as a fallback.
    }
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


async function removeHandler(req, res, sb, sbAnon) {
  const { member_id, workspace_id } = req.body || {};
  if (!member_id || !workspace_id) return res.status(400).json({ error: 'member_id and workspace_id are required' });

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  // Caller must be the workspace owner (their own id === workspace_id) or an admin
  const { data: callerProfile } = await sb.from('profiles').select('role, workspace_id').eq('id', callerId).maybeSingle();
  const callerWorkspace = callerProfile?.workspace_id || callerId;
  const isOwner = String(callerId) === String(workspace_id);
  const isAdmin = callerProfile?.role === 'admin' && String(callerWorkspace) === String(workspace_id);
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Only workspace admins can remove members' });

  // Cannot remove yourself
  if (String(member_id) === String(callerId)) return res.status(400).json({ error: 'You cannot remove yourself' });

  // Detach member from this workspace — they become standalone again
  const { error } = await sb.from('profiles')
    .update({ workspace_id: null, role: 'admin' })
    .eq('id', member_id)
    .eq('workspace_id', workspace_id); // safety: only touch members of THIS workspace

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

    if (action === 'remove' && req.method === 'POST') return await removeHandler(req, res, sb, sbAnon);
    if (req.method === 'GET') return await listHandler(req, res, sb, sbAnon);
    if (req.method === 'POST') return await inviteHandler(req, res, sb, sbAnon);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[team] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
