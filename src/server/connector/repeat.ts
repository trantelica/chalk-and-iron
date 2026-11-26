import { createHash } from 'node:crypto';
import type { Caller } from './auth';

// The one-minute repeat guard (design Section 3, end of "Propose tools"): a
// propose call repeated word for word within a minute returns the first
// proposal, so a coach app that retries does not fill the inbox with copies.
// Each proposal stores a fingerprint of the call that made it
// (proposals.request_hash); stage 4E's propose tools call addProposal.

export const REPEAT_WINDOW_SECONDS = 60;

/** The same value with object keys in a fixed order, so key order never makes two calls differ. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** A fingerprint of one call: the tool and its inputs, word for word. */
export function requestHash(tool: string, args: unknown): string {
  return createHash('sha256').update(tool + '\n' + JSON.stringify(canonical(args ?? {}))).digest('hex');
}

export interface ProposalDraft {
  source: string;
  kind: 'exercise' | 'workout' | 'campaign' | 'today_change' | 'profile_update';
  applies_to: 'today' | 'library' | 'campaign' | 'profile';
  summary_lines: string[];
  payload: unknown;
  expires_at?: string | null;
  targets?: Array<{ record_kind: string; record_id: string; version_seen: number | null }>;
}

export interface AddedProposal {
  proposal_id: string;
  status: string;
  applies_to: string;
  expires_at: string | null;
  /** True when this was a repeat of a call made in the last minute, and nothing new was added. */
  repeat: boolean;
}

const COLUMNS = 'id, status, applies_to, expires_at';
type Row = { id: string; status: string; applies_to: string; expires_at: string | null };
const shape = (r: Row, repeat: boolean): AddedProposal => ({ proposal_id: r.id, status: r.status, applies_to: r.applies_to, expires_at: r.expires_at, repeat });

/** This person's proposal made by the same call in the last minute, if any. */
export async function findRepeat(caller: Caller, hash: string, now = new Date()): Promise<AddedProposal | null> {
  const since = new Date(now.getTime() - REPEAT_WINDOW_SECONDS * 1000).toISOString();
  const { data, error } = await caller.db
    .from('proposals')
    .select(COLUMNS)
    .eq('request_hash', hash)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error('repeat check: ' + error.message);
  return data && data.length ? shape(data[0] as Row, true) : null;
}

/**
 * Adds one pending proposal with its targets, unless the same call made one in
 * the last minute, in which case that one comes back. The database allows a
 * coach's pass to add exactly these rows and nothing else (the coach lock).
 */
export async function addProposal(caller: Caller, tool: string, args: unknown, draft: ProposalDraft): Promise<AddedProposal> {
  const hash = requestHash(tool, args);
  const earlier = await findRepeat(caller, hash);
  if (earlier) return earlier;
  const { data, error } = await caller.db
    .from('proposals')
    .insert({
      user_id: caller.userId,
      source: draft.source,
      kind: draft.kind,
      applies_to: draft.applies_to,
      summary_lines: draft.summary_lines,
      payload: draft.payload,
      expires_at: draft.expires_at ?? null,
      request_hash: hash,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error('proposal insert: ' + (error?.message ?? 'nothing returned'));
  const row = data as Row;
  if (draft.targets?.length) {
    const { error: e2 } = await caller.db
      .from('proposal_targets')
      .insert(draft.targets.map((t) => ({ ...t, user_id: caller.userId, proposal_id: row.id })));
    if (e2) throw new Error('proposal targets insert: ' + e2.message);
  }
  return shape(row, false);
}
