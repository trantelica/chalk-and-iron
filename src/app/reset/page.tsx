'use client';
import { useState } from 'react';
import { readCodeFromLink, signInWithTokenAndCreatePasskey } from '@/components/passkey';

export default function Reset() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    const r = await fetch('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: readCodeFromLink() }) })
      .then((x) => x.json()).catch(() => ({ error: 'No connection. Try again.' }));
    if (r.error) { setError(r.error); setBusy(false); return; }
    const problem = await signInWithTokenAndCreatePasskey(r.tokenHash);
    if (problem) setError(problem);
    window.location.assign('/app');
  }
  return (
    <main className="page">
      <h1>Set up sign-in</h1>
      <p className="muted">This makes a new passkey for your account. It signs you out everywhere else and disconnects your coach. Your training history is not touched.</p>
      <button className="btn primary" onClick={go} disabled={busy}>{busy ? 'Setting up…' : 'Create new passkey'}</button>
      {error && <div className="error">{error}</div>}
    </main>
  );
}
