import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { HomeActions } from './home-actions';

// The phone's home screen. Phase 1 shows the account only; today's workout,
// proposals and the campaign week arrive in Phase 2.
export default async function PhoneHome() {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/signin');
  const { data: p } = await supabase
    .from('profiles')
    .select('display_name, is_admin, reset_notice_at, delete_requested_at')
    .maybeSingle();
  if (!p) {
    return (
      <main className="page">
        <h1>Chalk and Iron</h1>
        <div className="error">This account can&apos;t be opened right now. It may have been deactivated, or its sign-in reset. Ask your admin.</div>
        <HomeActions />
      </main>
    );
  }
  const { count } = await supabase.from('exercises').select('id', { count: 'exact', head: true });
  return (
    <main className="page">
      <h1>Chalk and Iron</h1>
      {p.reset_notice_at && <HomeActions notice="Your sign-in was reset by an admin. Your old passkey was removed, you were signed out everywhere, and your coach was disconnected. Connect your coach again when you are ready." />}
      {p.delete_requested_at && (
        <div className="notice">Your account is set to be deleted. <Link href="/planner/account">Cancel deletion</Link></div>
      )}
      <div className="panel">
        <div className="display">Hi, {p.display_name}</div>
        <div className="muted">Your library holds {count ?? 0} exercises. Today&apos;s workout arrives in the next phase of the build.</div>
      </div>
      <HomeActions passkeyCheck />
      <div className="row">
        <Link className="btn" href="/planner/account">Account</Link>
        {p.is_admin && <Link className="btn" href="/planner/admin">Admin</Link>}
      </div>
    </main>
  );
}
