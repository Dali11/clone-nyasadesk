# NyasaDesk → Neon cutover runbook (2026-09-23)

Everything is verified on the `neon-migration` branch (previews deployed, all
E2E suites green: api 12/12, auth 6/6, shim 18/18, storage 14/14, auth-compat 6/6).
Production still runs Supabase. This is the flip procedure.

## Preconditions (owner)

1. **DNS:** the two `vc-domain-verify` TXT records for `_vercel.nyasadesk.com`
   and `_vercel.www.nyasadesk.com` added at the Namecheap panel (values in the
   owner's For-you note). Verify from this repo workspace with
   `dig TXT _vercel.nyasadesk.com +short`.
2. **Neon plan:** upgrade the Neon project to Launch (~$15/mo) — free tier
   compute suspension is not right for production. DB usage today: ~300 MB
   (data + 145 MB media_files), 848 files.

## Flip steps (agent)

1. `git merge neon-migration → main` and push main. Trigger the production
   deploy via the Vercel API (webhook deploys arrive BLOCKED — known quirk).
2. Set `DATA_BACKEND=neon` on the project (production target). NEON_CONNECTION_STRING,
   BETTER_AUTH_SECRET, PUBLIC_BASE_URL are already set for production+preview.
3. Smoke-verify nyasadesk.vercel.app: sign-in, a conversation loads, an image
   renders via /api/storage/object/, send a test message.
4. Remove the nyasadesk.com domain from the OLD chibondo.arthur project, add
   it to this project, confirm the TXT verification passes, wait for DNS.
5. Verify https://nyasadesk.com end-to-end (sign-in, inbox, media, billing page).
6. Update the WhatsApp/Telegram/PayChangu webhook URLs if they reference the
   domain (they resolve to the new deployment automatically once DNS flips).

## Rollback

- Before real usage accumulates: unset `DATA_BACKEND` → api layer returns to
  Supabase instantly (frontend/auth/storage follow). Zero-loss rollback.
- AFTER usage: Neon-only writes would be lost by rollback. Treat the flip as
  one-way once real traffic lands; if needed, re-mirror Neon→Supabase first.

## Post-flip (after ~1 week stable)

- Cancel Supabase Pro (~$25/mo saved).
- Optional cleanup: delete dead `src/lib/messageSearch.js` (unused, still
  references Supabase), and reconnect the Vercel GitHub integration so webhook
  deploys work again.
