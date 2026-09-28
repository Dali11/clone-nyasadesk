// ─────────────────────────────────────────────────────────────────────────────
// server.js — self-hosted replacement for the Vercel runtime (Coolify/Docker)
//
// Replicates exactly what Vercel does for this app (see vercel.json):
//   1. Function routing:  /api/<path> → api/<path>.js | api/<path>/index.js
//   2. Rewrites:          /api/auth/(.*)        → /api/auth?path=$1
//                         /api/storage/object/(.*) → /api/storage/object?path=$1
//   3. Static files:      dist/<path> (filesystem wins over rewrites, like Vercel)
//   4. SPA fallback:      anything else → dist/index.html (the /(.*) rewrite)
//
// Vercel function-runtime emulation:
//   - req.query   parsed from the (rewritten) URL, repeated keys → arrays
//   - req.body    JSON-parsed body (undefined when not JSON), except for
//                 handlers that opt out via `export const config.api.bodyParser
//                 = false` (billing.js, webhooks) — those get the raw stream.
//   - res.status().json()/.send()/.redirect() Express-style helpers.
//
// Env: PORT (default 3000). All other env vars are the same as Vercel's.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'http';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 4_500_000; // Vercel's default function body limit

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
  '.csv': 'text/csv', '.xml': 'application/xml', '.zip': 'application/zip',
};

// ── Function loader with dev-friendly cache ─────────────────────────────────
const handlerCache = new Map(); // file → { mtimeMs, module }
async function loadHandler(file) {
  try {
    const stat = await fs.promises.stat(file);
    const cached = handlerCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.module;
    const module = await import(pathToFileURL(file));
    handlerCache.set(file, { mtimeMs: stat.mtimeMs, module });
    return module;
  } catch {
    return null;
  }
}
function pathToFileURL(f) {
  const resolved = path.resolve(f).replaceAll('\\', '/');
  return 'file://' + encodeURI(resolved).replaceAll('#', '%23').replaceAll('?', '%3F');
}

// Resolve /api/<a>/<b> → api/a/b.js | api/a/b/index.js  (Vercel file routing)
async function resolveApiFile(urlPath) {
  // Strip the leading '/api' — candidates are relative to the api/ dir
  const rel = urlPath.replace(/^\/api\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const base = path.join(__dirname, 'api', ...rel.split('/'));
  const candidates = [base + '.js', path.join(base, 'index.js'), base];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    const st = fs.statSync(c);
    if (st.isFile()) return c;
  }
  return null;
}

// ── Body buffering + Vercel-style req/res shims ─────────────────────────────
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY_BYTES) { reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { req.destroy(); reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseQuery(search) {
  const q = {};
  if (!search) return q;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [k, v] of params) {
    if (k in q) {
      if (!Array.isArray(q[k])) q[k] = [q[k]];
      q[k].push(v);
    } else q[k] = v;
  }
  return q;
}

// Build a Vercel-like req: a real Readable stream re-emitting the buffered
// body (so raw-stream handlers work), plus .query and .body.
function makeShimReq(nativeReq, rawBody, url, query) {
  const isHttps = (nativeReq.headers['x-forwarded-proto'] || '').includes('https');
  let body = undefined;
  const ctype = String(nativeReq.headers['content-type'] || '').toLowerCase();
  if (rawBody.length && (ctype.includes('application/json') || ctype.includes('application/x-www-form-urlencoded') || ctype === '')) {
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { /* Vercel leaves body undefined on bad JSON */ }
  }
  const shim = new Readable({ read() { if (rawBody.length) this.push(rawBody); this.push(null); } });
  shim.method = nativeReq.method;
  shim.url = url;
  shim.headers = nativeReq.headers;
  shim.query = query;
  shim.body = body;
  // Exact raw request bytes (utf8) for signature verification (Meta webhooks
  // sign the RAW payload; JSON.stringify(req.body) is NOT byte-stable vs wire
  // format, which caused valid Meta deliveries to fail signature checks).
  shim.rawBody = body === undefined ? undefined : rawBody.toString('utf8');
  shim.httpVersion = nativeReq.httpVersion;
  shim.rawHeaders = nativeReq.rawHeaders;
  shim.socket = nativeReq.socket; // keep the real socket (encrypted, remoteAddress)
  return shim;
}

function makeShimRes(nativeRes) {
  if (!nativeRes.status) nativeRes.status = (code) => { nativeRes.statusCode = code; return nativeRes; };
  if (!nativeRes.json) nativeRes.json = (obj) => {
    if (!nativeRes.headersSent) nativeRes.setHeader('Content-Type', 'application/json');
    nativeRes.end(JSON.stringify(obj));
  };
  if (!nativeRes.send) nativeRes.send = (body) => {
    if (body === undefined || body === null) return nativeRes.end();
    const b = Buffer.isBuffer(body) ? body : typeof body === 'object' ? JSON.stringify(body) : String(body);
    nativeRes.end(b);
  };
  if (!nativeRes.redirect) nativeRes.redirect = (url, code = 307) => {
    nativeRes.statusCode = code;
    nativeRes.setHeader('Location', url);
    nativeRes.end();
  };
  return nativeRes;
}

// ── Static serving ───────────────────────────────────────────────────────────
function serveStatic(res, filePath, isSPAfallback = false) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    if (!res.headersSent) {
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      if (!isSPAfallback) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // vite assets are hashed
    }
    res.end(data);
  });
}

// ── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(u.pathname);

  try {
    // 1) Vercel rewrites — BUT Vercel's real precedence is filesystem FIRST,
    // rewrite as fallback: an actual file like api/auth/whatsapp-embedded.js
    // wins over the generic "/api/auth/(.*) -> /api/auth?path=$1" rewrite in
    // vercel.json. (Bug fixed 2026-09-28: this used to apply the rewrite
    // unconditionally, so api/auth/whatsapp-embedded.js and
    // api/auth/facebook-callback.js were unreachable — every request landed
    // on the better-auth catch-all in api/auth.js and 404'd.)
    let apiUrl = null;
    let handlerFile = null;
    if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
      const sub = pathname.slice('/api/auth'.length).replace(/^\/+/, '');
      if (sub) {
        const directFile = await resolveApiFile('/api/auth/' + sub);
        if (directFile) {
          return await dispatch(directFile, u.pathname + u.search, parseQuery(u.search), req, res);
        }
      }
      const q = parseQuery(u.search);
      if (sub) q.path = sub;
      const qs = new URLSearchParams(q).toString();
      apiUrl = '/api/auth' + (qs ? '?' + qs : '');
      handlerFile = path.join(__dirname, 'api', 'auth.js');
      const q2 = parseQuery('?' + qs);
      return await dispatch(handlerFile, apiUrl, q2, req, res);
    }
    if (pathname.startsWith('/api/storage/object/')) {
      const sub = pathname.slice('/api/storage/object/'.length);
      const q = parseQuery(u.search);
      q.path = sub;
      const qs = new URLSearchParams(q).toString();
      apiUrl = '/api/storage/object' + (qs ? '?' + qs : '');
      handlerFile = path.join(__dirname, 'api', 'storage', 'object.js');
      const q2 = parseQuery('?' + qs);
      return await dispatch(handlerFile, apiUrl, q2, req, res);
    }

    // 2) Direct function routing
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      handlerFile = await resolveApiFile(pathname);
      console.log('[debug] api route', pathname, '->', handlerFile);
      if (handlerFile) {
        return await dispatch(handlerFile, u.pathname + u.search, parseQuery(u.search), req, res);
      }
      // Vercel parity: unmatched /api/* falls through to the SPA rewrite
    }

    // 3) Static files (filesystem wins over the /(.*) rewrite)
    const staticPath = path.join(DIST, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    if (!staticPath.startsWith(DIST) && !staticPath.startsWith(DIST + '/')) { res.statusCode = 403; res.end('Forbidden'); return; }
    if (staticPath !== path.join(DIST, 'index.html') && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      return serveStatic(res, staticPath);
    }

    // 4) SPA fallback (the /(.*) → /index.html rewrite)
    return serveStatic(res, path.join(DIST, 'index.html'), true);
  } catch (e) {
    console.error('[server] unhandled error:', e);
    if (!res.headersSent) { res.statusCode = e.statusCode || 500; }
    if (!res.writableEnded) res.end(JSON.stringify({ error: e.message || 'Internal server error' }));
  }
});

async function dispatch(handlerFile, url, query, nativeReq, nativeRes) {
  const mod = await loadHandler(handlerFile);
  const fn = mod?.default;
  if (typeof fn !== 'function') { nativeRes.statusCode = 500; nativeRes.end('Handler missing default export'); return; }

  const bodyParserOff = mod?.config?.api?.bodyParser === false;
  const raw = bodyParserOff ? Buffer.alloc(0) : await readRawBody(nativeReq);
  // bodyParser:false handlers stream the raw body themselves:
  if (bodyParserOff) {
    // re-emit: hand them a stream containing the original body
    const rawBuf = await readRawBody(nativeReq);
    const shim = makeShimReq(nativeReq, rawBuf, url, query);
    shim.body = undefined;
    return fn(shim, makeShimRes(nativeRes));
  }
  const shim = makeShimReq(nativeReq, raw, url, query);
  await fn(shim, makeShimRes(nativeRes));
}

server.listen(PORT, () => console.log(`[nyasadesk] self-hosted server listening on :${PORT}`));
