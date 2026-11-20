import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { PlannerShell } from './shell';

// The browser planner (spec Section 5): Plan, Library, History and Vocabulary,
// with the pounds or kilograms view toggle. Signed-in people only.
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/signin');
  return <PlannerShell>{children}</PlannerShell>;
}
