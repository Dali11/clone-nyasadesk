// Session-authenticated password change without requiring the current password
// (both UI call sites only collect the new one). Equivalent to Supabase's
// auth.updateUser({ password }). Verifies the session, re-hashes with bcrypt,
// and revokes all other sessions.
import { auth } from './_lib/betterAuth.js';
import bcrypt from 'bcryptjs';
import { createClient } from './_lib/dbFactory.js';

export default async function handler(req, res) {
  // GET → { hasPassword }: does the session user have a credential (email+password) account?
  if (req.method === 'GET') {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
      const db = createClient(null, null);
      const { data } = await db.from('account')
        .select('password')
        .eq('userId', session.user.id).eq('providerId', 'credential').maybeSingle();
      return res.status(200).json({ hasPassword: !!(data?.password) });
    } catch (e) {
      console.error('[password:GET]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const pw = body.newPassword || body.password;
    if (!pw || typeof pw !== 'string' || pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const db = createClient(null, null);
    const hash = await bcrypt.hash(pw, 10);
    const { error } = await db.from('account')
      .update({ password: hash, updatedAt: new Date() })
      .eq('userId', session.user.id).eq('providerId', 'credential');
    if (error) return res.status(500).json({ error: 'Password update failed' });

    // revoke every session except the current one
    try { await auth.api.revokeOtherSessions({ headers: req.headers }); } catch (_) {}
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[password]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
