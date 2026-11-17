import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? '/app' : '/signin');
}
