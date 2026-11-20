'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/browser';

// The inbox card for a day sent from the planner (spec Sections 5 and 10;
// built in Phase 3 for this one kind, Nate 20 Nov; Phase 4 adds the coach's
// cards to the same inbox). It says what would replace what, with Accept and
// Dismiss. Accept makes it today's workout, for today only, and never changes
// the library or the campaign. Dismiss changes nothing. The database does the
// deciding (decide_planner_proposal), so the person's own sign-in is checked.

interface Card { id: string; summary_lines: string[]; created_at: string; expires_at: string | null; payload: { workout_name?: string } }

export function ProposalCards({ onChange, compact }: { onChange?: () => void; compact?: boolean }) {
  const sb = browserClient();
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await sb.from('proposals').select('id, summary_lines, created_at, expires_at, payload').eq('status', 'pending').eq('source', 'planner').order('created_at', { ascending: false });
    const now = Date.now();
    setCards(((r.data ?? []) as Card[]).filter((c) => !c.expires_at || Date.parse(c.expires_at) > now));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

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
    <section className={compact ? 'cards' : 'pbox cards'} aria-label="Inbox">
      <div className="lab">Inbox</div>
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
