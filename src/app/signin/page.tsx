'use client';
import { useState } from 'react';
import { signInWithPasskey } from '@/components/passkey';

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    const e = await signInWithPasskey();
    setBusy(false);
    if (e) setError(e);
    else window.location.assign('/app');
  }
  return (
    <main className="page">
      <h1>Chalk and Iron</h1>
      <p className="muted">Sign in with your passkey: Face ID or Touch ID. There is no password.</p>
      <button className="btn primary" onClick={go} disabled={busy}>{busy ? 'Waiting…' : 'Sign in'}</button>
      {error && <div className="error">{error}</div>}
      <p className="muted">New here? You need an invite link from an admin. Locked out? Ask your admin for a reset link.</p>
    </main>
  );
}
