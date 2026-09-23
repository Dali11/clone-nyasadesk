// ═══════════════════════════════════════════════════════════════════════════
// NyasaDesk client facade (phase 3b — Supabase → Neon migration)
//
// Drop-in replacement for the supabase-js client. All existing imports of
// `supabase` keep working unchanged:
//   .auth.*      → self-hosted Better Auth (/api/auth/*), cookie sessions
//   .from(t)     → generic data endpoint (/api/data) with server-side
//                  workspace enforcement (replaces Supabase RLS)
//   .channel(t)  → snapshot-diff polling (replaces Supabase Realtime)
//   .storage     → still the real Supabase client (until the storage phase)
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';

// Storage stays on Supabase until the dedicated storage phase.
// Lazy: only construct the legacy client when .storage is actually used
// (avoids spinning up realtime transports on every page load).
const _legacy = { client: null };
function legacyClient() {
  if (!_legacy.client) {
    _legacy.client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _legacy.client;
}

const AUTH_BASE = '/api/auth';

// ── helpers ──────────────────────────────────────────────────────────────────
async function authFetch(path, opts = {}) {
  const r = await fetch(AUTH_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let body = null;
  try { body = await r.json(); } catch (_) { /* empty body (sign-out) */ }
  if (!r.ok) {
    const msg = body?.message || body?.error || 'Request failed';
    throw Object.assign(new Error(msg), { status: r.status, body });
  }
  return body;
}

function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: u.createdAt,
    last_sign_in_at: u.updatedAt || u.createdAt,
    user_metadata: { full_name: u.name, name: u.name, avatar_url: u.image },
    app_metadata: {},
  };
}
function mapSession(s) {
  if (!s) return null;
  return {
    access_token: s.token,
    token_type: 'bearer',
    expires_at: s.expiresAt ? Math.floor(new Date(s.expiresAt).getTime() / 1000) : null,
    expires_in: s.expiresAt ? Math.max(0, Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 1000)) : null,
    user: mapSessionUser(s.user),
  };
}
function mapSessionUser(u) {
  if (!u) return null;
  return { ...mapUser(u), id: u.id, email: u.email };
}

// ── auth facade ──────────────────────────────────────────────────────────────
let cachedSession = null;
const authListeners = new Set();

function notify(event, session) {
  for (const cb of authListeners) { try { cb(event, session); } catch (_) {} }
}

const authFacade = {
  async getSession() {
    try {
      const s = await authFetch('/get-session');
      const session = s?.session ? mapSession({ token: s.session.token, expiresAt: s.session.expiresAt, user: s.user || s.session.user }) : null;
      cachedSession = session;
      return { data: { session }, error: null };
    } catch (e) {
      if (e.status === 401) { cachedSession = null; return { data: { session: null }, error: null }; }
      return { data: { session: null }, error: { message: e.message } };
    }
  },
  async getUser() {
    const { data: { session } } = await authFacade.getSession();
    return { data: { user: session?.user ?? null }, error: null };
  },
  async refreshSession() {
    return authFacade.getSession();
  },
  async signInWithPassword({ email, password }) {
    try {
      const body = await authFetch('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });
      const session = mapSession({ token: body.token, expiresAt: body.user?.createdAt, user: body.user });
      cachedSession = session;
      notify('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },
  async signUp({ email, password, options }) {
    try {
      const name = options?.data?.full_name || options?.data?.name || email.split('@')[0];
      const body = await authFetch('/sign-up/email', { method: 'POST', body: JSON.stringify({ email, password, name }) });
      const session = body.token ? mapSession({ token: body.token, expiresAt: null, user: body.user }) : null;
      cachedSession = session;
      notify('SIGNED_IN', session);
      return { data: { session, user: session?.user ?? null }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: { message: e.message } };
    }
  },
  async signOut() {
    try { await authFetch('/sign-out', { method: 'POST' }); } catch (_) {}
    cachedSession = null;
    notify('SIGNED_OUT', null);
    return { error: null };
  },
  async updateUser({ password }) {
    // supabase-style password change: only the new password is supplied
    try {
      const r = await fetch('/api/password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || `Password update failed (${r.status})`); }
      return { data: { user: cachedSession?.user ?? null }, error: null };
    } catch (e) {
      return { data: { user: null }, error: { message: e.message } };
    }
  },
  async resetPasswordForEmail(email, opts) {
    try {
      const redirectTo = opts?.redirectTo || (typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : '/reset-password');
      await authFetch('/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo }) });
      return { data: {}, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  },
  async signInWithOAuth() {
    return { data: null, error: { message: 'Google sign-in is temporarily unavailable — please use email and password.' } };
  },
  onAuthStateChange(callback) {
    authListeners.add(callback);
    // keep listeners in sync with cookie sessions (poll; better-auth has no push)
    const iv = setInterval(async () => {
      const { data: { session } } = await authFacade.getSession().catch(() => ({ data: { session: cachedSession } }));
      const oldToken = cachedSession?.access_token;
      if (session && (!oldToken || oldToken !== session.access_token)) notify('SIGNED_IN', session);
      else if (!session && oldToken) notify('SIGNED_OUT', null);
    }, 15000);
    return { data: { subscription: { unsubscribe: () => { authListeners.delete(callback); clearInterval(iv); } } } };
  },
};

// ── data facade (supabase-js-style builder → /api/data) ─────────────────────
function buildFrom(table) {
  const state = { table, action: 'select', select: '*', filters: [], order: [], limit: null, offset: null, single: false, maybeSingle: false, payload: null, onConflict: null };

  const addFilter = (op) => (...args) => { state.filters.push({ op, args }); return b; };
  const b = {
    select(cols) { if (cols) state.select = cols; return b; },
    insert(payload) { state.action = 'insert'; state.payload = payload; return b; },
    upsert(payload, opts) { state.action = 'upsert'; state.payload = payload; state.onConflict = opts?.onConflict || 'id'; return b; },
    update(payload) { state.action = 'update'; state.payload = payload; return b; },
    delete() { state.action = 'delete'; return b; },
    eq: addFilter('eq'), neq: addFilter('neq'), in: addFilter('in'),
    gt: addFilter('gt'), gte: addFilter('gte'), lt: addFilter('lt'), lte: addFilter('lte'),
    like: addFilter('like'), ilike: addFilter('ilike'), or: addFilter('or'),
    order(col, opts) { state.order.push({ col, asc: opts?.ascending !== false }); return b; },
    limit(n) { state.limit = n; return b; },
    range(from, to) { state.offset = from; state.limit = to - from + 1; return b; },
    single() { state.single = true; return b; },
    maybeSingle() { state.maybeSingle = true; return b; },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
  };

  async function execute() {
    const r = await fetch('/api/data', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: state.table, action: state.action, select: state.select,
        filters: state.filters, order: state.order, limit: state.limit, offset: state.offset,
        single: state.single, maybeSingle: state.maybeSingle,
        payload: state.payload, onConflict: state.onConflict,
      }),
    });
    let body;
    try { body = await r.json(); } catch (_) { body = { error: 'Invalid response' }; }
    if (r.status === 401 && typeof window !== 'undefined') { notify('SIGNED_OUT', null); }
    if (!r.ok) return { data: null, error: { message: body?.error || `Request failed (${r.status})` } };
    // single/maybeSingle semantics: data is the row (or null), not an array
    if ((state.single || state.maybeSingle) && Array.isArray(body.data)) {
      body.data = body.data[0] ?? null;
      if (state.single && body.data === null) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: body.data ?? null, error: body.error ? { message: body.error.message || body.error } : null };
  }

  return b;
}

// ── realtime facade: snapshot-diff polling ─────────────────────────────────
const activeChannels = new Map();

function parsePgFilter(filter) {
  // 'workspace_id=eq.abc' → ['workspace_id', 'eq', 'abc']
  const m = /^([a-z_]+)=(eq|neq|gt|gte|lt|lte)\.(.+)$/i.exec(filter || '');
  if (!m) return null;
  return { col: m[1], op: m[2], val: m[3] };
}

function makeChannel(name) {
  const subs = [];
  const state = { timer: null, snapshots: new Map() };
  const ch = {
    on(type, cfg, cb) { if (type === 'postgres_changes' && typeof cb === 'function') subs.push({ cfg, cb }); return ch; },
    subscribe(statusCb) {
      const interval = 4000;
      const poll = async () => {
        for (const { cfg, cb } of subs) {
          try {
            const f = parsePgFilter(cfg.filter);
            const r = await fetch('/api/data', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: cfg.table, action: 'select', select: '*', filters: f ? [{ op: f.op, args: [f.col, f.val] }] : [], limit: 200 }),
            });
            if (!r.ok) continue;
            const body = await r.json();
            const rows = Array.isArray(body.data) ? body.data : [];
            const prev = state.snapshots.get(cfg.table + (cfg.filter || '')) || new Map();
            const next = new Map(rows.map(row => [row.id, JSON.stringify(row)]));
            for (const [id, json] of next) {
              if (!prev.has(id)) { try { cb({ new: JSON.parse(json), eventType: 'INSERT' }); } catch (_) {} }
              else if (prev.get(id) !== json) { try { cb({ new: JSON.parse(json), eventType: 'UPDATE' }); } catch (_) {} }
            }
            for (const id of prev.keys()) if (!next.has(id)) { try { cb({ old: { id }, eventType: 'DELETE' }); } catch (_) {} }
            state.snapshots.set(cfg.table + (cfg.filter || ''), next);
          } catch (_) { /* transient network errors are fine */ }
        }
      };
      poll();
      state.timer = setInterval(poll, interval);
      try { statusCb?.('SUBSCRIBED'); } catch (_) {}
      return ch;
    },
    unsubscribe() { if (state.timer) clearInterval(state.timer); activeChannels.delete(name); },
  };
  activeChannels.set(name, ch);
  return ch;
}

export const supabase = {
  auth: authFacade,
  from: buildFrom,
  channel: makeChannel,
  removeChannel(ch) { try { ch?.unsubscribe?.(); } catch (_) {} return ch; },
  removeAllChannels() { for (const ch of activeChannels.values()) { try { ch.unsubscribe(); } catch (_) {} } activeChannels.clear(); },
  get storage() { return legacyClient().storage; },
};
