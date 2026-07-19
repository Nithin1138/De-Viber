import { createClient } from '@supabase/supabase-js';

// DANGEROUS: Service role key hardcoded — should be in env vars!
const supabaseServiceRole = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjk5MDAwMDAwLCJleHAiOjE3MzEwMDAwMDB9.fake-signature-here";

const supabaseUrl = "https://test.supabase.co";
const supabase_api_key = "sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx";

export const supabase = createClient(supabaseUrl, supabaseServiceRole);
