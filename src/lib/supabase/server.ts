import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from './env';

/** The signed-in person's own sign-in, on the server. Row-level security applies. */
export async function serverClient() {
  const { url, key } = publicEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a page render, where cookies cannot be set. The proxy refreshes them.
        }
      },
    },
  });
}
