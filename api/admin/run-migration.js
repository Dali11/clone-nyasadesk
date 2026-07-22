// ONE-TIME migration runner — DELETE after use
// Secured by a secret header to prevent unauthorized access
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIGRATION_SECRET = 'nyasa-migrate-2026-xk9p';

const MIGRATIONS = [
  `ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS webhook_tool_url text`,
  `ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS webhook_tool_secret text`,
  `CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id) on delete cascade,
    owner_id     uuid not null,
    endpoint     text not null,
    subscription jsonb not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON public.push_subscriptions(endpoint)`,
  `CREATE INDEX IF NOT EXISTS push_subscriptions_owner_id_idx ON public.push_subscriptions(owner_id)`,
  `ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY`,
  `DO $policyblock$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='Users can manage own push subscriptions') THEN
       CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
     END IF;
   END $policyblock$`,
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-migration-secret'] !== MIGRATION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const results = [];
  
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    const shortName = sql.trim().slice(0, 60).replace(/\n/g, ' ') + '...';
    
    try {
      // Use the Supabase pg-meta REST API
      // This endpoint is available via the project's own domain
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      
      // PostgREST can't run DDL. Instead use the pg webhook approach:
      // Insert into a special table that has a DDL trigger — but that doesn't exist.
      // 
      // Real approach: Use the Supabase pg-net or pg-cron extension to run DDL.
      // Even simpler: use node-postgres directly with the connection string.
      // The service role JWT password for direct PG is the JWT itself (Supabase quirk).
      
      const { Pool } = await import('pg');
      // Supabase session-mode pooler: user = postgres.{ref}, password = service_role_jwt
      const pool = new Pool({
        host: 'aws-0-af-south-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: `postgres.pfbaepibelomiutlotkn`,
        password: SUPABASE_KEY,
        ssl: { rejectUnauthorized: false },
        max: 1,
        connectionTimeoutMillis: 10000,
      });
      
      await pool.query(sql);
      await pool.end();
      results.push({ index: i, sql: shortName, status: 'ok' });
    } catch(e) {
      results.push({ index: i, sql: shortName, status: 'error', error: e.message });
    }
  }
  
  return res.status(200).json({ results, done: true });
}
