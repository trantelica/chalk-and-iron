// The planner's saving line (Nate, 21 Nov): only changes count as saving.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChange, onSaveState, trackedFetch, type SaveState } from '@/lib/save-status';

describe('what counts as a change being saved', () => {
  it('reads are not changes; writes and guarded steps are', () => {
    expect(isChange('https://x.supabase.co/rest/v1/exercises?select=*', 'GET')).toBe(false);
    expect(isChange('https://x.supabase.co/rest/v1/exercises?id=eq.1', 'PATCH')).toBe(true);
    expect(isChange('https://x.supabase.co/rest/v1/workout_items', 'POST')).toBe(true);
    expect(isChange('https://x.supabase.co/rest/v1/rpc/apply_changes', 'POST')).toBe(true);
    expect(isChange('https://x.supabase.co/rest/v1/rpc/exercise_memory', 'POST')).toBe(false);
    expect(isChange('https://x.supabase.co/auth/v1/token', 'POST')).toBe(false);
  });
});

describe('the saving line follows a change', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('goes Saving, then Saved; a refused change says Not saved', async () => {
    const seen: SaveState['state'][] = [];
    const off = onSaveState((s) => seen.push(s.state));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    await trackedFetch('https://x/rest/v1/exercises?id=eq.1', { method: 'PATCH' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 409 })));
    await trackedFetch('https://x/rest/v1/exercises?id=eq.1', { method: 'PATCH' });
    off();
    expect(seen).toEqual(['saving', 'saved', 'saving', 'failed']);
  });
});
