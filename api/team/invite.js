import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, role = 'user', workspace_id, redirect_to } = req.body || {};
    if (!email || !workspace_id) {
      return res.status(400).json({ error: 'email and workspace_id are required' });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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
