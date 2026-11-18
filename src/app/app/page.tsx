import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { HomeActions } from './home-actions';

// The phone's home screen. Starting and resuming a workout is here; today's
// planned workout, proposals and the campaign week arrive with the planner
// (Phase 3) and the coach (Phase 4).
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
      {p.reset_notice_at && (
        <HomeActions
          notice={
            <>
              <div>Welcome back. Your sign-in was reset.</div>
              <div><strong>Action required: reconnect your coach.</strong></div>
              <div className="notice-detail">
                The reset disconnected ChatGPT or Claude. Open your coach app&apos;s connector settings, find Chalk and Iron, and connect it again.
              </div>
            </>
          }
        />
      )}
      {p.delete_requested_at && (
        <div className="notice">Your account is set to be deleted. <Link href="/planner/account">Cancel deletion</Link></div>
      )}
      <div className="panel">
        <div className="display">Hi, {p.display_name}</div>
        <div className="muted">Your library holds {count ?? 0} exercises. Today&apos;s planned workout arrives with the planner.</div>
        <Link className="btn primary" href="/app/workout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Start or resume a workout</Link>
      </div>
      <HomeActions passkeyCheck />
      <div className="row">
        <Link className="btn" href="/planner/account">Account</Link>
        {p.is_admin && <Link className="btn" href="/planner/admin">Admin</Link>}
        {/* THROWAWAY: the iPhone checks page, removed once they are done. */}
        <Link className="btn" href="/app/lab">iPhone checks</Link>
      </div>
    </main>
  );
}
