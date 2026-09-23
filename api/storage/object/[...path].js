// Serve chat/media files from the Neon media_files table.
// Path format: /api/storage/object/<bucket>/<rest...> — public (same as the
// Supabase public bucket was), immutable content-addressed names.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { path: segments } = req.query || {};
  const parts = Array.isArray(segments) ? segments : (segments ? [segments] : []);
  if (parts.length < 2) return res.status(400).json({ error: 'Bad path' });
  const bucket = parts[0];
  const filePath = parts.slice(1).join('/');
  if (!/^[a-z-]+$/.test(bucket) || filePath.includes('..')) {
    return res.status(400).json({ error: 'Bad path' });
  }
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.NEON_CONNECTION_STRING);
    // HEAD requests never need the payload — skip fetching it entirely
    if (req.method === 'HEAD') {
      const meta = await sql`SELECT mime, size FROM media_files WHERE bucket = ${bucket} AND path = ${filePath} LIMIT 1`;
      if (!meta.length) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Content-Type', meta[0].mime || 'application/octet-stream');
      res.setHeader('Content-Length', Number(meta[0].size));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).end();
    }
    const rows = await sql`SELECT mime, data FROM media_files WHERE bucket = ${bucket} AND path = ${filePath} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const buf = Buffer.from(rows[0].data, 'base64');
    res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end(buf);
  } catch (e) {
    console.error('[storage/object]', e.message);
    return res.status(500).json({ error: 'Storage error' });
  }
}
