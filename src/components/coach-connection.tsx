'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { agoText, checkCoachLink, testPassed } from '@/rules/coach-intake';

// The coach link, the connection test and the connected coach apps (spec
// Section 5, "Coach setup"). Read and changed with the person's own access:
// the call log and the link are their own rows, and the list of connected apps
// is their own grants in Supabase's sign-in service.

export function useCoachLink() {
  const sb = browserClient();
  const [link, setLink] = useState<string | null | undefined>(undefined);
  const load = useCallback(async () => {
    const r = await sb.from('profiles').select('coach_link').maybeSingle();
    if (!r.error) setLink(((r.data as { coach_link?: string | null } | null)?.coach_link ?? null));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);
  return { link, reload: load };
}

export function CoachLinkBox({ link, reload }: { link: string | null | undefined; reload: () => Promise<void> }) {
  const sb = browserClient();
  const [v, setV] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (link !== undefined) setV(link ?? ''); }, [link]);
  async function save() {
    const c = checkCoachLink(v);
    if (!c.ok) { setMsg(c.error); return; }
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) { setMsg('You are signed out. Sign in again.'); return; }
    const r = await sb.from('profiles').update({ coach_link: c.value }).eq('id', auth.user.id);
    if (r.error) { setMsg('Not saved: ' + r.error.message); return; }
    setMsg(c.value ? 'Saved. The Coach button on your phone now opens this.' : 'Cleared.');
    await reload();
  }
  return (
    <div className="stack">
      <label>
        Link to your coach project
        <input type="text" inputMode="url" aria-label="Coach link" placeholder="https://chatgpt.com/g/…/project" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
      </label>
      <div className="muted">Open your coach project in ChatGPT or Claude, then copy its address from the browser&apos;s address bar. Ask my coach on your phone copies a message and opens it.</div>
      <div className="row"><button className="btn" onClick={save} disabled={v.trim() === (link ?? '')}>Save the link</button>{msg && <span className="muted" role="status">{msg}</span>}</div>
    </div>
  );
}

type Call = { client_name: string; tool: string; ok: boolean; called_at: string };

export function ConnectionTest() {
  const sb = browserClient();
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const read = useCallback(async () => {
    const r = await sb.from('connector_calls').select('client_name, tool, ok, called_at').order('called_at', { ascending: false }).limit(10);
    if (!r.error) setCalls((r.data ?? []) as Call[]);
    setNow(Date.now());
  }, [sb]);
  useEffect(() => { void read(); }, [read]);
  const passed = started !== null && calls ? testPassed(calls, started) : false;
  useEffect(() => {
    if (started === null || passed) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(() => { void read(); if (Date.now() - started > 5 * 60000) setStarted(null); }, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [started, passed, read]);

  const last = calls?.[0];
  const hit = calls?.find((c) => c.ok);
  return (
    <div className={`panel test-line ${passed ? 'ok' : ''}`}>
      {passed && hit ? (
        <div role="status"><strong>Connected.</strong> {hit.client_name || 'Your coach'} read your data {agoText(Date.parse(hit.called_at), now)}.</div>
      ) : started !== null ? (
        <div role="status">Waiting for your coach… In your coach chat, send: <em>Use Chalk and Iron to tell me my name and my gyms.</em> This page checks every few seconds.</div>
      ) : last ? (
        <div>Last used: {last.client_name || 'a coach'} {last.ok ? 'read' : 'tried to read'} your data {agoText(Date.parse(last.called_at), now)}.</div>
      ) : calls ? (
        <div className="muted">Your coach has not used the connection yet.</div>
      ) : <div className="muted">Checking…</div>}
      <div className="row">
        {!passed && <button className="btn" onClick={() => { setStarted(Date.now()); void read(); }}>{started === null ? 'Start the connection test' : 'Check again'}</button>}
        {passed && <button className="btn" onClick={() => setStarted(Date.now())}>Test again</button>}
      </div>
    </div>
  );
}

type Grant = { id: string; name: string; granted_at: string };

export function ConnectedApps() {
  const sb = browserClient();
  const [apps, setApps] = useState<Grant[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const r = await sb.auth.oauth.listGrants();
    if (r.error) { setMsg('Your connected apps could not be read: ' + r.error.message); setApps([]); return; }
    setApps((r.data ?? []).map((g) => ({ id: g.client.id, name: g.client.name || 'A coach app', granted_at: g.granted_at })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);
  async function disconnect(g: Grant) {
    if (!window.confirm(`Disconnect ${g.name}? It stops reading your data at once. You can connect it again later.`)) return;
    const r = await sb.auth.oauth.revokeGrant({ clientId: g.id });
    setMsg(r.error ? 'That did not go through: ' + r.error.message : `${g.name} is disconnected.`);
    await load();
  }
  if (!apps) return <p className="muted">Loading connected apps…</p>;
  return (
    <div className="stack">
      {apps.length === 0 && <div className="muted">No coach app is connected.</div>}
      {apps.map((g) => (
        <div key={g.id} className="row spread panel">
          <span><strong>{g.name}</strong> <span className="muted">connected {new Date(g.granted_at).toLocaleDateString()}</span></span>
          <button className="btn danger" aria-label={`Disconnect ${g.name}`} onClick={() => disconnect(g)}>Disconnect</button>
        </div>
      ))}
      {msg && <div className="muted" role="status">{msg}</div>}
    </div>
  );
}
