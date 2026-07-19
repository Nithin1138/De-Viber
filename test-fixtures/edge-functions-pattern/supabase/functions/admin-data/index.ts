import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const authHeader = req.headers.get('Authorization');
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '')
  );

  if (error || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Server-side role enforcement — this is the real check
  if (user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  // Admin-only logic here
  const { data } = await supabase
    .from('admin_settings')
    .select('*');

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
});
