import { describe, expect, it } from 'vitest';
import { campaignStatusLine, startQuestion } from '../../src/rules/campaign-run';

describe('the plain status line of a campaign (Library)', () => {
  it('says Draft, Running since, and Finished on', () => {
    expect(campaignStatusLine({ status: 'draft', start_date: '2026-11-23' }, 'America/Denver')).toBe('Draft');
    expect(campaignStatusLine({ status: 'active', start_date: '2026-11-23' }, 'America/Denver')).toBe('Running since Nov 23');
    expect(campaignStatusLine({ status: 'finished', start_date: '2026-11-23', updated_at: '2026-12-21T15:00:00Z' }, 'America/Denver')).toBe('Finished on Dec 21');
  });
});

describe('the question before a campaign starts', () => {
  it('a finished campaign says its last run\'s changes are not kept', () => {
    expect(startQuestion('Block', '2026-12-01', null, true)).toContain('not kept');
    expect(startQuestion('Block', '2026-12-01', null, false)).not.toContain('not kept');
  });
  it('names the campaign it will end', () => {
    expect(startQuestion('Block', '2026-12-01', 'Other', false)).toContain('"Other" is running now and will end');
  });
});
