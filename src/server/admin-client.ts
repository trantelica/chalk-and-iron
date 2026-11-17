import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/supabase/env';

// The all-powerful key. Design Section 4: used only by the server for steps a
// person's own sign-in cannot do (creating a sign-in record, single-use
// links, removing passkeys, blocking sign-in). Never sent to a browser and
// never used to read or change training data for a request.
export function adminClient(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient(publicEnv().url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
