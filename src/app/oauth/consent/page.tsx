'use client';
import { useEffect, useState } from 'react';
import { signInWithPasskey } from '@/components/passkey';
import { browserClient } from '@/lib/supabase/browser';

// The page Supabase sends a person to when ChatGPT or Claude asks to connect
// as their coach (design Section 4, "Signing the coach in to the connector",
// step 3). One plain question, Allow or Deny. Carried over from the Phase 1
// sign-in proof. The app name comes from the coach app itself, and any app can
// register itself, so it is shown as plain text only.

type Ask = { name: string; returnsTo: string; email: string };
type State =
  | { at: 'loading' }
  | { at: 'nothing' }
  | { at: 'signin' }
  | { at: 'ask'; ask: Ask }
  | { at: 'leaving'; text: string }
  | { at: 'failed'; text: string };

function authorizationId(): string {
  return new URLSearchParams(window.location.search).get('authorization_id') ?? '';
}

export default function Consent() {
  const [state, setState] = useState<State>({ at: 'loading' });
  const [busy, setBusy] = useState(false);

  async function showRequest() {
    const sb = browserClient();
    const r = await sb.auth.oauth.getAuthorizationDetails(authorizationId());
    if (r.error) {
      setState({ at: 'failed', text: 'This request could not be read: ' + r.error.message + '. Start connecting again from your coach app.' });
      return;
    }
    const d = (r.data ?? {}) as { authorization_id?: string; redirect_url?: string; redirect_uri?: string; client?: { name?: string }; user?: { email?: string } };
    if (d.redirect_url && !d.authorization_id) {
      // Allowed before: Supabase sends the person straight back.
      setState({ at: 'leaving', text: 'Already allowed. Going back to your coach app…' });
      window.location.assign(d.redirect_url);
      return;
    }
    let returnsTo = d.redirect_uri ?? '';
    try {
      returnsTo = new URL(returnsTo).host;
    } catch {
      // shown as it came
    }
    setState({ at: 'ask', ask: { name: (d.client?.name ?? '').trim() || 'An app', returnsTo, email: d.user?.email ?? '' } });
  }

  useEffect(() => {
    if (!authorizationId()) {
      setState({ at: 'nothing' });
      return;
    }
    browserClient()
      .auth.getSession()
      .then(({ data }) => (data.session ? showRequest() : setState({ at: 'signin' })));
  }, []);

  async function signIn() {
    setBusy(true);
    const e = await signInWithPasskey();
    setBusy(false);
    if (e) setState({ at: 'failed', text: 'Passkey sign-in did not work: ' + e });
    else await showRequest();
  }

  async function decide(allow: boolean) {
    setBusy(true);
    const sb = browserClient();
    const r = allow ? await sb.auth.oauth.approveAuthorization(authorizationId()) : await sb.auth.oauth.denyAuthorization(authorizationId());
    if (r.error) {
      setBusy(false);
      setState({ at: 'failed', text: 'That did not go through: ' + r.error.message + '. Start connecting again from your coach app.' });
      return;
    }
    // Supabase now sends the browser back to the coach app.
    setState({ at: 'leaving', text: allow ? 'Allowed. Going back to your coach app…' : 'Denied. Going back to your coach app…' });
  }

  async function notMe() {
    await browserClient().auth.signOut({ scope: 'local' });
    setState({ at: 'signin' });
  }

  return (
    <main className="page">
      <h1>Chalk and Iron</h1>
      {state.at === 'loading' && <p className="muted">Loading…</p>}
      {state.at === 'nothing' && (
        <p className="muted">This page opens by itself while you connect ChatGPT or Claude as your coach. There is nothing to allow right now.</p>
      )}
      {state.at === 'signin' && (
        <>
          <p>Sign in to allow your coach app to connect.</p>
          <button className="btn primary" onClick={signIn} disabled={busy}>{busy ? 'Waiting…' : 'Sign in with passkey'}</button>
          <p className="muted">Face ID or Touch ID. No account yet? You need an invite link from an admin.</p>
        </>
      )}
      {state.at === 'ask' && (
        <>
          <p className="display big-question">Allow {state.ask.name} to read your training data and send you proposals?</p>
          <p className="muted">Your coach can read your profile, gyms, library and history. It can only propose changes: nothing changes until you accept it in the app. You can disconnect it at any time.</p>
          {state.ask.email && <p className="muted">Signed in as {state.ask.email}.</p>}
          {state.ask.returnsTo && <p className="muted">After you answer you go back to {state.ask.returnsTo}.</p>}
          <div className="row">
            <button className="btn primary" onClick={() => decide(true)} disabled={busy}>Allow</button>
            <button className="btn" onClick={() => decide(false)} disabled={busy}>Deny</button>
          </div>
          <button className="btn" onClick={notMe} disabled={busy}>Not you? Sign out</button>
        </>
      )}
      {state.at === 'leaving' && <p className="muted">{state.text}</p>}
      {state.at === 'failed' && <div className="error">{state.text}</div>}
    </main>
  );
}
