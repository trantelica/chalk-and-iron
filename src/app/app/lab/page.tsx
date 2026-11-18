import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase/server';
import { LabChecks } from './lab-checks';

// THROWAWAY: the iPhone test page (design Section 10E, point 10). Removed
// once the three checks are done and the real rest alerts are built.
export default async function IphoneTestPage() {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/signin');
  return (
    <main className="page">
      <h1>iPhone checks</h1>
      <div className="muted">
        A throwaway test page. It checks three things on your iPhone before the rest timer is built on them.
        Open it from the Chalk and Iron app on your home screen, not from Safari.
      </div>
      <LabChecks vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
      <Link className="btn" href="/app">Back</Link>
    </main>
  );
}
