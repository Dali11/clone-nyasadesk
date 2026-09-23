import { createClient } from './_lib/dbFactory.js';
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
  if (!callerId) return;

  // Verify caller belongs to this workspace.
  // Owner: their profile.workspace_id is NULL, so callerWorkspaceId = callerId = workspace_id ✓
  // Invited agent: profile.workspace_id = owner's ID = workspace_id ✓
  const { data: callerProfile, error: cpErr } = await sb.from('profiles').select('workspace_id').eq('id', callerId).maybeSingle();
  if (cpErr) {
    console.error('[team/list] callerProfile error:', cpErr.message);
    return res.status(500).json({ error: 'Failed to verify caller profile' });
  }
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, role, avatar_url, workspace_id, updated_at')
    .or(`workspace_id.eq.${workspace_id},id.eq.${workspace_id}`)
    .order('updated_at', { ascending: true });

  if (error) {
    console.error('[team/list] profiles query error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch team members: ' + error.message });
  }

  // Attach email + last_sign_in_at from auth.users via admin API (service role).
  // Each call is individually try/caught — a single failed lookup must not
  // crater the whole list response.
  const users = await Promise.all((data || []).map(async (p) => {
    try {
      const { data: authUser, error: auErr } = await sb.auth.admin.getUserById(p.id);
      if (auErr) throw auErr;
      return {
        ...p,
        email: authUser?.user?.email || null,
        last_sign_in_at: authUser?.user?.last_sign_in_at || null,
      };
    } catch (e) {
      console.warn('[team/list] getUserById failed for', p.id, ':', e.message);
      return { ...p, email: null, last_sign_in_at: null };
    }
  }));

  return res.status(200).json({ users });
}

async function inviteHandler(req, res, sb, sbAnon) {
  const { email, role = 'user', workspace_id, redirect_to, resend = false } = req.body || {};
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

  // Resend path — skip seat check, just re-generate and re-send invite link
  if (resend) {
    const { data: ownerPr } = await sb.from('profiles').select('workspace_name, full_name').eq('id', workspace_id).maybeSingle();
    const wName = ownerPr?.workspace_name || ownerPr?.full_name || 'Your workspace';
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'invite', email,
      options: { redirectTo: redirect_to || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://nyasadesk.com'}/` },
    });
    if (linkErr) return res.status(400).json({ error: linkErr.message || 'Failed to generate link' });
    const inviteUrl = linkData?.properties?.action_link;
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (RESEND_KEY && inviteUrl) {
      const { buildEmail } = await import('./_lib/emailTemplate.js');
      const roleLabel = role === 'user' ? 'an Agent' : role === 'sales_manager' ? 'a Sales Manager' : 'an Admin';
      const html = buildEmail({
        preheader: `Your invite to join ${wName} on Nyasadesk`,
        body: `<p style="color:#E9EDF0;font-size:15px;line-height:1.7;margin:0 0 16px">You've been invited to join <strong style="color:#25D366">${wName}</strong> as <strong>${roleLabel}</strong> on Nyasadesk.</p><p style="color:#8696A0;font-size:13px;margin:0">Use the button below to accept and set your password.</p>`,
        cta: { label: 'Accept Invitation', url: inviteUrl },
        footer: `© ${new Date().getFullYear()} Nyasadesk`,
      });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Nyasadesk <no-reply@nyasadesk.com>', to: email, subject: `You're invited to join ${wName} on Nyasadesk`, html }),
      }).catch(e => console.error('[team/resend] email error:', e));
    }
    return res.status(200).json({ success: true });
  }

  // Seat-limit enforcement — the workspace's plan actually caps team size.
  const { data: ownerProfile } = await sb.from('profiles').select('plan').eq('id', workspace_id).maybeSingle();
  const plan = ownerProfile?.plan || 'starter';
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  if (limit !== Infinity) {
    const { count: currentSeats } = await sb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .in('role', ['user', 'sales_manager', 'admin']); // owner is excluded (owner id === workspace_id); admins consume seats
    if ((currentSeats || 0) >= limit) {
      return res.status(403).json({
        error: `Your ${plan} plan is limited to ${limit} seat${limit === 1 ? '' : 's'} (not counting you as owner). Upgrade your plan to invite more.`,
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
    const { buildEmail } = await import('./_lib/emailTemplate.js');
    const { full_name: providedName } = req.body || {};
    const agentName = providedName?.trim() || email.split('@')[0];
    const roleLabel = role === 'user' ? 'an Agent' : role === 'sales_manager' ? 'a Sales Manager' : 'an Admin';
    const emailHtml = buildEmail({
      preheader: `You've been invited to join ${workspaceName} on Nyasadesk`,
      body: `
        <h1 style="margin:0 0 8px;color:#E9EDF0;font-size:22px;font-weight:700;line-height:1.3;
                   font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          You've been invited to join<br>
          <span style="color:#25D366;">${workspaceName}</span>
        </h1>
        <p style="margin:0 0 20px;color:#4B5563;font-size:12px;letter-spacing:0.2px;
                  text-transform:uppercase;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Shared team inbox &middot; Nyasadesk
        </p>
        <p style="margin:0 0 16px;color:#8696A0;font-size:15px;line-height:1.6;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Hi ${agentName}, you've been added to the
          <strong style="color:#E9EDF0;">${workspaceName}</strong> workspace on Nyasadesk as
          <strong style="color:#E9EDF0;">${roleLabel}</strong>.
        </p>
        <p style="margin:0;color:#8696A0;font-size:15px;line-height:1.6;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Click the button below to set your password and access the shared inbox.
        </p>`,
      cta: { label: 'Accept Invitation', url: inviteUrl },
      footer: "This invitation link expires in 24 hours. If you weren't expecting this, you can safely ignore this email.",
    });

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nyasadesk <noreply@nyasadesk.com>',
          to: [email],
          subject: "You've been invited to join " + workspaceName,
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

  // Two-step upsert: try insert first, fall back to update on conflict.
  // This is more robust than .upsert({onConflict:'endpoint'}) which requires
  // a named UNIQUE constraint — a plain unique index is not enough for the
  // Supabase JS client's upsert helper.
  const endpoint = subscription.endpoint;

  // Reject legacy FCM endpoints — they're dead and would pollute the DB
  if (!endpoint || endpoint.includes('fcm.googleapis.com/fcm/send/')) {
    return res.status(400).json({ error: 'Legacy FCM endpoints are not supported. Please re-enable notifications.' });
  }

  const { data: existing } = await sb.from('push_subscriptions')
    .select('id').eq('endpoint', endpoint).maybeSingle();

  if (existing?.id) {
    // Update existing row
    const { error } = await sb.from('push_subscriptions')
      .update({ user_id: callerId, owner_id: workspace_id, subscription, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) {
      console.error('[push-subscribe] update failed:', error.message);
      return res.status(500).json({ error: error.message });
    }
  } else {
    // Insert new row
    const { error } = await sb.from('push_subscriptions').insert({
      user_id: callerId, owner_id: workspace_id, endpoint, subscription,
    });
    if (error) {
      // If it's a unique constraint violation (race condition), try update
      if (error.code === '23505') {
        const { error: e2 } = await sb.from('push_subscriptions')
          .update({ user_id: callerId, owner_id: workspace_id, subscription, updated_at: new Date().toISOString() })
          .eq('endpoint', endpoint);
        if (e2) {
          console.error('[push-subscribe] conflict update failed:', e2.message);
          return res.status(500).json({ error: e2.message });
        }
      } else {
        console.error('[push-subscribe] insert failed:', error.message, 'code:', error.code);
        return res.status(500).json({ error: error.message });
      }
    }
  }
  console.log('[push-subscribe] saved for user:', callerId, 'workspace:', workspace_id);
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

// ── Internal agent-to-agent messaging + pinned conversations ───────────────
// All merged into team.js (no new file) to stay under Vercel Hobby's
// 12-function cap. Frontend-only endpoints, keyed off action query params.

async function getTeamMembersHandler(req, res, sb, sbAnon) {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  const { data: callerProfile } = await sb.from('profiles').select('workspace_id').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .or(`workspace_id.eq.${workspace_id},id.eq.${workspace_id}`)
    .order('full_name', { ascending: true });

  if (error) throw error;
  // Exclude the caller themselves from the DM picker list
  const members = (data || []).filter(m => String(m.id) !== String(callerId));
  return res.status(200).json({ members });
}

async function createInternalConvHandler(req, res, sb, sbAnon) {
  const { workspace_id, recipient_id, message } = req.body || {};
  if (!workspace_id || !recipient_id || !message) {
    return res.status(400).json({ error: 'workspace_id, recipient_id, and message are required' });
  }

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  // Fetch caller profile
  const { data: callerProfile } = await sb.from('profiles').select('workspace_id, role, full_name').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }

  // Fetch recipient profile
  const { data: recipientProfile, error: recipErr } = await sb.from('profiles')
    .select('id, full_name, role, workspace_id, avatar_url').eq('id', recipient_id).maybeSingle();
  if (recipErr || !recipientProfile) {
    return res.status(404).json({ error: 'Recipient not found' });
  }

  // Verify recipient is in the same workspace
  const recipWorkspaceId = recipientProfile.workspace_id || recipientProfile.id;
  if (String(recipWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'Recipient is not in this workspace' });
  }

  const callerName = callerProfile?.full_name || 'Agent';
  const recipName = recipientProfile.full_name || 'Agent';

  // Step 1: Create or find an internal contact for the recipient
  const { data: existingContact } = await sb.from('contacts')
    .select('id').eq('workspace_id', workspace_id).eq('channel', 'internal').eq('full_name', recipName).maybeSingle();

  let contactId = existingContact?.id;
  if (!contactId) {
    const { data: newContact, error: contactErr } = await sb.from('contacts').insert({
      workspace_id,
      channel: 'internal',
      full_name: recipName,
      avatar_url: recipientProfile.avatar_url || null,
    }).select().single();
    if (contactErr) throw contactErr;
    contactId = newContact.id;
  }

  // Step 2: Create the internal conversation
  const { data: conv, error: convErr } = await sb.from('conversations').insert({
    workspace_id,
    channel: 'internal',
    contact_id: contactId,
    contact_name: recipName,
    assigned_to: recipient_id,
    status: 'open',
    priority: 'normal',
    last_message: message,
    last_message_at: new Date().toISOString(),
  }).select().single();
  if (convErr) throw convErr;

  // Step 3: Insert the first message
  const { data: msg, error: msgErr } = await sb.from('messages').insert({
    workspace_id,
    conversation_id: conv.id,
    direction: 'outbound',
    body: message,
    sender_id: callerId,
    sender_name: callerName,
    channel: 'internal',
    status: 'sent',
  }).select().single();
  if (msgErr) throw msgErr;

  // Step 4: Update conversation preview (already set in step 2, but ensure consistency)
  await sb.from('conversations').update({
    last_message: message,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', conv.id);

  // Step 5: Auto-pin the conversation for the recipient if they have < 3 pins
  const { count: pinCount } = await sb.from('pinned_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('pinned_for', recipient_id);
  if ((pinCount || 0) < 3) {
    await sb.from('pinned_conversations').upsert({
      workspace_id,
      pinned_by: callerId,
      pinned_for: recipient_id,
      conversation_id: conv.id,
    }, { onConflict: 'pinned_for,conversation_id' });
  }

  // Step 6: Send push notification to recipient if they have a push subscription
  try {
    const { data: subs } = await sb.from('push_subscriptions')
      .select('subscription').eq('user_id', recipient_id);
    if (subs && subs.length > 0) {
      const VAPID_KEY = process.env.VAPID_PUBLIC_KEY || '';
      // Best-effort web push — we don't have the web-push library inline,
      // but we send a simple fetch to each subscription endpoint
      for (const row of subs) {
        const sub = row.subscription;
        if (sub?.endpoint) {
          // Fire-and-forget — push delivery is non-critical
          fetch(sub.endpoint, { method: 'POST', headers: sub.headers || {} }).catch(() => {});
        }
      }
    }
  } catch (pushErr) {
    console.error('[team/create-internal-conv] push notification error (non-fatal):', pushErr);
  }

  return res.status(200).json({ success: true, conversation: conv, message: msg });
}

async function getPinsHandler(req, res, sb, sbAnon) {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  const { data: callerProfile } = await sb.from('profiles').select('workspace_id').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }

  // NOTE: conversations has no contact_name column — the old embedded select
  // (conversation:conversations(..., contact_name, ...)) errored on every
  // call under both Supabase (PostgREST column validation) and Neon. Resolve
  // conversations + their contacts explicitly instead.
  const { data: pins, error } = await sb.from('pinned_conversations')
    .select('id, pinned_by, pinned_for, conversation_id, created_at')
    .eq('pinned_for', callerId)
    .eq('workspace_id', workspace_id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!pins || !pins.length) return res.status(200).json({ pins: [] });

  const convIds = [...new Set(pins.map(p => p.conversation_id).filter(Boolean))];
  if (!convIds.length) return res.status(200).json({ pins });

  const { data: convs, error: convErr } = await sb.from('conversations')
    .select('*, contact:contacts(id, full_name, avatar_url)')
    .in('id', convIds);
  if (convErr) throw convErr;

  const byId = Object.fromEntries((convs || []).map(c => [
    c.id,
    { ...c, contact_name: c.contact?.full_name || null },
  ]));
  return res.status(200).json({ pins: pins.map(p => ({ ...p, conversation: byId[p.conversation_id] || null })) });
}

async function pinConvHandler(req, res, sb, sbAnon) {
  const { workspace_id, conversation_id, pinned_for } = req.body || {};
  if (!workspace_id || !conversation_id || !pinned_for) {
    return res.status(400).json({ error: 'workspace_id, conversation_id, and pinned_for are required' });
  }

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  // Only admin/sales_manager can pin
  const { data: callerProfile } = await sb.from('profiles').select('workspace_id, role').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }
  const isOwner = String(callerId) === String(workspace_id);
  const isManager = callerProfile?.role === 'admin' || callerProfile?.role === 'sales_manager';
  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Only admins or sales managers can pin conversations' });
  }

  // Enforce max 3 pins per pinned_for agent
  const { count: pinCount } = await sb.from('pinned_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('pinned_for', pinned_for);
  if ((pinCount || 0) >= 3) {
    return res.status(400).json({ error: 'This agent already has 3 pinned conversations (the maximum). Unpin one first.' });
  }

  const { data, error } = await sb.from('pinned_conversations').upsert({
    workspace_id,
    pinned_by: callerId,
    pinned_for,
    conversation_id,
  }, { onConflict: 'pinned_for,conversation_id' }).select().single();

  if (error) throw error;
  return res.status(200).json({ success: true, pin: data });
}

async function unpinConvHandler(req, res, sb, sbAnon) {
  const { workspace_id, conversation_id, pinned_for } = req.body || {};
  if (!workspace_id || !conversation_id || !pinned_for) {
    return res.status(400).json({ error: 'workspace_id, conversation_id, and pinned_for are required' });
  }

  const callerId = await verifyCaller(req, res, sb, sbAnon);
  if (!callerId) return;

  const { data: callerProfile } = await sb.from('profiles').select('workspace_id, role').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id || callerId;
  if (String(callerWorkspaceId) !== String(workspace_id)) {
    return res.status(403).json({ error: 'You do not have access to this workspace' });
  }
  const isOwner = String(callerId) === String(workspace_id);
  const isManager = callerProfile?.role === 'admin' || callerProfile?.role === 'sales_manager';
  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Only admins or sales managers can unpin conversations' });
  }

  const { error } = await sb.from('pinned_conversations')
    .delete()
    .eq('pinned_for', pinned_for)
    .eq('conversation_id', conversation_id);

  if (error) throw error;
  return res.status(200).json({ success: true });
}


// ── Notification inline-reply handler ─────────────────────────────────────
// Called by the service worker when the user types a reply directly in the
// Android notification shade (no app open required).
// Auth: uses a special SUPABASE_SERVICE_ROLE_KEY since there is no browser
// session — we verify the request via a shared NOTIF_REPLY_SECRET instead.
async function notifReplyHandler(req, res, sb) {
  const { secret, conversationId, workspaceId, channel, text } = req.body || {};

  // Gate with a server-side secret set via env var (set NOTIF_REPLY_SECRET in Vercel)
  const expectedSecret = process.env.NOTIF_REPLY_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!conversationId || !workspaceId || !text?.trim()) {
    return res.status(400).json({ error: 'conversationId, workspaceId and text are required' });
  }

  try {
    // 1. Resolve the channel config
    const { data: cfg } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspaceId).eq('channel', channel || 'whatsapp').maybeSingle();
    if (!cfg?.enabled) return res.status(400).json({ error: 'Channel not configured' });

    // 2. Get conversation external_id (recipient phone/user id)
    const { data: conv } = await sb.from('conversations').select('external_id, channel').eq('id', conversationId).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    // 3. Persist the outbound message
    const { data: msg, error: msgErr } = await sb.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      body: text.trim(),
      direction: 'outbound',
      channel: conv.channel || channel || 'whatsapp',
      status: 'sending',
      sender_id: 'notif-reply',
      sender_name: 'Agent',
    }).select().single();
    if (msgErr) throw msgErr;

    // 4. Send via provider abstraction
    const { getProvider } = await import('./_lib/providers/index.js');
    const providerKey = (conv.channel || channel) === 'whatsapp'
      ? (cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
         : cfg.config?.bird_workspace_id ? 'whatsapp:bird'
         : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud')
      : (conv.channel || channel);
    const provider = getProvider(providerKey);
    const result = await provider.sendMessage(cfg.config, {
      to: conv.external_id, text: text.trim(), message_id: msg.id, conversation_id: conversationId, workspace_id: workspaceId,
    }, { sb });

    // 5. Update message status
    await sb.from('messages').update({
      status: 'sent',
      ...(result?.external_id ? { external_id: result.external_id } : {}),
    }).eq('id', msg.id);

    // 6. Update conversation last_message
    await sb.from('conversations').update({
      last_message: text.trim(),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[notifReply] error:', e);
    return res.status(500).json({ error: e.message });
  }
}


export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);

    const action = req.query.action;
    if (action === 'push-subscribe' && req.method === 'POST') return await pushSubscribeHandler(req, res, sb, sbAnon);
    if (action === 'notif-reply' && req.method === 'POST') return await notifReplyHandler(req, res, sb);
    if (action === 'push-unsubscribe' && req.method === 'POST') return await pushUnsubscribeHandler(req, res, sb, sbAnon);

    if (action === 'remove' && req.method === 'POST') return await removeHandler(req, res, sb, sbAnon);

    // Internal agent-to-agent messaging + pinned conversations
    if (action === 'team-members' && req.method === 'GET') return await getTeamMembersHandler(req, res, sb, sbAnon);
    if (action === 'create-internal-conv' && req.method === 'POST') return await createInternalConvHandler(req, res, sb, sbAnon);
    if (action === 'get-pins' && req.method === 'GET') return await getPinsHandler(req, res, sb, sbAnon);
    if (action === 'pin-conv' && req.method === 'POST') return await pinConvHandler(req, res, sb, sbAnon);
    if (action === 'unpin-conv' && req.method === 'POST') return await unpinConvHandler(req, res, sb, sbAnon);

    if (req.method === 'GET') return await listHandler(req, res, sb, sbAnon);
    if (req.method === 'POST') return await inviteHandler(req, res, sb, sbAnon);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[team] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
