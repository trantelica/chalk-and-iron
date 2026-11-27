'use client';
import { ProposalCards } from '@/components/proposal-cards';

// Proposals (spec Section 5, "Browser planner: new screens"): the same inbox as
// the phone's Coach screen, in the wide planner, with room for a full campaign.
export default function ProposalsPage() {
  return (
    <>
      <div className="muted">
        Your coach&apos;s proposals and days sent from the planner, newest first. Accept applies the whole card or none of it. Decline leaves everything as it was, and you can tell your coach why.
      </div>
      <ProposalCards mode="all" className="pbox cards proposals-wide" />
    </>
  );
}
