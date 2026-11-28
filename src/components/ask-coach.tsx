'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { safeCoachLink } from '@/rules/coach-intake';
import { COPIED_LINE, COPY_FAILED_LINE, NO_LINK_LINE } from '@/rules/ask-coach';

/** The saved coach link, read with the person's own access (null while unknown or when none is saved). */
function useCoachLink(given?: string | null): string | null {
  const [link, setLink] = useState<string | null>(given ?? null);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    void browserClient().from('profiles').select('coach_link').maybeSingle().then((r) => {
      if (live && !r.error) setLink(safeCoachLink((r.data as { coach_link?: string | null } | null)?.coach_link));
    });
    return () => { live = false; };
  }, [given]);
  return given !== undefined ? given : link;
}

/**
 * Copies a ready-made message and opens the user's coach project (the https
 * link saved in Coach setup). It is a real link so the phone allows it to
 * open; the copy runs inside the same tap. With no saved link it still copies
 * and says where to save one. If copying is refused, the message is shown in a
 * box that can be selected.
 */
export function AskCoach({ message, label = 'Ask my coach', coachLink, className = 'btn link-btn', hint }: {
  message: string;
  label?: string;
  /** Pass the saved link from a server page; leave out to read it on the phone. */
  coachLink?: string | null;
  className?: string;
  hint?: string;
}) {
  const link = useCoachLink(coachLink);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  function copy() {
    const done = () => setState('copied');
    const fail = () => setState('failed');
    try {
      if (!navigator.clipboard?.writeText) return fail();
      navigator.clipboard.writeText(message).then(done, fail);
    } catch { fail(); }
  }
  const body = (
    <>
      {hint ? <span className="lab">{hint}</span> : null}
      <span>{label}</span>
    </>
  );
  return (
    <div className="ask-coach">
      {link
        ? <a className={className} href={link} target="_blank" rel="noreferrer" onClick={copy}>{body}</a>
        : <button type="button" className={className} onClick={copy}>{body}</button>}
      {state === 'copied' && (
        <div role="status" className="ask-coach-note">
          {link ? COPIED_LINE : NO_LINK_LINE} {!link && <Link href="/planner/coach-setup">Open Coach setup</Link>}
        </div>
      )}
      {state === 'failed' && (
        <div role="status" className="ask-coach-note">
          <div>{COPY_FAILED_LINE}</div>
          <textarea readOnly className="ask-coach-box" aria-label="Message for your coach" value={message} rows={3} onFocus={(e) => e.currentTarget.select()} />
          {!link && <div>No coach link is saved yet. <Link href="/planner/coach-setup">Open Coach setup</Link>, step 4.</div>}
        </div>
      )}
    </div>
  );
}
