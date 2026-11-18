import 'server-only';
import { serverClient } from '@/lib/supabase/server';

// THROWAWAY: the iPhone test page's server steps check the person through
// their own sign-in, so a deactivated or reset account gets nothing.
export async function labPerson(): Promise<string | null> {
  const supabase = await serverClient();
  const { data } = await supabase.from('profiles').select('id').maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
