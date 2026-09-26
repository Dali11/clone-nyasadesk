// pgCompat.js — supabase-js-compatible query builder over Neon Postgres.
// Implements exactly the subset NyasaDesk's api/ layer uses:
//   from().select/insert/upsert/update/delete
//   .eq .neq .in .gt .gte .lt .lte .like .or .order .limit .range .single .maybeSingle
//   select(col, {count:'exact', head:true}) and rpc()
// Escape-only parameterization (sandbox/Vercel HTTP driver has no bind params),
// safe under standard_conforming_strings with quote-doubling.

import { neon } from '@neondatabase/serverless';

let _sql = null;
function sqlexec() {
  if (!_sql) _sql = neon(process.env.NEON_CONNECTION_STRING);
  return _sql;
}

// run arbitrary SQL via the tagged-template HTTP driver
function raw(text) {
  const sql = sqlexec();
  const strings = [text];
  strings.raw = strings;
  return sql(strings);
}

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') v = JSON.stringify(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function ident(name) { return `"${String(name).replace(/"/g, '""')}"`; }
// column reference qualified with the main-table alias (skips literals/paths)
function qual(c, a = '__t') {
  c = String(c);
  return (c.includes('.') || c.includes('(')) ? c : `${a}.${ident(c)}`;
}

// split a select list on top-level commas (parentheses respected)
function splitTopLevel(str) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of String(str)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

// supabase-js embedded-resource select: '*, contact:contacts(id,full_name,...)'
// becomes a LEFT JOIN on {alias}_id → {table}.id with a JSON object column.
// Returns { fields, joins }; all main-table columns are qualified with `a`.
// RETURNING column list for chained .select() on write ops (no joins allowed)
function returnCols(cols) {
  if (!cols || cols === '*') return '*';
  return splitTopLevel(cols).map(ident).join(', ');
}

// does this select list contain an embedded resource (alias:table(...))?
function hasEmbedded(cols) {
  return /\)\s*$/.test(String(cols || '')) && /:[a-zA-Z_][a-zA-Z0-9_]*\(/.test(String(cols || ''));
}

function selectParts(cols, a = '__t') {
  const fields = [], joins = [];
  let n = 0;
  for (const tok of splitTopLevel(cols || '*')) {
    const m = tok.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
    if (m) {
      const [, alias, table, inner] = m;
      const jt = `__e${++n}`;
      const innerCols = splitTopLevel(inner);
      const obj = innerCols.length === 1 && innerCols[0] === '*'
        ? `to_jsonb(${jt})`
        : `json_build_object(${innerCols.map(c => `${lit(c)}, ${jt}.${ident(c)}`).join(', ')})`;
      fields.push(`CASE WHEN ${jt}.id IS NULL THEN NULL ELSE ${obj} END AS ${ident(alias)}`);
      joins.push(`LEFT JOIN ${ident(table)} ${jt} ON ${jt}.id = ${a}.${ident(alias + '_id')}`);
    } else if (tok === '*') {
      fields.push(`${a}.*`);
    } else {
      fields.push(tok.includes('.') && !tok.includes('(') ? tok : `${a}.${ident(tok)}`);
    }
  }
  return { fields: fields.join(', '), joins: joins.join(' ') };
}

class Builder {
  constructor(table) {
    this.table = table;
    this.wheres = [];
    this.orders = [];
    this.limitN = null;
    this.offsetN = null;
    this.selectCols = '*';
    this.countMode = false;
    this.head = false;
    this.singleMode = null;
    this.op = 'select';
    this.payload = null;
    this.onConflict = null;
    this._promise = null;
  }

  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(fn) { return this.exec().catch(fn); }

  select(cols = '*', opts = {}) {
    // supabase-js chains .select() after insert/upsert/update/delete to shape
    // the RETURNING rows — it must NOT flip the operation into a query.
    if (!this.op || this.op === 'select') this.op = 'select';
    this.selectCols = typeof cols === 'string' ? cols : '*';
    if (opts.count === 'exact') this.countMode = true;
    if (opts.head) this.head = true;
    return this;
  }
  insert(data, opts = {}) { this.op = 'insert'; this.payload = data; this.onConflict = opts.onConflict; return this; }
  upsert(data, opts = {}) { this.op = 'upsert'; this.payload = data; this.onConflict = opts.onConflict; return this; }
  update(data) { this.op = 'update'; this.payload = data; return this; }
  delete() { this.op = 'delete'; return this; }

  // filter/order clauses store {col, sql}; the main-table alias is applied at
  // build time so LEFT JOINs from embedded-resource selects can't make
  // unqualified column references ambiguous.
  eq(c, v) { this.wheres.push({ col: c, sql: `= ${lit(v)}` }); return this; }
  neq(c, v) { this.wheres.push({ col: c, sql: `<> ${lit(v)}` }); return this; }
  in(c, arr) { this.wheres.push({ col: c, sql: `IN (${(arr || []).map(lit).join(', ')})` }); return this; }
  gt(c, v) { this.wheres.push({ col: c, sql: `> ${lit(v)}` }); return this; }
  gte(c, v) { this.wheres.push({ col: c, sql: `>= ${lit(v)}` }); return this; }
  lt(c, v) { this.wheres.push({ col: c, sql: `< ${lit(v)}` }); return this; }
  lte(c, v) { this.wheres.push({ col: c, sql: `<= ${lit(v)}` }); return this; }
  like(c, v) { this.wheres.push({ col: c, sql: `LIKE ${lit(v)}` }); return this; }
  is(c, v) {
    const sql = v === null ? 'IS NULL' : v === true ? 'IS TRUE' : v === false ? 'IS FALSE' : `= ${lit(v)}`;
    this.wheres.push({ col: c, sql });
    return this;
  }
  ilike(c, v) { this.wheres.push({ col: c, sql: `ILIKE ${lit(v)}` }); return this; }
  // supabase-js .filter(col, op, value) — raw PostgREST operator escape hatch.
  // Only the jsonb operators NyasaDesk's api/ layer actually uses are mapped:
  //   cs = contains   → col @> value::jsonb
  //   cd = contained  → col <@ value::jsonb
  // The value arrives as a JSON-encoded string (e.g. '["whatsapp"]'), matching
  // how supabase-js serializes PostgREST filter params, so a ::jsonb cast of
  // the literal is the exact PostgREST semantics for jsonb columns.
  // Anything else throws loudly instead of silently matching zero rows.
  filter(c, op, v) {
    if (op === 'cs') { this.wheres.push({ col: c, sql: `@> ${lit(v)}::jsonb` }); return this; }
    if (op === 'cd') { this.wheres.push({ col: c, sql: `<@ ${lit(v)}::jsonb` }); return this; }
    if (op === 'eq') return this.eq(c, v);
    if (op === 'neq') return this.neq(c, v);
    if (op === 'gt') return this.gt(c, v);
    if (op === 'gte') return this.gte(c, v);
    if (op === 'lt') return this.lt(c, v);
    if (op === 'lte') return this.lte(c, v);
    if (op === 'like') return this.like(c, v);
    if (op === 'ilike') return this.ilike(c, v);
    if (op === 'is') return this.is(c, v);
    throw new Error(`pgCompat: unsupported .filter() operator "${op}"`);
  }
  or(expr) {
    // supabase .or('a.eq.1,b.eq.2') — comma-separated OR conditions.
    // Split on top-level commas only (paren/quote-aware) so values that
    // legitimately contain commas don't shred the condition list.
    const conds = [];
    let cur = '', depth = 0, q = null;
    for (const ch of String(expr)) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { conds.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) conds.push(cur);
    const parts = conds.map(cond => {
      const m = cond.match(/^([a-zA-Z_]+)\.(eq|neq|gt|gte|lt|lte|like|is)\.(.+)$/);
      if (!m) throw new Error(`pgCompat: unsupported .or() condition "${cond}"`);
      const [, c, op, rawV0] = m;
      // PostgREST lets values with commas/parens be double-quoted: strip the
      // wrapping quotes so the literal matches supabase-js behavior.
      const rawV = (rawV0.length > 1 && rawV0.startsWith('"') && rawV0.endsWith('"')) ? rawV0.slice(1, -1) : rawV0;
      const v = rawV === 'null' ? null : rawV;
      // 'is' covers IS NULL / IS TRUE / IS FALSE (PostgREST .is. semantics)
      if (op === 'is') {
        const sql = v === null ? 'IS NULL' : v === 'true' ? 'IS TRUE' : v === 'false' ? 'IS FALSE' : `= ${lit(v)}`;
        return `${qual(c)} ${sql}`;
      }
      const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op] || (op === 'like' ? 'LIKE' : '=');
      return `${qual(c)} ${sym} ${lit(v)}`;
    });
    this.wheres.push({ col: null, sql: `(${parts.join(' OR ')})` });
    return this;
  }
  order(c, opts = {}) {
    this.orders.push(`${qual(c)} ${opts.ascending === false ? 'DESC' : 'ASC'}`);
    return this;
  }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.offsetN = a; this.limitN = b - a + 1; return this; }
  single() { this.singleMode = 'single'; this.limitN = 1; return this; }
  maybeSingle() { this.singleMode = 'maybe'; this.limitN = 1; return this; }

  async exec() {
    if (this._promise) return this._promise;
    this._promise = this._run();
    return this._promise;
  }

  async _run() {
    const t = `${ident(this.table)} AS __t`;
    const where = this.wheres.length
      ? `WHERE ${this.wheres.map(w => w.col === null ? w.sql : `${qual(w.col)} ${w.sql}`).join(' AND ')}` : '';
    const order = this.orders.length ? `ORDER BY ${this.orders.join(', ')}` : '';
    const page = `${this.limitN != null ? `LIMIT ${this.limitN}` : ''} ${this.offsetN != null ? `OFFSET ${this.offsetN}` : ''}`.trim();

    try {
      if (this.op === 'select') {
        if (this.countMode) {
          const rows = await raw(`SELECT count(*)::int AS c FROM ${t} ${where}`);
          const count = rows[0].c;
          if (this.head) return { data: null, error: null, count, status: 200 };
          const sp = selectParts(this.selectCols);
          const data = await raw(`SELECT ${sp.fields} FROM ${t} ${sp.joins} ${where} ${order} ${page}`);
          return { data, error: null, count, status: 200 };
        }
        const sp = selectParts(this.selectCols);
        const data = await raw(`SELECT ${sp.fields} FROM ${t} ${sp.joins} ${where} ${order} ${page}`);
        if (this.singleMode === 'single' && (!data || data.length === 0)) {
          return { data: null, error: { message: 'No rows found', code: 'PGRST116' }, count: null, status: 406 };
        }
        if (this.singleMode) return { data: data && data.length ? data[0] : null, error: null, count: null, status: 200 };
        return { data: data || [], error: null, count: null, status: 200 };
      }

      if (this.op === 'insert' || this.op === 'upsert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (!rows.length) return { data: null, error: null, count: null, status: 200 };
        const cols = Object.keys(rows[0]);
        const values = rows.map(r => `(${cols.map(c => lit(r[c] === undefined ? null : r[c])).join(', ')})`).join(', ');
        let conflict = '';
        if (this.op === 'upsert') {
          // supabase-js defaults onConflict to the primary key when omitted;
          // an arbitrary first-payload-key target is never valid.
          const keys = (this.onConflict && String(this.onConflict).split(',').map(k => k.trim()).filter(Boolean)) || ['id'];
          const sets = cols.filter(c => !keys.includes(c)).map(c => `${ident(c)} = EXCLUDED.${ident(c)}`);
          conflict = `ON CONFLICT (${keys.map(ident).join(', ')}) DO UPDATE SET ${sets.join(', ') || `${ident(cols[0])} = EXCLUDED.${ident(cols[0])}`}`;
        }
        if (hasEmbedded(this.selectCols)) {
          const sp = selectParts(this.selectCols, '__r');
          const data = await raw(`WITH __r AS (INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${values} ${conflict} RETURNING *) SELECT ${sp.fields} FROM __r ${sp.joins} ${this.limitN != null ? `LIMIT ${this.limitN}` : ''}`);
          return { data: this.singleMode ? (data && data.length ? data[0] : null) : data, error: null, count: null, status: 201 };
        }
        const data = await raw(`INSERT INTO ${t} (${cols.map(ident).join(', ')}) VALUES ${values} ${conflict} RETURNING ${returnCols(this.selectCols)}`);
        if (this.singleMode) return { data: data && data.length ? data[0] : null, error: null, count: null, status: 201 };
        return { data, error: null, count: null, status: 201 };
      }

      if (this.op === 'update') {
        if (!this.wheres.length) throw new Error('pgCompat: update() without WHERE refused');
        const sets = Object.entries(this.payload).map(([c, v]) => `${ident(c)} = ${lit(v === undefined ? null : v)}`).join(', ');
        if (hasEmbedded(this.selectCols)) {
          // supabase returns .select('*, rel:table(...)') after update — emulate via CTE
          const sp = selectParts(this.selectCols, '__r');
          const data = await raw(`WITH __r AS (UPDATE ${t} SET ${sets} ${where} RETURNING *) SELECT ${sp.fields} FROM __r ${sp.joins} ${this.limitN != null ? `LIMIT ${this.limitN}` : ''}`);
          return { data: this.singleMode ? (data && data.length ? data[0] : null) : data, error: null, count: null, status: 200 };
        }
        const data = await raw(`UPDATE ${t} SET ${sets} ${where} RETURNING ${returnCols(this.selectCols)}`);
        return { data, error: null, count: null, status: 200 };
      }

      if (this.op === 'delete') {
        if (!this.wheres.length) throw new Error('pgCompat: delete() without WHERE refused');
        const data = await raw(`DELETE FROM ${t} ${where} RETURNING *`);
        return { data, error: null, count: null, status: 204 };
      }

      throw new Error(`pgCompat: unknown op ${this.op}`);
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code }, count: null, status: 500 };
    }
  }
}

// ── storage: chat media lives in the media_files table (Supabase Storage replacement) ──
function publicBaseUrl() {
  return process.env.PUBLIC_BASE_URL || 'https://nyasadesk.com';
}

class PgBucket {
  constructor(bucket) { this.bucket = bucket; }
  async upload(path, data, opts = {}) {
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const mime = opts.contentType || 'application/octet-stream';
      const b64 = buf.toString('base64');
      const rows = await raw(
        `INSERT INTO media_files (bucket, path, mime, size, data)
         VALUES (${lit(this.bucket)}, ${lit(path)}, ${lit(mime)}, ${buf.length}, ${lit(b64)})
         ON CONFLICT (bucket, path) DO UPDATE
           SET data = EXCLUDED.data, mime = EXCLUDED.mime, size = EXCLUDED.size
         RETURNING id`);
      return { data: { path: this.bucket + '/' + path, id: rows[0]?.id }, error: null };
    } catch (e) {
      return { data: null, error: { message: 'storage upload failed: ' + e.message } };
    }
  }
  async remove(path) {
    try {
      await raw(`DELETE FROM media_files WHERE bucket = ${lit(this.bucket)} AND path = ${lit(path)}`);
      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }
  getPublicUrl(path) {
    return { data: { publicUrl: `${publicBaseUrl()}/api/storage/object/${this.bucket}/${path}` } };
  }
}

class PgClient {
  from(table) { return new Builder(table); }
  get storage() {
    return {
      from: (bucket) => new PgBucket(bucket),
    };
  }
  // supabase-js .auth.getUser() parity: the frontend sends the Better Auth
  // session token as a Bearer token (billing.js / team.js / adminAuth.js
  // verify callers through this). Resolves the token against the self-hosted
  // Better Auth instance instead of Supabase Auth.
  get auth() {
    return {
      getUser: async (token) => {
        try {
          // BA cookie value = "<sessionToken>.<HMAC-SHA256(secret, token) in base64>"
          // (the sign-in response body exposes the raw token only).
          const { createHmac } = await import('crypto');
          const sig = createHmac('sha256', process.env.BETTER_AUTH_SECRET || '')
            .update(String(token)).digest('base64');
          const { auth } = await import('./betterAuth.js');
          const headers = new Headers();
          // BA reads "__Secure-better-auth.session_token" in production (https
          // baseURL) and the bare name in dev — provide both so either matches.
          const cv = `${token}.${sig}`;
          headers.append('cookie', `__Secure-better-auth.session_token=${cv}; better-auth.session_token=${cv}`);
          const s = await auth.api.getSession({ headers });
          if (!s?.user) return { data: { user: null }, error: { message: 'Invalid or expired session' } };
          return { data: { user: s.user }, error: null };
        } catch (e) {
          return { data: { user: null }, error: { message: e.message } };
        }
      },
      // supabase-js .auth.admin parity for the handful of calls NyasaDesk's
      // api/ layer makes (team invites, admin user management). There's no
      // separate "auth.users" schema here — accounts live in Better Auth's
      // own public.user / public.account / public.verification tables, so
      // these build invite/recovery links + manage users directly against
      // those, using the SAME Builder (this.from) as everything else.
      admin: {
        // Proxy for last_sign_in_at: BA doesn't track sign-in timestamps, so
        // "has a credential account" (set during onboarding/reset-password)
        // is used as the signal for "has completed signup" — that's the only
        // thing team.js/TeamSection actually check (never_signed_in).
        getUserById: async (id) => {
          try {
            const { data: u } = await this.from('user').select('id, email, createdAt').eq('id', id).maybeSingle();
            if (!u) return { data: { user: null }, error: { message: 'User not found' } };
            const { data: acct } = await this.from('account').select('createdAt')
              .eq('userId', id).eq('providerId', 'credential').order('createdAt', { ascending: true }).maybeSingle();
            return {
              data: { user: {
                id: u.id, email: u.email, created_at: u.createdAt,
                last_sign_in_at: acct?.createdAt || null,
              } },
              error: null,
            };
          } catch (e) {
            return { data: { user: null }, error: { message: e.message } };
          }
        },
        // type: 'invite' creates the user if they don't exist yet (team invites);
        // any other type (e.g. 'recovery') requires an existing user. Either way
        // this writes a public.verification row with identifier
        // "reset-password:<token>" — the EXACT format Better Auth's own
        // /api/auth/reset-password/:token endpoint expects — so the emailed
        // link lands the recipient on the same set-password flow real password
        // resets use (and, for brand-new invited users, creates their
        // credential account on first submit — see better-auth's resetPassword).
        generateLink: async ({ type, email, options = {} } = {}) => {
          try {
            if (!email) return { data: null, error: { message: 'email is required' } };
            const { data: existingUser } = await this.from('user').select('id, email').eq('email', email).maybeSingle();
            let userRow = existingUser;
            if (!userRow) {
              if (type !== 'invite') return { data: null, error: { message: 'User not found' } };
              const { randomUUID } = await import('crypto');
              const name = options?.data?.full_name || email.split('@')[0];
              const { data: created, error: cErr } = await this.from('user').insert({
                id: randomUUID(), name, email, emailVerified: false,
                createdAt: new Date(), updatedAt: new Date(),
              }).select('id, email').single();
              if (cErr) throw new Error(cErr.message);
              userRow = created;
            }
            const { randomBytes, randomUUID: vUUID } = await import('crypto');
            const token = randomBytes(24).toString('hex');
            const expiresAt = new Date(Date.now() + (type === 'invite' ? 24 : 1) * 60 * 60 * 1000);
            const { error: vErr } = await this.from('verification').insert({
              id: vUUID(), identifier: `reset-password:${token}`, value: userRow.id,
              expiresAt, createdAt: new Date(), updatedAt: new Date(),
            });
            if (vErr) throw new Error(vErr.message);
            const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://nyasadesk.com';
            const callbackURL = options.redirectTo || `${site}/`;
            const action_link = `${site}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callbackURL)}`;
            return { data: { user: userRow, properties: { action_link } }, error: null };
          } catch (e) {
            return { data: null, error: { message: e.message } };
          }
        },
        deleteUser: async (id) => {
          try {
            await this.from('session').delete().eq('userId', id);
            await this.from('account').delete().eq('userId', id);
            await this.from('verification').delete().eq('value', id); // best-effort: pending tokens
            const { error } = await this.from('user').delete().eq('id', id);
            if (error) throw new Error(error.message);
            return { data: null, error: null };
          } catch (e) {
            return { data: null, error: { message: e.message } };
          }
        },
      },
    };
  }
  async rpc(fn, params = {}) {
    try {
      const args = Object.entries(params).map(([k, v]) => `${lit(v)}`).join(', ');
      const rows = await raw(`SELECT * FROM ${ident(fn)}(${args})`);
      if (rows.length === 1 && Object.keys(rows[0]).length === 1) return { data: rows[0][Object.keys(rows[0])[0]], error: null };
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }
}

export function createPgClient() { return new PgClient(); }
export { raw as pgRaw };
