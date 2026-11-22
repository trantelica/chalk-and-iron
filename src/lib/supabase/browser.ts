'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackedFetch } from '@/lib/save-status';

let client: SupabaseClient | null = null;

/** The app's sign-in in the browser. Sessions are kept in cookies so the server sees them too. */
export function browserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      // Changes are reported as they save, so screens can say so (src/lib/save-status.ts).
      global: { fetch: trackedFetch },
    });
  }
  return client;
}
