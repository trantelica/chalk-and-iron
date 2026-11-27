'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlannerProvider, usePlannerMaybe } from '../planner-data';
import { SaveStatusLine } from '../save-status-line';
import { useWaitingCount } from '@/components/coach-count';

const TABS: [string, string][] = [['/planner/plan', 'Plan'], ['/planner/library', 'Library'], ['/planner/history', 'History'], ['/planner/proposals', 'Proposals'], ['/planner/vocabulary', 'Vocabulary'], ['/planner/coach-setup', 'Coach setup'], ['/planner/profile', 'Profile and gyms']];

// These two read and save their own rows, so they open without waiting for the library to load.
const OWN_DATA = ['/planner/coach-setup', '/planner/profile'];

export function Tabs({ tabs, label, badges }: { tabs: [string, string][]; label: string; badges?: Record<string, number | null> }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map(([href, text]) => (
        <Link key={href} href={href} className={`btn ${path === href || path.startsWith(href + '/') ? 'selected' : ''}`} aria-current={path.startsWith(href) ? 'page' : undefined}>{text}{badges?.[href] ? <span className="badge" aria-label={`${badges[href]} waiting`}>{badges[href]}</span> : null}</Link>
      ))}
    </nav>
  );
}

function Toggle() {
  const p = usePlannerMaybe();
  if (!p) return null;
  return (
    <div className="row" role="group" aria-label="Show weights in">
      <span className="muted">Weights in</span>
      {(['lb', 'kg'] as const).map((u) => (
        <button key={u} className={`btn small ${p.view === u ? 'selected' : ''}`} aria-pressed={p.view === u} onClick={() => p.setView(u)}>{u === 'lb' ? 'Pounds' : 'Kilograms'}</button>
      ))}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const p = usePlannerMaybe();
  const waiting = useWaitingCount();
  const path = usePathname();
  const own = OWN_DATA.some((h) => path === h || path.startsWith(h + '/'));
  return (
    <main className="page wide planner">
      <div className="row spread"><h1>Planner</h1><SaveStatusLine /><Toggle /></div>
      <Tabs tabs={TABS} label="Planner" badges={{ '/planner/proposals': waiting }} />
      {p?.error && !own && <div className="error" role="alert">{p.error}</div>}
      {own || p?.data ? children : !p?.error && <div className="muted">Loading your library…</div>}
      <div className="row"><Link className="btn link-btn" href="/app">Phone home</Link><Link className="btn link-btn" href="/planner/account">Account</Link></div>
    </main>
  );
}

export function PlannerShell({ children }: { children: React.ReactNode }) {
  return <PlannerProvider><Body>{children}</Body></PlannerProvider>;
}
