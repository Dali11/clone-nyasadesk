import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '../_lib/adminAuth.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform admin endpoint — manage the platform_admin_emails allowlist that
// requirePlatformAdmin() checks on every /api/admin/* request. Only existing
// admins can view or change this list, and an admin can never remove their
// own email (avoids accidentally locking every admin out at once).
export default async function handler(req, res) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const admin = await requirePlatformAdmin(req, sb);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

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
