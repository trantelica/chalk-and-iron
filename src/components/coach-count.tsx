'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { INBOX_CHANGED_EVENT, INBOX_CHECK_MS, waitingCards } from '@/rules/inbox';

/**
 * How many cards wait for a decision, read with the person's own access and
 * looked at again when the screen comes back, every 30 seconds, and the moment
 * a card is decided on this screen. null until the first answer (or with no
 * connection), so the button shows no number rather than a wrong one.
 */
export function useWaitingCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  const load = useCallback(async () => {
    const r = await browserClient().from('proposals').select('status, expires_at').eq('status', 'pending');
    if (r.error) return;
    setCount(waitingCards((r.data ?? []) as { status: 'pending'; expires_at: string | null }[], Date.now()).length);
  }, []);
  useEffect(() => {
    void load();
    const again = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    window.addEventListener('pageshow', again);
    window.addEventListener(INBOX_CHANGED_EVENT, again);
    const timer = setInterval(again, INBOX_CHECK_MS);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
      window.removeEventListener('pageshow', again);
      window.removeEventListener(INBOX_CHANGED_EVENT, again);
      clearInterval(timer);
    };
  }, [load]);
  return count;
}

/** The phone's Coach button: opens the Coach screen, with the number of cards waiting. */
export function CoachButton({ className = 'btn coach' }: { className?: string }) {
  const count = useWaitingCount();
  return (
    <Link className={className} href="/app/coach" aria-label={count ? `Coach, ${count} waiting` : 'Coach'}>
      Coach{count ? <span className="badge" aria-hidden="true">{count}</span> : null}
    </Link>
  );
}
