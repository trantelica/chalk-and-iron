'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

// Planner: Account. Phase 1 covers deleting and cancelling deletion. Export
// arrives in Phase 5 and will be offered before deletion then.
export default function Account() {
  const sb = browserClient();
  const [p, setP] = useState<{ email: string; delete_requested_at: string | null } | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => sb.from('profiles').select('email, delete_requested_at').maybeSingle().then((r) => setP(r.data));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <main className="page"><h1>Account</h1><p className="muted">Loading…</p></main>;
  const purge = p.delete_requested_at ? new Date(Date.parse(p.delete_requested_at) + 14 * 86400000) : null;
  return (
    <main className="page">
      <h1>Account</h1>
      <div className="panel"><div className="muted">Email</div><div>{p.email}</div></div>
      <h2>Delete account</h2>
      {purge ? (
        <div className="panel">
          <div>Your account and all its data will be removed on {purge.toLocaleDateString()}.</div>
          <button className="btn primary" onClick={async () => { await sb.rpc('cancel_my_account_deletion'); setMsg('Deletion cancelled.'); load(); }}>Cancel deletion</button>
        </div>
      ) : (
        <div className="panel">
          <div className="muted">Everything is removed permanently after 14 days. Until then you can sign in and cancel.</div>
          <button className="btn" onClick={async () => {
            if (!confirm('Delete your account and all your training data after 14 days?')) return;
            const r = await sb.rpc('request_my_account_deletion');
            setMsg(r.error ? r.error.message : 'Deletion requested.');
            load();
          }}>Delete my account</button>
        </div>
      )}
      {msg && <div className="muted">{msg}</div>}
      <a className="btn" href="/app">Back</a>
    </main>
  );
}
