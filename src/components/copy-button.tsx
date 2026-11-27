'use client';
import { useState } from 'react';

/** Copies text, and says so. Where the browser refuses, it says to select and copy by hand. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'' | 'copied' | 'failed'>('');
  return (
    <span className="row">
      <button className={className ?? 'btn'} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('failed'); }
        setTimeout(() => setState(''), 3000);
      }}>{label}</button>
      <span className="muted" role="status">{state === 'copied' ? 'Copied.' : state === 'failed' ? 'Could not copy. Select the text and copy it yourself.' : ''}</span>
    </span>
  );
}
