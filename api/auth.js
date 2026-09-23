// Better Auth endpoints: /api/auth/sign-in/email, /get-session, etc.
// This Vercel account's zero-config builder skips bracket-path functions, so
// the catch-all arrives as a rewrite: /api/auth/(.*) -> /api/auth?path=$1
// (see vercel.json). We restore the original URL before handing to BA.
import { toNodeHandler } from 'better-auth/node';
import { auth } from './_lib/betterAuth.js';

const handler = toNodeHandler(auth.handler);

export default async function (req, res) {
  const p = req.query && req.query.path;
  if (p) {
    const sub = Array.isArray(p) ? p.join('/') : String(p);
    req.url = '/api/auth/' + sub.replace(/^\/+/, '');
  }
  return handler(req, res);
};
