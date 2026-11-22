'use client';
import { useEffect, useState } from 'react';
import { onSaveState, saveState, type SaveState } from '@/lib/save-status';

// The planner's saving line, always in the same place at the top: "Saving…",
// "All changes saved" (with the time) or "Not saved" (Nate, 21 Nov).
export function SaveStatusLine() {
  const [s, setS] = useState<SaveState>({ state: 'idle' });
  useEffect(() => { setS(saveState()); return onSaveState(setS); }, []);
  const text = s.state === 'saving' ? 'Saving…'
    : s.state === 'saved' ? `All changes saved · ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : s.state === 'failed' ? `Not saved. ${s.message}` : 'Changes save as you make them';
  return <div className={`save-line ${s.state}`} role="status" aria-live="polite">{text}</div>;
}
