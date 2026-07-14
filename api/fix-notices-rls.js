// ONE-SHOT RLS FIX for workspace_notices
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';

  if (!SERVICE_KEY) return res.status(500).json({ error: 'No service key' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const results = [];

  // Step 1: Drop old broken policy
  const { error: dropErr } = await supabase.rpc('exec_sql', {
    sql: 'DROP POLICY IF EXISTS "notices_write" ON public.workspace_notices'
  });
  results.push({ step: 'drop', error: dropErr?.message || null });

  // Step 2: Create fixed policy with WITH CHECK
  const { error: createErr } = await supabase.rpc('exec_sql', {
    sql: `CREATE POLICY "notices_write" ON public.workspace_notices
      FOR ALL
      USING (
        (auth.uid() = workspace_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.workspace_id = workspace_id
            AND p.role = ANY(ARRAY['admin','sales_manager'])
        )
      )
      WITH CHECK (
        (auth.uid() = workspace_id)
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.workspace_id = workspace_id
            AND p.role = ANY(ARRAY['admin','sales_manager'])
        )
      )`
  });
  results.push({ step: 'create', error: createErr?.message || null });

  const success = results.every(r => !r.error);
  res.status(success ? 200 : 500).json({ success, results });
}
