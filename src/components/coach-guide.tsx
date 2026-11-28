import Link from 'next/link';
import { Collapsible } from '@/components/collapsible';
import { GUIDE_GROUPS, NO_COACH_LINK_LINE } from '@/lib/coach-guide';

/** Opens the saved coach project (an https link). With none saved, says where to add it. */
export function OpenCoachLink({ link, onSetupPage = false }: { link: string | null; onSetupPage?: boolean }) {
  if (link) return <a className="btn link-btn" href={link} target="_blank" rel="noreferrer">Open my coach</a>;
  return (
    <div className="muted">
      {onSetupPage ? 'No coach link is saved yet. Add it in step 5, above.' : NO_COACH_LINK_LINE}
      {!onSetupPage && <> <Link href="/planner/coach-setup">Open Coach setup</Link></>}
    </div>
  );
}

/** "What you can ask your coach": example things to say, by moment. Nothing here sends anything. */
export function CoachGuide({ link, onSetupPage = false }: { link: string | null; onSetupPage?: boolean }) {
  return (
    <section className="panel coach-guide" aria-label="What you can ask your coach">
      <h2>What you can ask your coach</h2>
      <div className="muted">Say these in your coach chat in ChatGPT or Claude, in your own words. They are only examples.</div>
      {GUIDE_GROUPS.map((g) => (
        <Collapsible key={g.id} title={g.title}>
          <ul className="guide-list">
            {g.examples.map((x) => <li key={x}>&ldquo;{x}&rdquo;</li>)}
          </ul>
          <div className="muted guide-next">{g.next}</div>
        </Collapsible>
      ))}
      <OpenCoachLink link={link} onSetupPage={onSetupPage} />
    </section>
  );
}
