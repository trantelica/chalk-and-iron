import { connectorEnv } from './config';
import type { Caller } from './auth';
import { CALL_LIMITS } from './limits';

// The call log (design Section 2, connector_calls): which coach app called
// which tool, whether it worked, and when. No content is stored. Written only
// through the guarded step record_connector_call (stage 4A), which stamps the
// time and keeps 30 days. It powers the connection test, the "last used" line
// and too-many-requests.

/** Times of this person's logged calls within the longest limit window, newest first. */
export async function recentCallTimes(caller: Caller): Promise<Date[]> {
  const longest = Math.max(...CALL_LIMITS.map((l) => l.seconds));
  const most = Math.max(...CALL_LIMITS.map((l) => l.calls));
  const since = new Date(Date.now() - longest * 1000).toISOString();
  const { data, error } = await caller.db
    .from('connector_calls')
    .select('called_at')
    .gte('called_at', since)
    .order('called_at', { ascending: false })
    .limit(most);
  if (error) throw new Error('call log read: ' + error.message);
  return (data ?? []).map((r) => new Date(r.called_at as string));
}

export async function logCall(caller: Caller, clientName: string, tool: string, ok: boolean): Promise<void> {
  const { error } = await caller.db.rpc('record_connector_call', { p_client_name: clientName, p_tool: tool, p_ok: ok });
  // A call that worked is not failed afterwards because its log line was not written.
  if (error) console.error('CONNECTOR_LOG_FAILED', error.message.slice(0, 200));
}

/**
 * A coach app's name as the user would know it ("ChatGPT", "Claude"), for the
 * call log and for a proposal's source. Each app registers itself with
 * Supabase under its own name; the person's list of connected apps, read with
 * the coach's own pass, gives it. Names never change, so they are kept for the
 * life of the server.
 */
const names: Map<string, string> = ((globalThis as { __ciCoachNames?: Map<string, string> }).__ciCoachNames ??= new Map());

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  // 'planner' is the source the app's own planner uses for its cards (design Section 2).
  return !s || s.toLowerCase() === 'planner' ? 'Coach app' : s;
}

export async function clientName(caller: Caller): Promise<string> {
  const known = names.get(caller.clientId);
  if (known) return known;
  try {
    const { supabaseUrl, publishableKey } = connectorEnv();
    const r = await fetch(supabaseUrl + '/auth/v1/user/oauth/grants', {
      headers: { apikey: publishableKey, authorization: 'Bearer ' + caller.token, accept: 'application/json' },
    });
    if (r.ok) {
      const grants = (await r.json()) as Array<{ client?: { id?: string; client_id?: string; name?: string; client_name?: string } }>;
      const mine = (Array.isArray(grants) ? grants : []).find((g) => (g.client?.id ?? g.client?.client_id) === caller.clientId);
      if (mine) {
        const name = cleanName(mine.client?.name ?? mine.client?.client_name);
        names.set(caller.clientId, name);
        return name;
      }
    }
  } catch {
    // fall through to the plain name
  }
  return 'Coach app';
}
