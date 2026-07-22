// ONE-TIME migration runner — delete after use
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const secret = req.headers['x-migration-secret'];
  if (secret !== 'nyasa-migrate-2026') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const results = [];

  // Migration 1: Add webhook_tool columns to ai_agents
  // We use rpc to run raw SQL via a helper function we create first
  // Actually, let's use the REST API to check columns and use INSERT/UPDATE workaround
  // 
  // Supabase JS client can call rpc() but we need to first CREATE the helper function.
  // Let's do it differently — add a dummy row and see what columns exist.
  
  // The REAL trick: Supabase REST API supports ?columns= for upsert which reveals schema.
  // For DDL we need to use the pg module with the connection string.
  
  // Use pg with Supabase's session pooler (port 5432 on pooler URL)
  // Supabase provides: postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

  try {
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    
    // Supabase transaction pooler (IPv4 compatible)
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 
        `postgresql://postgres.pfbaepibelomiutlotkn:${encodeURIComponent('Arthur@472003')}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    
    try {
      // Migration 1
      await client.query(`
        ALTER TABLE public.ai_agents
          ADD COLUMN IF NOT EXISTS webhook_tool_url text,
          ADD COLUMN IF NOT EXISTS webhook_tool_secret text
      `);
      results.push({ migration: 1, status: 'ok', msg: 'webhook_tool columns added' });

      // Migration 2 — table likely exists already
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.push_subscriptions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          owner_id uuid NOT NULL,
          endpoint text NOT NULL,
          subscription jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON public.push_subscriptions(endpoint)`);
      await client.query(`CREATE INDEX IF NOT EXISTS push_subscriptions_owner_id_idx ON public.push_subscriptions(owner_id)`);
      await client.query(`ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can manage own push subscriptions'
          ) THEN
            CREATE POLICY "Users can manage own push subscriptions"
              ON public.push_subscriptions FOR ALL
              USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
          END IF;
        END $$
      `);
      results.push({ migration: 2, status: 'ok', msg: 'push_subscriptions table ready' });
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    results.push({ error: err.message });
  }

  return res.status(200).json({ results });
}
