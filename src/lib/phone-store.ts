'use client';
// What the phone keeps, and how it reaches the account (design Section 6).
// Everything is stored per person, so a second person signing in on the same
// phone never sees the first one's workout. Every call to the account uses
// the person's own sign-in, so row-level security applies.

import { browserClient } from '@/lib/supabase/browser';
import { Outbox } from '@/lib/outbox';
import { historyFromMemory, sessionFromRows, type Change, type LibraryFacts, type MemoryRow, type SyncAnswer } from '@/rules/sync';
import type { History, Session } from '@/rules/session';
import type { AcceptedToday, TodayChange } from '@/rules/today-change';

const PREFIX = 'ci2';
export const keyFor = (userId: string, what: 'session' | 'last' | 'outbox' | 'history' | 'memory' | 'units' | 'push' | 'made') => `${PREFIX}:${userId}:${what}`;

export function readStore<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function writeStore(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be full or blocked */ }
}

/** The phone-only keys from before saving to the account existed. They are left behind. */
export function forgetOldPhoneOnlyData() {
  try { for (const k of ['ci-session-v1', 'ci-history-v1', 'ci-units-v1', 'ci-notes-v1']) localStorage.removeItem(k); } catch { /* blocked */ }
}

/** Everything this app keeps on the phone for a person, cleared at sign-out. */
export function clearPhone(userId?: string) {
  try {
    const gone: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(`${PREFIX}:`) && (!userId || k.startsWith(`${PREFIX}:${userId}:`))) gone.push(k);
    }
    gone.forEach((k) => localStorage.removeItem(k));
  } catch { /* blocked */ }
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  Promise.race([Promise.resolve(p), new Promise<T>((_, no) => setTimeout(() => no(new Error('Failed to fetch: timed out')), ms))]);

/** Sends changes to the account, through the database's one door for them. */
export async function sendChanges(changes: Change[]): Promise<SyncAnswer> {
  const { data, error } = await withTimeout(
    browserClient().rpc('apply_changes', { p_changes: changes.map(({ id, kind, data }) => ({ id, kind, data })) }),
    20000,
  );
  if (error) throw new Error(error.message || error.code || 'Failed to fetch');
  return data as SyncAnswer;
}

const boxes = new Map<string, Outbox>();
/** One outbox per person on this phone, kept in the phone's storage. */
export function outboxFor(userId: string): Outbox {
  let box = boxes.get(userId);
  if (!box) {
    const k = keyFor(userId, 'outbox');
    box = new Outbox({ load: () => readStore<Change[]>(k, []), save: (q) => writeStore(k, q), send: sendChanges });
    boxes.set(userId, box);
  }
  return box;
}

/** The account's history for "Last time", seeded weights, the graph and records. */
export async function fetchHistory(excludeSessionId: string | null): Promise<History> {
  const { data, error } = await withTimeout(browserClient().rpc('exercise_memory', { p_exclude: excludeSessionId }), 15000);
  if (error) throw new Error(error.message);
  return historyFromMemory((data ?? []) as MemoryRow[]);
}

export interface ActiveElsewhere { id: string; workout_name: string; started_at: string; last_activity_at: string }

/** The workout running in the account, if any (only one can be). */
export async function activeOnServer(): Promise<ActiveElsewhere | null> {
  const { data, error } = await withTimeout(
    browserClient().from('sessions').select('id, workout_name, started_at, last_activity_at').eq('status', 'active').limit(1),
    5000,
  );
  if (error) throw new Error(error.message);
  return (data?.[0] as ActiveElsewhere | undefined) ?? null;
}

/**
 * Which of these workouts the account ended as 'replaced': a day sent from
 * the planner was accepted while it ran (spec Section 10, "Proposals"). Asked
 * on open and on return to the screen, so an idle phone learns it too.
 */
export async function replacedOnServer(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data, error } = await withTimeout(
    browserClient().from('sessions').select('id').in('id', ids).eq('finish_reason', 'replaced'),
    5000,
  );
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * The coach's changes to this workout accepted after this phone's copy was
 * made (stage 4D), oldest first, for the phone to replay on its own copy.
 */
export async function acceptedTodayFor(sessionId: string, after: number): Promise<AcceptedToday[]> {
  const { data, error } = await withTimeout(
    browserClient().from('proposals').select('id, result').eq('status', 'accepted').eq('kind', 'today_change').eq('result->>session_id', sessionId),
    5000,
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; result: { plan_revision?: number; changes?: TodayChange[] } | null }[])
    .map((p) => ({ proposalId: p.id, revision: Number(p.result?.plan_revision ?? 0), changes: p.result?.changes ?? [] }))
    .filter((a) => a.revision > after)
    .sort((a, b) => a.revision - b.revision);
}

/** Rebuilds a workout from the account, to carry on with it on this phone. */
export async function loadServerSession(id: string, lib: (id: string) => LibraryFacts | undefined): Promise<Session> {
  const sb = browserClient();
  const [s, b, x] = await Promise.all([
    sb.from('sessions').select('*').eq('id', id).single(),
    sb.from('session_blocks').select('*').eq('session_id', id),
    sb.from('session_exercises').select('*').eq('session_id', id),
  ]);
  if (s.error || b.error || x.error) throw new Error((s.error ?? b.error ?? x.error)!.message);
  const ids = (x.data ?? []).map((r) => r.id as string);
  const l = ids.length ? await sb.from('set_logs').select('*').in('session_exercise_id', ids).is('deleted_at', null) : { data: [], error: null };
  if (l.error) throw new Error(l.error.message);
  return sessionFromRows(s.data, b.data ?? [], x.data ?? [], l.data ?? [], lib);
}

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

/**
 * Turns on rest alerts for this phone: asks permission (only after a tap, as
 * an iPhone requires), and saves the phone's notification address to the account.
 * With `quiet`, only refreshes the saved address when permission was already given.
 */
export async function turnOnRestAlerts(userId: string, quiet = false): Promise<string> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushSupported()) return 'This browser cannot show notifications. On an iPhone, add the app to your home screen and open it from there.';
  if (!vapid) return 'Notifications are not set up on the server yet.';
  if (quiet && Notification.permission !== 'granted') return '';
  const p = quiet ? Notification.permission : await Notification.requestPermission();
  if (p !== 'granted') return 'Notifications are off. Turn them on in Settings > Notifications > Chalk and Iron.';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) }));
  const j = sub.toJSON();
  const { error } = await browserClient().from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, keys: j.keys ?? {}, device_label: navigator.userAgent.slice(0, 120) },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) return 'Could not save this phone for rest alerts. Try again with a connection.';
  writeStore(keyFor(userId, 'push'), j.endpoint);
  return 'Rest alerts are on for this phone.';
}

/** Lets the app open with no connection: the service worker keeps a copy of the app. */
export function registerServiceWorker() {
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch { /* not available */ }
}

/**
 * Sign-out (design Section 4): sends anything still unsent, then clears what
 * the app stored on this phone. Returns how many changes could not be sent,
 * without clearing, so the person can choose.
 */
export async function sendBeforeSignOut(): Promise<number> {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^ci2:([^:]+):outbox$/.exec(localStorage.key(i) ?? '');
      if (m) ids.add(m[1]);
    }
  } catch { /* blocked */ }
  let left = 0;
  for (const id of ids) {
    const box = outboxFor(id);
    await box.flush().catch(() => {});
    left += box.count;
  }
  return left;
}

export async function clearPhoneCopy() {
  clearPhone();
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* not available */ }
}

/**
 * Drops this phone's own copy of a workout that the account has just ended
 * as replaced (Accept on Home mid-workout, review finding 5, 23 Nov), so the
 * workout screen opens on the day that was sent, not the old workout.
 * Sets still waiting to be sent stay in the outbox and are sent as usual.
 */
export function dropLocalCopyOf(userId: string, sessionId: string) {
  for (const what of ['session', 'last'] as const) {
    const k = keyFor(userId, what);
    const s = readStore<{ id?: string } | null>(k, null);
    if (s?.id === sessionId) writeStore(k, null);
  }
}
