import { describe, expect, it } from 'vitest';
import { checkInWeeks, checkInsInARow } from '@/rules/checkins';
import { todayView, type TodayInput } from '@/rules/today';

// Home's weekly check-in marks and the last-week note (spec Section 5, Home).
describe('check-in marks on Home', () => {
  it('shows the last four weeks, oldest first, marking the weeks the coach read', () => {
    const w = checkInWeeks(['2026-11-16', '2026-11-02'], '2026-11-25'); // a Wednesday; this week starts 23 Nov
    expect(w.map((x) => x.weekStart)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(w.map((x) => x.marked)).toEqual([true, false, true, false]);
    expect(w[3].isThisWeek).toBe(true);
  });
  it('uses the same count in a row as the coach summary', () => {
    expect(checkInsInARow(['2026-11-16', '2026-11-09', '2026-11-02'], '2026-11-25')).toBe(3);
    expect(checkInsInARow(['2026-11-23', '2026-11-09'], '2026-11-25')).toBe(0);
  });
});

describe("the campaign's last-week note", () => {
  const input = (date: string, shifts: TodayInput['shifts'] = []): TodayInput => ({
    date,
    campaigns: [{ id: 'c1', name: 'Base Block', start_date: '2026-11-16', week_count: 2, status: 'active' }],
    days: [], shifts, overrides: [], workouts: [], items: [], todayPlans: [], sessions: [],
  });
  it('shows only in the week holding the end date', () => {
    expect(todayView(input('2026-11-19')).campaign?.lastWeek).toBe(false); // week 1
    expect(todayView(input('2026-11-25')).campaign?.lastWeek).toBe(true); // week 2 of 2
    expect(todayView(input('2026-11-29')).campaign?.lastWeek).toBe(true); // its Sunday
  });
  it('moves with a shifted (blank) week', () => {
    const s = [{ campaign_id: 'c1', blank_week_starts_on: '2026-11-23' }];
    expect(todayView(input('2026-11-25', s)).campaign?.lastWeek).toBe(false);
    expect(todayView(input('2026-12-02', s)).campaign?.lastWeek).toBe(true);
  });
});
