// Frontend upload endpoint: { bucket, path, mime, dataBase64 } → media_files.
// Session-gated; the file must belong to the caller's workspace.
import { auth } from '../betterAuth.js';
import { neon } from '@neondatabase/serverless';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const BUCKETS = new Set(['chat-media', 'media']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { bucket, path, mime } = body;
    if (!BUCKETS.has(bucket) || typeof path !== 'string' || !path || path.includes('..')) {
      return res.status(400).json({ error: 'Bad request' });
    }
    const b64 = body.dataBase64;
    const size = b64 ? Math.floor(b64.length * 3 / 4) : 0;
    if (!b64 || size > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 25 MB)' });

    // workspace guard: the path must reference the caller's workspace
    const sql = neon(process.env.NEON_CONNECTION_STRING);
    const uid = session.user.id;
    const prof = await sql`SELECT workspace_id FROM profiles WHERE id = ${uid} LIMIT 1`;
    const W = prof[0]?.workspace_id || uid;
    const pa = await sql`SELECT email FROM platform_admin_emails WHERE email = ${session.user.email || ''} LIMIT 1`;
    const platformAdmin = pa.length > 0;
    const pathSegments = path.split('/');
    if (!platformAdmin && !pathSegments.includes(W)) {
      return res.status(403).json({ error: 'File path must be inside your workspace' });
    }

    await sql`INSERT INTO media_files (bucket, path, mime, size, data)
      VALUES (${bucket}, ${path}, ${mime || 'application/octet-stream'}, ${size}, ${b64})
      ON CONFLICT (bucket, path) DO UPDATE
        SET data = EXCLUDED.data, mime = EXCLUDED.mime, size = EXCLUDED.size`;
    const base = process.env.PUBLIC_BASE_URL || `https://${req.headers.host || 'nyasadesk.com'}`;
    return res.status(200).json({ path: `${bucket}/${path}`, publicUrl: `${base}/api/storage/object/${bucket}/${path}` });
  } catch (e) {
    console.error('[storage/upload]', e.message);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
