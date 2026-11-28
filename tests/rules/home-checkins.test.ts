import { describe, expect, it } from 'vitest';
import { checkInWeeks, checkInLine, checkInsInARow } from '@/rules/checkins';
import { addDays } from '@/rules/days';
import { todayView, type TodayInput } from '@/rules/today';

// Home's weekly check-in marks and the last-week note (spec Section 5, Home).
describe('check-in marks on Home', () => {
  const TODAY = '2026-11-25'; // a Wednesday; this week starts 23 Nov
  it('shows four finished weeks and this week, oldest first, marking the weeks the coach read', () => {
    const w = checkInWeeks(['2026-11-16', '2026-11-02'], TODAY);
    expect(w.map((x) => x.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(w.map((x) => x.marked)).toEqual([false, true, false, true, false]);
    expect(w.map((x) => x.title)).toEqual(['Week of Oct 26', 'Week of Nov 2', 'Week of Nov 9', 'Week of Nov 16', 'This week']);
  });
  it('this week is never marked, never counted, and is the only one flagged as not over', () => {
    const w = checkInWeeks(['2026-11-23', '2026-11-16'], TODAY);
    expect(w[w.length - 1]).toMatchObject({ isThisWeek: true, marked: false, title: 'This week' });
    expect(w.filter((x) => x.isThisWeek)).toHaveLength(1);
    expect(checkInsInARow(['2026-11-23', '2026-11-09'], TODAY)).toBe(0);
  });
  it('shows enough finished weeks to cover the count in a row (the eval account: 4 in a row, one 7 weeks back)', () => {
    const starts = ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26', '2026-10-05'];
    expect(checkInsInARow(starts, TODAY)).toBe(4);
    const w = checkInWeeks(starts, TODAY);
    expect(w).toHaveLength(5);
    expect(w.filter((x) => x.marked)).toHaveLength(4);
    // A longer run grows the panel; a very long one stops at twelve finished weeks.
    const long = Array.from({ length: 7 }, (_, i) => addDays('2026-11-16', -7 * i));
    expect(checkInWeeks(long, TODAY)).toHaveLength(8);
    const huge = Array.from({ length: 30 }, (_, i) => addDays('2026-11-16', -7 * i));
    expect(checkInWeeks(huge, TODAY)).toHaveLength(13);
  });
  it('the line says where the count starts', () => {
    expect(checkInLine(['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26'], TODAY)).toBe('4 check-ins in a row, since the week of Oct 26.');
    expect(checkInLine(['2026-11-16'], TODAY)).toBe('1 check-in in a row, since the week of Nov 16.');
    expect(checkInLine(['2026-11-23'], TODAY)).toBe('No check-ins in a row yet.');
  });
  it('uses the same count in a row as the coach summary', () => {
    expect(checkInsInARow(['2026-11-16', '2026-11-09', '2026-11-02'], TODAY)).toBe(3);
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
