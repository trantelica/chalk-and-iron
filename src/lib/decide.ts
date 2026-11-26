// Accept or Decline a card in the inbox, on the phone or in the planner
// (stage 4D). The database decides (public.decide_proposal); a card for today
// is first worked out with the same rules the phone uses (src/rules/decide.ts).
// The inbox screens of stage 4F call this.

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayDecision, type ProposalContext } from '@/rules/decide';
import type { DecideAnswer } from '@/rules/inbox';

/**
 * Decides one card. A decline may carry a one-line reason (up to 300
 * characters). An Accept of a card for today reads the account again and
 * retries if the workout changed while it was being worked out.
 */
export async function decideCard(sb: SupabaseClient, id: string, accept: boolean, reason?: string | null): Promise<DecideAnswer> {
  const call = async (today: unknown) => {
    const r = await sb.rpc('decide_proposal', { p_proposal: id, p_accept: accept, p_reason: accept ? null : reason ?? null, p_today: today ?? null });
    if (r.error) return { ok: false, message: r.error.message } as DecideAnswer;
    return r.data as DecideAnswer;
  };
  if (!accept) return call(null);
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await sb.rpc('proposal_context', { p_proposal: id });
    if (c.error) return { ok: false, message: c.error.message };
    const ctx = c.data as ProposalContext;
    if (!ctx.proposal || ctx.proposal.kind !== 'today_change' || ctx.proposal.source === 'planner' || ctx.proposal.status !== 'pending') return call(null);
    const d = todayDecision(ctx, Date.now());
    if ('wait' in d) return { ok: false, status: 'pending', code: 'wait', message: `Not accepted yet. ${d.wait}` };
    const answer = await call(d.send);
    if (answer.code !== 'try_again') return answer;
  }
  return { ok: false, status: 'pending', code: 'try_again', message: 'Your workout kept changing while this was being accepted. Try again.' };
}
