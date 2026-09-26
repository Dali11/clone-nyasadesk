// Generic data endpoint for the frontend shim (phase 3b).
// The src/lib/supabase.js facade serializes supabase-js-style builder calls
// into JSON and posts them here. This endpoint:
//   1. authenticates via the Better Auth session cookie
//   2. enforces workspace scoping server-side (replacing Supabase RLS)
//   3. executes via dbFactory (DATA_BACKEND switches Neon/Supabase)
import { auth } from './_lib/betterAuth.js';
import { createClient } from './_lib/dbFactory.js';

const FILTER_OPS = new Set(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'or', 'is']);
const ACTIONS = new Set(['select', 'insert', 'upsert', 'update', 'delete']);

// ── guard cache ──────────────────────────────────────────────────────────────
// Every /api/data request used to run two extra Neon queries just to learn
// who the caller is (profiles row + platform_admin_emails allowlist). The
// realtime facade polls every 4s per channel, so an open Inbox burned 30+ of
// these pairs per minute for data that changes at human speed. Cache the
// resolved identity per user for 30s — role/plan/workspace switches apply
// within half a minute, same trade-off the session itself already makes.
const GUARD_TTL_MS = 30_000;
const guardCache = new Map(); // uid -> { t, W, platformAdmin }
function guardCacheGet(uid) {
  const hit = guardCache.get(uid);
  if (hit && Date.now() - hit.t < GUARD_TTL_MS) return hit;
  return null;
}
function guardCacheSet(uid, W, platformAdmin) {
  guardCache.set(uid, { t: Date.now(), W, platformAdmin });
  if (guardCache.size > 1000) { // bound memory: drop the oldest entries
    const oldest = [...guardCache.entries()].sort((a, b) => a[1].t - b[1].t).slice(0, 200);
    for (const [k] of oldest) guardCache.delete(k);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
    const uid = session.user.id;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { table, action } = body;
    const filters = Array.isArray(body.filters) ? body.filters : [];
    if (!/^[a-z_]+$/.test(table || '')) return res.status(400).json({ error: 'Invalid table' });
    if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });
    for (const f of filters) if (!FILTER_OPS.has(f.op)) return res.status(400).json({ error: 'Invalid filter op: ' + f.op });

    const db = createClient(null, null);

    // ── identity: the caller's workspace (same rule the app itself uses:
    //    owners have workspace_id=null and ARE their own workspace id) ──
    let W = null, platformAdmin = false;
    const cachedGuard = guardCacheGet(uid);
    if (cachedGuard) {
      W = cachedGuard.W; platformAdmin = cachedGuard.platformAdmin;
    } else {
      const { data: profile } = await db.from('profiles')
        .select('id, workspace_id, role').eq('id', uid).maybeSingle();
      W = profile?.workspace_id || uid;
      // platform admins (God Mode) — the same allowlist /api/admin/* checks
      const { data: pa } = await db.from('platform_admin_emails')
        .select('email').eq('email', session.user.email || '').maybeSingle();
      platformAdmin = !!pa;
      guardCacheSet(uid, W, platformAdmin);
    }

    // ── workspace guard (replaces Supabase RLS) ──
    const explicitW = filters.find(f => f.op === 'eq' && f.args?.[0] === 'workspace_id');
    if (table === 'profiles') {
      const ownIdFilter = filters.find(f => f.op === 'eq' && f.args?.[0] === 'id');
      if ((action === 'insert' || action === 'upsert')) {
        const pid = body.payload?.id;
        if (!platformAdmin && pid !== uid) return res.status(403).json({ error: 'Cannot write another user\'s profile' });
      } else if (!platformAdmin) {
        if (!(ownIdFilter && ownIdFilter.args?.[1] === uid) && !(explicitW && explicitW.args?.[1] === W)) {
          return res.status(403).json({ error: 'Profile access limited to your own account' });
        }
      }
    } else if (table === 'platform_admin_emails') {
      // the allowlist is managed only via /api/admin/* endpoints
      if (action !== 'select') return res.status(403).json({ error: 'Read-only table' });
    } else if (!platformAdmin) {
      if (explicitW) {
        if (explicitW.args?.[1] !== W) return res.status(403).json({ error: 'Cross-workspace access denied' });
      } else if (action === 'insert' || action === 'upsert') {
        if (body.payload?.workspace_id !== W) return res.status(403).json({ error: 'Cross-workspace write denied' });
      } else {
        // no explicit workspace filter: verify every targeted row belongs to the caller's workspace
        let check = db.from(table).select('workspace_id');
        for (const f of filters) check = check[f.op](...f.args);
        const { data: rows, error: cErr } = await check;
        if (cErr) return res.status(200).json({ data: null, error: cErr });
        const foreign = (rows || []).some(r => (r.workspace_id ?? null) !== W);
        if (foreign) return res.status(403).json({ error: 'Cross-workspace access denied' });
      }
    }

    // ── execute through the same query builder the api files use ──
    let q = db.from(table);
    if (action === 'select') q = q.select(body.select || '*');
    if (action === 'update') q = q.update(body.payload);
    if (action === 'delete') q = q.delete();
    if (action === 'insert') q = q.insert(body.payload);
    if (action === 'upsert') q = q.upsert(body.payload, { onConflict: body.onConflict });
    for (const f of filters) q = q[f.op](...f.args);
    for (const o of (Array.isArray(body.order) ? body.order : [])) q = q.order(o.col, { ascending: o.asc !== false });
    if (body.limit) q = q.limit(body.limit);
    if (body.offset) q = q.range(body.offset, (body.offset + (body.limit || 1000)) - 1);
    if (action === 'select' && body.single) q = q.single();
    else if (action === 'select' && body.maybeSingle) q = q.maybeSingle();

    const result = await q;
    return res.status(200).json(result || { data: null, error: null });
  } catch (e) {
    console.error('[data]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
