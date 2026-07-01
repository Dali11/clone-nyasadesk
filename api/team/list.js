import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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
