'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlannerProvider, usePlannerMaybe } from '../planner-data';

const TABS: [string, string][] = [['/planner/plan', 'Plan'], ['/planner/library', 'Library'], ['/planner/history', 'History'], ['/planner/vocabulary', 'Vocabulary']];

export function Tabs({ tabs, label }: { tabs: [string, string][]; label: string }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map(([href, text]) => (
        <Link key={href} href={href} className={`btn ${path === href || path.startsWith(href + '/') ? 'selected' : ''}`} aria-current={path.startsWith(href) ? 'page' : undefined}>{text}</Link>
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
  return (
    <main className="page wide">
      <div className="row spread"><h1>Planner</h1><Toggle /></div>
      <Tabs tabs={TABS} label="Planner" />
      {p?.error && <div className="error" role="alert">{p.error}</div>}
      {p?.data ? children : !p?.error && <div className="muted">Loading your library…</div>}
      <div className="row"><Link className="btn" href="/app">Phone home</Link><Link className="btn" href="/planner/account">Account</Link></div>
    </main>
  );
}

export function PlannerShell({ children }: { children: React.ReactNode }) {
  return <PlannerProvider><Body>{children}</Body></PlannerProvider>;
}
