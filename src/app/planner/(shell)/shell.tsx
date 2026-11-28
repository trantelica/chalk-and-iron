'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PlannerProvider, usePlannerMaybe } from '../planner-data';
import { SaveStatusLine } from '../save-status-line';
import { useWaitingCount } from '@/components/coach-count';

// Four tabs only, so they stay on one line at any width. The rest live in the Menu (Nate, 27 Nov).
const TABS: [string, string][] = [['/planner/plan', 'Plan'], ['/planner/library', 'Library'], ['/planner/history', 'History'], ['/planner/proposals', 'Proposals']];
const MENU_LINKS: [string, string][] = [['/planner/vocabulary', 'Vocabulary'], ['/planner/coach-setup', 'Coach setup'], ['/planner/profile', 'Profile and gyms'], ['/planner/account', 'Account']];

// These two read and save their own rows, so they open without waiting for the library to load.
const OWN_DATA = ['/planner/coach-setup', '/planner/profile'];

export function Tabs({ tabs, label, badges }: { tabs: [string, string][]; label: string; badges?: Record<string, number | null> }) {
  const path = usePathname();
  return (
    <nav className="tabs one-line" aria-label={label}>
      {tabs.map(([href, text]) => (
        <Link key={href} href={href} className={`btn ${path === href || path.startsWith(href + '/') ? 'selected' : ''}`} aria-current={path.startsWith(href) ? 'page' : undefined}>{text}{badges?.[href] ? <span className="badge" aria-label={`${badges[href]} waiting`}>{badges[href]}</span> : null}</Link>
      ))}
    </nav>
  );
}

// The Menu button at the top right: a simple list of links and the lb/kg switch.
// Escape or choosing an item closes it; a click outside closes it too.
function Menu({ isAdmin }: { isAdmin: boolean }) {
  const p = usePlannerMaybe();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const away = (ev: MouseEvent) => { if (wrap.current && !wrap.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, [open]);
  const links: [string, string][] = [...MENU_LINKS, ...(isAdmin ? [['/planner/admin', 'Admin'] as [string, string]] : []), ['/app', 'Phone home']];
  return (
    <div className="menu-wrap" ref={wrap}>
      <button ref={button} type="button" className="btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Menu</button>
      {open && (
        <div className="menu-list" id={id} role="group" aria-label="Planner menu">
          {links.map(([href, text]) => (
            <Link key={href} href={href} className="menu-item" aria-current={path.startsWith(href) ? 'page' : undefined} onClick={() => setOpen(false)}>{text}</Link>
          ))}
          {p && (
            <div className="menu-units" role="group" aria-label="Show weights in">
              <span className="muted">Weights in</span>
              {(['lb', 'kg'] as const).map((u) => (
                <button key={u} type="button" className={`btn small ${p.view === u ? 'selected' : ''}`} aria-pressed={p.view === u} onClick={() => { p.setView(u); setOpen(false); }}>{u === 'lb' ? 'Pounds' : 'Kilograms'}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Body({ children, isAdmin }: { children: React.ReactNode; isAdmin: boolean }) {
  const p = usePlannerMaybe();
  const waiting = useWaitingCount();
  const path = usePathname();
  const own = OWN_DATA.some((h) => path === h || path.startsWith(h + '/'));
  return (
    <main className="page wide planner">
      <div className="row spread planner-head"><h1>Planner</h1><SaveStatusLine /><Menu isAdmin={isAdmin} /></div>
      <Tabs tabs={TABS} label="Planner" badges={{ '/planner/proposals': waiting }} />
      {p?.error && !own && <div className="error" role="alert">{p.error}</div>}
      {own || p?.data ? children : !p?.error && <div className="muted">Loading your library…</div>}
    </main>
  );
}

export function PlannerShell({ children, isAdmin = false }: { children: React.ReactNode; isAdmin?: boolean }) {
  return <PlannerProvider><Body isAdmin={isAdmin}>{children}</Body></PlannerProvider>;
}
