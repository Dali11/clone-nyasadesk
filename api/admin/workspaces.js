import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin, PLAN_LIMITS } from '../_lib/adminAuth.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform admin endpoint — lists every customer workspace (and lets an
// admin manually set a workspace's plan). "Workspace" = a root owner profile
// (workspace_id IS NULL); every other profile with workspace_id pointing at
// that owner's id is a teammate inside it.
export default async function handler(req, res) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const admin = await requirePlatformAdmin(req, sb);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

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
