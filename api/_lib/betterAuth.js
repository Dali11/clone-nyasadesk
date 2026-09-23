// Self-hosted Better Auth for NyasaDesk — Supabase Auth replacement.
// - Neon Postgres over HTTP (kysely-neon) so it runs on Vercel serverless.
// - Passwords: bcrypt (same as Supabase) — migrated users' hashes verify as-is.
// - Supabase user UUIDs are preserved, so profiles/workspace data stays intact.
import { betterAuth } from 'better-auth';
import { Kysely } from 'kysely';
import { neon } from '@neondatabase/serverless';
import { NeonDialect } from './neonDialect.mjs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const kysely = new Kysely({
  dialect: new NeonDialect({ neon: neon(process.env.NEON_CONNECTION_STRING) }),
});

// Supabase (bcrypt) and Better Auth (scrypt "salt:hash") coexist during migration.
async function verifyPassword({ hash, password }) {
  hash = String(hash || '');
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash); // Supabase legacy + our new format
  if (hash.includes(':')) { // Better Auth scrypt format
    const { scryptSync, timingSafeEqual } = await import('crypto');
    const [salt, key] = hash.split(':');
    const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    try { return timingSafeEqual(derived, Buffer.from(key, 'hex')); } catch { return false; }
  }
  return false;
}

export const auth = betterAuth({
  database: { db: kysely, type: 'postgres' },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL, // unset on previews → derived from request host
  trustedOrigins: [
    'https://nyasadesk.com', 'https://www.nyasadesk.com',
    'http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173',
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      // Resend — same provider the team-invite emails use.
      const key = process.env.RESEND_API_KEY;
      if (!key) { console.error('[auth] RESEND_API_KEY missing, cannot send reset email'); return; }
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nyasadesk <no-reply@nyasadesk.com>',
          to: [user.email],
          subject: 'Reset your Nyasadesk password',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#13131d">Reset your password</h2>
            <p>Hi ${user.name || 'there'}, we received a request to reset your Nyasadesk password.</p>
            <p><a href="${url}" style="display:inline-block;background:#13131d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
            <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
          </div>`,
        }),
      }).catch(e => console.error('[auth] reset email error:', e.message));
    },
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: verifyPassword,
    },
  },
  advanced: {
    // New sign-ups get UUIDv4 ids, matching the preserved Supabase UUID format.
    database: { generateId: () => randomUUID() },
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days, same as the app's Supabase sessions
    updateAge: 60 * 60 * 24,      // refresh once a day
  },
});
