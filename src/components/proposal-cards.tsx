'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/browser';
import { decideCard } from '@/lib/decide';
import {
  acceptRefusal, appliesToText, bannerFor, cardHeading, cardsChanged, cleanReason, decisionMessage, endedNote, INBOX_CHANGED_EVENT,
  INBOX_CHECK_MS, INBOX_LIMIT, LINES_SHOWN, REASON_MAX, shownStatus, STATUS_LABEL, waitingCards, type DecideAnswer, type InboxCard,
} from '@/rules/inbox';
import { dropLocalCopyOf, outboxFor } from '@/lib/phone-store';

// The inbox (spec Sections 4, 5 and 10). Two kinds of card share it: a day
// sent from the planner (Phase 3: Accept and Dismiss, decided by
// decide_planner_proposal) and the coach's cards (stage 4F: Accept, and Decline
// with an optional one-line reason, decided by src/lib/decide.ts). Accept
// applies the whole card or none of it; the account does the deciding, so the
// person's own sign-in is checked.
//
// mode "waiting": only the cards waiting for a decision (Home, the Plan screen).
// mode "all": newest first, every state, so a decided, out of date or expired
// card stays in view (the Coach screen on the phone, Proposals in the planner).

const COLUMNS = 'id, source, kind, applies_to, summary_lines, status, created_at, expires_at, decided_at, decline_reason, payload';

export function ProposalCards({ onChange, className, mode = 'waiting', source }: {
  onChange?: () => void; className?: string; mode?: 'waiting' | 'all'; source?: 'planner';
}) {
  const sb = browserClient();
  const router = useRouter();
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [declining, setDeclining] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [opened, setOpened] = useState<string[]>([]);
  const seen = useRef<string[] | null>(null);

  const load = useCallback(async () => {
    let q = sb.from('proposals').select(COLUMNS).order('created_at', { ascending: false }).limit(INBOX_LIMIT);
    if (mode === 'waiting') q = q.eq('status', 'pending');
    if (source) q = q.eq('source', source);
    const r = await q;
    if (r.error) return; // no connection: keep what is shown, and look again later
    const now = Date.now();
    const rows = (r.data ?? []) as InboxCard[];
    const next = mode === 'waiting' ? waitingCards(rows, now) : rows;
    const ids = waitingCards(rows, now).map((c) => c.id);
    // A card came or went elsewhere (sent from the planner, or decided on another
    // screen): read the page again too, so Today shows what is planned now.
    if (cardsChanged(seen.current, ids)) router.refresh();
    seen.current = ids;
    setCards(next);
  }, [sb, router, mode, source]);

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

  async function decide(c: InboxCard, accept: boolean, why: string | null = null) {
    setBusy(c.id); setBanner(null);
    // Who is signed in, read on this device (no network request, so a weak signal cannot skip the next step).
    const { data: who } = await sb.auth.getSession();
    const me = who.session?.user.id ?? null;
    // Accept may change the workout this phone is doing: send what the phone has waiting first.
    const refusal = accept && (c.source === 'planner' || c.kind === 'today_change') ? await acceptRefusal(me, outboxFor) : null;
    if (refusal) { setBusy(''); setBanner({ ok: false, text: refusal }); return; }
    let answer: DecideAnswer | null = null;
    let errorText = '';
    if (c.source === 'planner') {
      const r = await sb.rpc('decide_planner_proposal', { p_proposal: c.id, p_accept: accept });
      if (r.error) errorText = `Not ${accept ? 'accepted' : 'dismissed'}. ${r.error.message}`; else answer = r.data as DecideAnswer | null;
    } else {
      answer = await decideCard(sb, c.id, accept, why);
    }
    setBusy('');
    if (errorText) setBanner({ ok: false, text: errorText });
    else if (c.source === 'planner') {
      setBanner(decisionMessage(answer, accept, c.payload.workout_name));
      // A workout running on this phone was saved and replaced: forget this phone's copy of it now.
      if (answer?.ok && answer.replaced_session_id && me) dropLocalCopyOf(me, answer.replaced_session_id);
    } else {
      setBanner(bannerFor(answer, accept));
    }
    if (answer?.ok) { setDeclining(''); setReason(''); setReasonError(''); }
    await load();
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
    onChange?.();
    router.refresh();
  }

  function startDecline(c: InboxCard) { setDeclining(c.id); setReason(''); setReasonError(''); setBanner(null); }
  function confirmDecline(c: InboxCard) {
    const r = cleanReason(reason);
    if (!r.ok) { setReasonError(r.message); return; }
    setReasonError('');
    void decide(c, false, r.reason);
  }

  if (cards === null) return null;
  if (cards.length === 0 && !banner && mode === 'waiting') return null;
  const now = Date.now();
  const waiting = waitingCards(cards, now).length;
  return (
    <section className={className ?? 'pbox cards'} aria-label="Inbox">
      <div className="lab accent-text">{mode === 'all' ? 'Proposals' : 'Inbox'} · {waiting} waiting</div>
      {banner && <div className={banner.ok ? 'notice-soft' : 'error'} role="status">{banner.text}</div>}
      {mode === 'all' && cards.length === 0 && <div className="muted">No proposals yet. When your coach suggests something, it appears here.</div>}
      {cards.map((c) => {
        const st = shownStatus(c, now);
        const coach = c.source !== 'planner';
        const waitingNow = st === 'pending';
        const canDismiss = st === 'out_of_date';
        const long = c.summary_lines.length > LINES_SHOWN && !opened.includes(c.id);
        const lines = long ? c.summary_lines.slice(0, LINES_SHOWN) : c.summary_lines;
        return (
          <div key={c.id} className="panel proposal-card" role="group" aria-label={coach ? `Coach proposal, ${STATUS_LABEL[st]}` : 'Day sent from the planner'}>
            <div className="row spread">
              <div className="lab">{cardHeading(c)}</div>
              <span className="badge">{STATUS_LABEL[st]}</span>
            </div>
            {mode === 'all' && <div className="muted">{new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
            {lines.map((l, i) => <div key={i} className={i === 0 ? '' : 'muted'}>{l}</div>)}
            {long && <button className="btn small" onClick={() => setOpened((o) => [...o, c.id])}>Show all {c.summary_lines.length} lines</button>}
            {coach && waitingNow && <div className="muted">{appliesToText(c)}</div>}
            {!waitingNow && <div className="muted">{endedNote(c, now)}</div>}
            {(waitingNow || canDismiss) && declining !== c.id && (
              <div className="row">
                {waitingNow && <button className="btn primary small-primary" disabled={busy === c.id} onClick={() => decide(c, true)}>Accept</button>}
                {coach
                  ? <button className="btn" disabled={busy === c.id} onClick={() => startDecline(c)}>{canDismiss ? 'Dismiss' : 'Decline'}</button>
                  : <button className="btn" disabled={busy === c.id} onClick={() => decide(c, false)}>Dismiss</button>}
              </div>
            )}
            {coach && declining === c.id && (
              <div className="decline-box">
                <label>
                  <span className="muted">Why? (optional, one line, so your coach can read it)</span>
                  <input type="text" value={reason} aria-label="Reason for declining (optional)" placeholder="For example: too much volume"
                    onChange={(e) => { setReason(e.target.value); setReasonError(''); }} />
                </label>
                <div className={reason.length > REASON_MAX ? 'error' : 'muted'}>{reason.length} of {REASON_MAX} characters</div>
                {reasonError && <div className="error" role="alert">{reasonError}</div>}
                <div className="row">
                  <button className="btn primary small-primary" disabled={busy === c.id || reason.length > REASON_MAX} onClick={() => confirmDecline(c)}>{canDismiss ? 'Dismiss' : 'Decline'} card</button>
                  <button className="btn" disabled={busy === c.id} onClick={() => setDeclining('')}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
