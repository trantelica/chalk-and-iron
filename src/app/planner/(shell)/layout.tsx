import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { PlannerShell } from './shell';

// The browser planner (spec Section 5): Plan, Library, History and Proposals tabs,
// and a Menu for the rest (with the pounds or kilograms view switch). Signed-in people only.
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/signin');
  const { data: prof } = await supabase.from('profiles').select('is_admin').maybeSingle();
  return <PlannerShell isAdmin={Boolean(prof?.is_admin)}>{children}</PlannerShell>;
}
