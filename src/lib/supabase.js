import { createClient } from '@supabase/supabase-js';

// Public credentials — anon key is safe to expose in client-side code.
// RLS policies on Supabase enforce data access rules.
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
