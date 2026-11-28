'use client';
import type { ReactNode } from 'react';

// A section that starts closed and says in one line what is inside. Native
// details and summary, so it works with the keyboard and screen readers. Only
// what is shown changes; nothing here saves anything.
export function Collapsible({ title, summary, open, onToggle, className, children }: {
  title: string;
  summary?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={`coll ${className ?? ''}`} open={open} onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}>
      <summary>
        <span className="coll-title">{title}</span>
        {summary && <span className="coll-sum muted">{summary}</span>}
      </summary>
      <div className="coll-body stack">{children}</div>
    </details>
  );
}
