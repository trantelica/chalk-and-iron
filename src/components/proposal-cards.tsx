'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/browser';
import { cardsChanged, INBOX_CHECK_MS } from '@/rules/inbox';

// The inbox card for a day sent from the planner (spec Sections 5 and 10;
// built in Phase 3 for this one kind, Nate 20 Nov; Phase 4 adds the coach's
// cards to the same inbox). It says what would replace what, with Accept and
// Dismiss. Accept makes it today's workout, for today only, and never changes
// the library or the campaign. Dismiss changes nothing. The database does the
// deciding (decide_planner_proposal), so the person's own sign-in is checked.

interface Card { id: string; summary_lines: string[]; created_at: string; expires_at: string | null; payload: { workout_name?: string } }

export function ProposalCards({ onChange, className }: { onChange?: () => void; className?: string }) {
  const sb = browserClient();
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const seen = useRef<string[] | null>(null);

  const load = useCallback(async () => {
    const r = await sb.from('proposals').select('id, summary_lines, created_at, expires_at, payload').eq('status', 'pending').eq('source', 'planner').order('created_at', { ascending: false });
    if (r.error) return; // no connection: keep what is shown, and look again later
    const now = Date.now();
    const next = ((r.data ?? []) as Card[]).filter((c) => !c.expires_at || Date.parse(c.expires_at) > now);
    const ids = next.map((c) => c.id);
    // A card came or went elsewhere (sent from the planner, or decided on another
    // screen): read the page again too, so Today shows what is planned now.
    if (cardsChanged(seen.current, ids)) router.refresh();
    seen.current = ids;
    setCards(next);
  }, [sb, router]);

  // Look when the screen opens, whenever it comes back into view (switching back
  // to the app, unlocking the phone), and every 30 seconds while it is on screen.
  useEffect(() => {
    void load();
    const again = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    window.addEventListener('pageshow', again);
    const timer = setInterval(again, INBOX_CHECK_MS);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
      window.removeEventListener('pageshow', again);
      clearInterval(timer);
    };
  }, [load]);

  async function decide(c: Card, accept: boolean) {
    setBusy(c.id); setMsg('');
    const r = await sb.rpc('decide_planner_proposal', { p_proposal: c.id, p_accept: accept });
    setBusy('');
    if (r.error) setMsg(r.error.message);
    else setMsg(accept ? `Accepted. ${c.payload.workout_name ?? 'The day'} is today's workout. Your library and campaign are unchanged.` : 'Dismissed. Nothing changed.');
    await load();
    onChange?.();
    router.refresh();
  }

  if (cards === null || (cards.length === 0 && !msg)) return null;
  return (
    <section className={className ?? 'pbox cards'} aria-label="Inbox">
      <div className="lab accent-text">Inbox · {cards.length} waiting</div>
      {cards.map((c) => (
        <div key={c.id} className="panel" role="group" aria-label="Day sent from the planner">
          <div className="lab">Sent from the planner</div>
          {c.summary_lines.map((l, i) => <div key={i} className={i === 0 ? '' : 'muted'}>{l}</div>)}
          <div className="row">
            <button className="btn primary small-primary" disabled={busy === c.id} onClick={() => decide(c, true)}>Accept</button>
            <button className="btn" disabled={busy === c.id} onClick={() => decide(c, false)}>Dismiss</button>
          </div>
        </div>
      ))}
      {msg && <div className="muted" role="status">{msg}</div>}
    </section>
  );
}
