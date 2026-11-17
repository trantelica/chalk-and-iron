'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// THROWAWAY: the iPhone checks. Plain steps, one panel each.

type Alert = { id: string; due_at: string; handed_at: string | null; sent_at: string | null; result: string | null };

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function post(url: string, data?: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
  return j;
}

const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '–');
const lateBy = (a: Alert) => (a.sent_at ? ((new Date(a.sent_at).getTime() - new Date(a.due_at).getTime()) / 1000).toFixed(1) + ' s' : '–');

export function LabChecks({ vapidKey }: { vapidKey: string }) {
  const [env, setEnv] = useState<{ standalone: boolean; ios: string; push: boolean; wake: boolean; permission: string } | null>(null);
  const [pushMsg, setPushMsg] = useState('');
  const [restMsg, setRestMsg] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeMsg, setWakeMsg] = useState('');
  const [soundMsg, setSoundMsg] = useState('');
  const lock = useRef<WakeLockSentinel | null>(null);
  const wantWake = useRef(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const m = ua.match(/OS (\d+)_(\d+)/);
    setEnv({
      standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
      ios: m ? `${m[1]}.${m[2]}` : 'not an iPhone',
      push: 'serviceWorker' in navigator && 'PushManager' in window,
      wake: 'wakeLock' in navigator,
      permission: typeof Notification === 'undefined' ? 'not available' : Notification.permission,
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const loadAlerts = useCallback(async () => {
    const r = await fetch('/api/lab/rest');
    if (r.ok) setAlerts((await r.json()).alerts ?? []);
  }, []);

  useEffect(() => {
    loadAlerts();
    const again = async () => {
      if (document.visibilityState !== 'visible') return;
      loadAlerts();
      // The screen lock is let go whenever the app leaves the screen. Ask again on return.
      if (wantWake.current && !lock.current) await keepAwake();
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAlerts]);

  async function allow() {
    setPushMsg('Asking…');
    try {
      if (!vapidKey) throw new Error('Notifications are not set up on the server yet.');
      const p = await Notification.requestPermission();
      setEnv((e) => (e ? { ...e, permission: p } : e));
      if (p !== 'granted') throw new Error(`Notifications are "${p}". Allow them in Settings > Notifications > Chalk and Iron.`);
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      await post('/api/lab/subscribe', { subscription: sub.toJSON() });
      setPushMsg('Allowed. Now tap "Send one now".');
    } catch (e) {
      setPushMsg((e as Error).message);
    }
  }

  async function sendNow() {
    setPushMsg('Sending…');
    try {
      const r = await post('/api/lab/push-now');
      setPushMsg(r.sent ? `Sent to ${r.sent} phone(s). A notification should appear now.` : `Not sent${r.failed?.length ? ': ' + r.failed.join(', ') : ''}. Tap "Allow notifications" first.`);
    } catch (e) {
      setPushMsg((e as Error).message);
    }
  }

  async function startRest(seconds: number) {
    try {
      const r = await post('/api/lab/rest', { seconds });
      setRestMsg(`Rest started, due at ${time(r.due_at)}. Now lock your phone, or switch to another app, and wait.`);
      loadAlerts();
    } catch (e) {
      setRestMsg((e as Error).message);
    }
  }

  async function keepAwake() {
    try {
      lock.current = await navigator.wakeLock.request('screen');
      wantWake.current = true;
      setWakeOn(true);
      setWakeMsg(`Asked at ${time(new Date().toISOString())}. Now leave the phone alone, longer than its Auto-Lock time.`);
      lock.current.addEventListener('release', () => {
        lock.current = null;
        setWakeOn(false);
        if (wantWake.current) setWakeMsg((m) => m + ` Let go at ${time(new Date().toISOString())}.`);
      });
    } catch (e) {
      setWakeMsg('Could not keep the screen awake: ' + (e as Error).message);
    }
  }

  async function stopAwake() {
    wantWake.current = false;
    await lock.current?.release();
    lock.current = null;
    setWakeOn(false);
    setWakeMsg('Stopped.');
  }

  function playSound() {
    try {
      // Ask the iPhone to mix this sound with other apps' music, not stop it.
      const session = (navigator as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
      setSoundMsg(session ? 'Played, mixed with other audio.' : 'Played. (This iPhone cannot be asked to mix sounds.)');
    } catch (e) {
      setSoundMsg('Could not play: ' + (e as Error).message);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="display">This phone</div>
        {env ? (
          <div className="muted">
            Home-screen app: {env.standalone ? 'yes' : 'no, open it from the home screen'} · iOS {env.ios} · notifications: {env.permission} ·
            push {env.push ? 'available' : 'not available'} · screen wake {env.wake ? 'available' : 'not available'}
          </div>
        ) : <div className="muted">Checking…</div>}
      </div>

      <div className="panel">
        <div className="display">1. Notifications</div>
        <div className="muted">Tap Allow, say Allow when the iPhone asks, then send one. A notification should appear within a few seconds.</div>
        <div className="row">
          <button className="btn" onClick={allow}>Allow notifications</button>
          <button className="btn" onClick={sendNow}>Send one now</button>
        </div>
        {pushMsg && <div className="muted">{pushMsg}</div>}
      </div>

      <div className="panel">
        <div className="display">2. Rest alert in the background</div>
        <div className="muted">
          Start a rest, then lock the phone or switch to another app. When the rest ends, a &quot;Rest over&quot; notification should arrive.
          It says when it was due and when it was sent. Try it once locked and once in another app.
        </div>
        <div className="row">
          <button className="btn" onClick={() => startRest(30)}>Start 30-second rest</button>
          <button className="btn" onClick={() => startRest(90)}>Start 90-second rest</button>
        </div>
        {restMsg && <div className="muted">{restMsg}</div>}
        {alerts.length > 0 && (
          <table>
            <thead><tr><th>Due</th><th>Sent</th><th>Late by</th><th>Result</th></tr></thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}><td>{time(a.due_at)}</td><td>{time(a.sent_at)}</td><td>{lateBy(a)}</td><td>{a.result ?? (a.handed_at ? 'handed over' : 'waiting')}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="btn" onClick={loadAlerts}>Refresh the list</button>
      </div>

      <div className="panel">
        <div className="display">3. Screen stays awake</div>
        <div className="muted">
          Tap Keep awake, put the phone down and don&apos;t touch it for longer than its Auto-Lock time (Settings &gt; Display &amp; Brightness).
          The screen should stay on. Then lock it yourself, come back, and check it stays on again.
        </div>
        <div className="row">
          {!wakeOn ? <button className="btn" onClick={keepAwake}>Keep awake</button> : <button className="btn selected" onClick={stopAwake}>Stop keeping awake</button>}
        </div>
        {wakeMsg && <div className="muted">{wakeMsg}</div>}
      </div>

      <div className="panel">
        <div className="display">Extra: rest sound with music</div>
        <div className="muted">Start music in another app, come back here and tap Play. The beep should play over the music, and the music should keep going.</div>
        <div className="row"><button className="btn" onClick={playSound}>Play rest sound</button></div>
        {soundMsg && <div className="muted">{soundMsg}</div>}
      </div>
    </>
  );
}
