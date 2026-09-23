// Better Auth endpoints: /api/auth/sign-in/email, /get-session, etc.
// This Vercel account's zero-config builder skips bracket-path functions, so
// the catch-all arrives as a rewrite: /api/auth/(.*) -> /api/auth?path=$1
// (see vercel.json). We restore the original URL before handing to BA.
import { toNodeHandler } from 'better-auth/node';
import { auth } from './_lib/betterAuth.js';

const handler = toNodeHandler(auth.handler);

export default async function (req, res) => {
  const p = req.query && req.query.path;
  if (p) {
    const sub = (Array.isArray(p) ? p.join('/') : String(p)).replace(/^\/+/, '');
    // Rebuild the full original URL, keeping every query param EXCEPT our
    // internal `path` one. BA's password-reset email links carry the user to
    // GET /api/auth/reset-password/<token>?callbackURL=<spa url>, which
    // redirects to the SPA with the token — dropping callbackURL broke the
    // whole reset flow at the email click.
    const q = { ...req.query };
    delete q.path;
    const qs = new URLSearchParams(q).toString();
    req.url = '/api/auth/' + sub + (qs ? '?' + qs : '');
  }
  return handler(req, res);
};
