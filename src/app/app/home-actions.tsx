'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

export function HomeActions({ notice, passkeyCheck }: { notice?: string; passkeyCheck?: boolean }) {
  const sb = browserClient();
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [msg, setMsg] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!passkeyCheck) return;
    sb.auth.passkey.list().then((r) => setNeedsPasskey(!r.error && (r.data ?? []).length === 0));
  }, [passkeyCheck, sb]);

  if (notice) {
    if (hidden) return null;
    return (
      <div className="notice">
        {notice}{' '}
        <button className="btn" onClick={async () => { await sb.rpc('dismiss_reset_notice'); setHidden(true); }}>OK</button>
      </div>
    );
  }
  return (
    <>
      {needsPasskey && (
        <div className="panel">
          <div>You have no passkey yet, so you cannot sign in again after signing out.</div>
          <button className="btn primary" onClick={async () => {
            const r = await sb.auth.registerPasskey();
            if (r.error) setMsg(r.error.message); else { setNeedsPasskey(false); setMsg('Passkey created.'); }
          }}>Create passkey</button>
        </div>
      )}
      {msg && <div className="muted">{msg}</div>}
      <button className="btn" onClick={async () => { await sb.auth.signOut(); window.location.assign('/signin'); }}>Sign out</button>
    </>
  );
}
