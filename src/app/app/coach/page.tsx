import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { BackToWorkout } from '@/components/back-to-workout';
import { ProposalCards } from '@/components/proposal-cards';
import { safeCoachLink } from '@/rules/coach-intake';
import { AskCoach } from '@/components/ask-coach';
import { COACH_MESSAGES } from '@/rules/ask-coach';

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
          Your coach is not inside Chalk and Iron. It lives in your own ChatGPT or Claude project, and that is where you talk to it. Chalk and Iron receives the coach&apos;s cards, below, for you to accept or decline.
        </div>
        {link
          ? <a className="btn link-btn" href={link} target="_blank" rel="noreferrer">Open my coach</a>
          : <div className="muted">No coach link is saved yet. Save it in the planner: Planner, then Coach setup, step 4 (<Link href="/planner/coach-setup">Open Coach setup</Link>).</div>}
      </section>
      <section className="panel" aria-label="Ask my coach">
        <div className="lab">Ask my coach</div>
        <div className="muted">Pick a message. It is copied, and your coach project opens: paste it into the chat and send.</div>
        {COACH_MESSAGES.map((m) => <AskCoach key={m.id} message={m.text} label={m.label} coachLink={link} />)}
      </section>
      <ProposalCards mode="all" className="cards" />
    </main>
  );
}
