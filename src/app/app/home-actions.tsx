'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { clearPhoneCopy, sendBeforeSignOut } from '@/lib/phone-store';

export function HomeActions({ notice, passkeyCheck }: { notice?: React.ReactNode; passkeyCheck?: boolean }) {
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
      <div className="notice" role="alert">
        {notice}
        <button className="btn" onClick={async () => { await sb.rpc('dismiss_reset_notice'); setHidden(true); }}>Got it</button>
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
      <button className="btn" onClick={async () => {
        // Anything not yet sent goes first; then what the app keeps on this phone is cleared.
        const left = await sendBeforeSignOut();
        if (left && !window.confirm(`${left} change${left === 1 ? ' has' : 's have'} not reached your account yet, because there is no connection. Signing out now loses ${left === 1 ? 'it' : 'them'}. Sign out anyway?`)) return;
        await clearPhoneCopy();
        await sb.auth.signOut();
        window.location.assign('/signin');
      }}>Sign out</button>
    </>
  );
}
