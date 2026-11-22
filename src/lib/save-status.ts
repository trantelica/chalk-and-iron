'use client';
// Whether the app is saving a change to the account right now, so a screen
// can say "Saving…", "All changes saved" or "Not saved" (Nate, 21 Nov: it was
// not clear that an edit had saved). Every change the browser sends through
// the app's sign-in passes through here (src/lib/supabase/browser.ts).

export type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'failed'; message: string };

let pending = 0;
let current: SaveState = { state: 'idle' };
const listeners = new Set<(s: SaveState) => void>();
const set = (s: SaveState) => { current = s; for (const l of listeners) l(s); };

export function saveState(): SaveState { return current; }
export function onSaveState(fn: (s: SaveState) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** True for a request that changes something: anything but a read of a table or the sign-in service. */
export function isChange(url: string, method: string): boolean {
  if (!url.includes('/rest/v1/')) return false;
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  // exercise_memory is a read the phone makes through a function call.
  return !url.includes('/rpc/exercise_memory');
}

/** A fetch that reports changes as they start and finish. */
export function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (!isChange(url, method)) return fetch(input, init);
  pending += 1;
  set({ state: 'saving' });
  return fetch(input, init).then((res) => {
    pending -= 1;
    if (!res.ok) set({ state: 'failed', message: `The account refused the change (${res.status}).` });
    else if (pending === 0 && current.state !== 'failed') set({ state: 'saved', at: Date.now() });
    return res;
  }, (err: unknown) => {
    pending -= 1;
    set({ state: 'failed', message: 'No connection, so the change was not saved. Try again.' });
    throw err;
  });
}

/** Clears a "Not saved" once the person has seen it and tries again. */
export function clearFailure(): void { if (current.state === 'failed') set({ state: 'idle' }); }
