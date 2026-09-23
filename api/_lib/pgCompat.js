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

function colList(cols) {
  if (!cols || cols === '*') return '*';
  return cols.split(',').map(c => c.trim()).map(c => c.includes('.') && !c.includes('(') ? c : ident(c)).join(', ');
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
    this.op = 'select';
    this.selectCols = typeof cols === 'string' ? cols : '*';
    if (opts.count === 'exact') this.countMode = true;
    if (opts.head) this.head = true;
    return this;
  }
  insert(data, opts = {}) { this.op = 'insert'; this.payload = data; this.onConflict = opts.onConflict; return this; }
  upsert(data, opts = {}) { this.op = 'upsert'; this.payload = data; this.onConflict = opts.onConflict; return this; }
  update(data) { this.op = 'update'; this.payload = data; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c, v) { this.wheres.push(`${ident(c)} = ${lit(v)}`); return this; }
  neq(c, v) { this.wheres.push(`${ident(c)} <> ${lit(v)}`); return this; }
  in(c, arr) { this.wheres.push(`${ident(c)} IN (${(arr || []).map(lit).join(', ')})`); return this; }
  gt(c, v) { this.wheres.push(`${ident(c)} > ${lit(v)}`); return this; }
  gte(c, v) { this.wheres.push(`${ident(c)} >= ${lit(v)}`); return this; }
  lt(c, v) { this.wheres.push(`${ident(c)} < ${lit(v)}`); return this; }
  lte(c, v) { this.wheres.push(`${ident(c)} <= ${lit(v)}`); return this; }
  like(c, v) { this.wheres.push(`${ident(c)} LIKE ${lit(v)}`); return this; }
  ilike(c, v) { this.wheres.push(`${ident(c)} ILIKE ${lit(v)}`); return this; }
  or(expr) {
    // supabase .or('a.eq.1,b.eq.2') — comma-separated OR conditions
    const parts = String(expr).split(',').map(cond => {
      const m = cond.match(/^([a-zA-Z_]+)\.(eq|neq|gt|gte|lt|lte|like)\.(.+)$/);
      if (!m) throw new Error(`pgCompat: unsupported .or() condition "${cond}"`);
      const [, c, op, rawV] = m;
      const v = rawV === 'null' ? null : rawV;
      const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op] || (op === 'like' ? 'LIKE' : '=');
      return `${ident(c)} ${sym} ${lit(v)}`;
    });
    this.wheres.push(`(${parts.join(' OR ')})`);
    return this;
  }
  order(c, opts = {}) {
    this.orders.push(`${ident(c)} ${opts.ascending === false ? 'DESC' : 'ASC'}`);
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
    const t = ident(this.table);
    const where = this.wheres.length ? `WHERE ${this.wheres.join(' AND ')}` : '';
    const order = this.orders.length ? `ORDER BY ${this.orders.join(', ')}` : '';
    const page = `${this.limitN != null ? `LIMIT ${this.limitN}` : ''} ${this.offsetN != null ? `OFFSET ${this.offsetN}` : ''}`.trim();

    try {
      if (this.op === 'select') {
        if (this.countMode) {
          const rows = await raw(`SELECT count(*)::int AS c FROM ${t} ${where}`);
          const count = rows[0].c;
          if (this.head) return { data: null, error: null, count, status: 200 };
          const data = await raw(`SELECT ${colList(this.selectCols)} FROM ${t} ${where} ${order} ${page}`);
          return { data, error: null, count, status: 200 };
        }
        const data = await raw(`SELECT ${colList(this.selectCols)} FROM ${t} ${where} ${order} ${page}`);
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
          const keys = (this.onConflict && String(this.onConflict).split(',')) || [cols[0]];
          const sets = cols.filter(c => !keys.includes(c)).map(c => `${ident(c)} = EXCLUDED.${ident(c)}`);
          conflict = `ON CONFLICT (${keys.map(ident).join(', ')}) DO UPDATE SET ${sets.join(', ') || `${ident(cols[0])} = EXCLUDED.${ident(cols[0])}`}`;
        }
        const data = await raw(`INSERT INTO ${t} (${cols.map(ident).join(', ')}) VALUES ${values} ${conflict} RETURNING *`);
        return { data, error: null, count: null, status: 201 };
      }

      if (this.op === 'update') {
        if (!this.wheres.length) throw new Error('pgCompat: update() without WHERE refused');
        const sets = Object.entries(this.payload).map(([c, v]) => `${ident(c)} = ${lit(v === undefined ? null : v)}`).join(', ');
        const data = await raw(`UPDATE ${t} SET ${sets} ${where} RETURNING *`);
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
          headers.append('cookie', `better-auth.session_token=${token}.${sig}`);
          const s = await auth.api.getSession({ headers });
          if (!s?.user) return { data: { user: null }, error: { message: 'Invalid or expired session' } };
          return { data: { user: s.user }, error: null };
        } catch (e) {
          return { data: { user: null }, error: { message: e.message } };
        }
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
