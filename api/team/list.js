import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    // Auth: verify the caller's own Supabase session and that they actually
    // belong to the workspace they're asking about. Previously this endpoint
    // had ZERO auth check — since workspace_id is intentionally public
    // (support-page URL, embeddable widget script), anyone who saw it could
    // list every team member's email address for that workspace.
    const authHeader = req.headers.authorization || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return res.status(401).json({ error: 'Missing Authorization header' });

    const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: callerData, error: callerErr } = await sbAnon.auth.getUser(callerToken);
    if (callerErr || !callerData?.user) return res.status(401).json({ error: 'Invalid or expired session' });
    const callerId = callerData.user.id;

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  } catch (e) {
    console.error('[team/list] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
