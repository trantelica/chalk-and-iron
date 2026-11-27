import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { BackToWorkout } from '@/components/back-to-workout';
import { ProposalCards } from '@/components/proposal-cards';
import { safeCoachLink } from '@/rules/coach-intake';

// The phone's Coach screen (spec Section 5, "Phone: coach inbox"): says where
// the coach lives, and lists the proposals newest first with their status.
// Waiting ones carry Accept and Decline; after Accept a banner says what
// changed and what did not.
export default async function CoachScreen() {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/signin');
  const { data: p } = await supabase.from('profiles').select('coach_link').maybeSingle();
  const link = safeCoachLink((p as { coach_link?: string | null } | null)?.coach_link);
  return (
    <main className="page">
      <div className="row spread">
        <h1>Coach</h1>
        <Link className="btn" href="/app">Home</Link>
      </div>
      <BackToWorkout userId={auth.user.id} />
      <section className="panel" aria-label="About your coach">
        <div className="muted">
          Your coach lives in your own ChatGPT or Claude project. You talk or type there. Anything the coach wants to change comes back here for your approval.
        </div>
        {link
          ? <a className="btn link-btn" href={link} target="_blank" rel="noreferrer">Open my coach</a>
          : <div className="muted">Your coach link is saved on the Coach setup screen in the planner (Planner, then Coach setup).</div>}
      </section>
      <ProposalCards mode="all" className="cards" />
    </main>
  );
}
