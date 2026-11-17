'use client';
import { useEffect, useState } from 'react';
import { readCodeFromLink, signInWithTokenAndCreatePasskey } from '@/components/passkey';

export default function Register() {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'checking' | 'ok' | 'bad' | 'busy'>('checking');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const c = readCodeFromLink();
    setCode(c);
    fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) })
      .then((r) => r.json())
      .then((r) => { setState(r.valid ? 'ok' : 'bad'); if (r.label) setName(r.label); })
      .catch(() => setState('bad'));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError('');
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const r = await fetch('/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name, email, timeZone, register: true }),
    }).then((x) => x.json()).catch(() => ({ error: 'No connection. Try again.' }));
    if (r.error) { setError(r.error); setState('ok'); return; }
    const problem = await signInWithTokenAndCreatePasskey(r.tokenHash);
    if (problem) setError(problem);
    window.location.assign('/app');
  }

  return (
    <main className="page">
      <h1>Join</h1>
      {state === 'checking' && <p className="muted">Checking your invite…</p>}
      {state === 'bad' && <div className="error">This invite link is not valid. It may be used, expired or cancelled. Ask the person who invited you for a new one.</div>}
      {(state === 'ok' || state === 'busy') && (
        <form onSubmit={submit} className="panel">
          <label>Your name<input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" /></label>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" /></label>
          <p className="muted">Your email is kept as a contact detail. The app never sends you email. Next you create a passkey with Face ID or Touch ID.</p>
          <button className="btn primary" disabled={state === 'busy'}>{state === 'busy' ? 'Setting up…' : 'Create passkey'}</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </main>
  );
}
