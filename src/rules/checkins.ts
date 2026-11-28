// Weekly check-ins (spec Section 2, "Coach"): the coach reading a week's
// summary marks that week. "Check-ins in a row" counts weeks back, unbroken,
// from the most recent full week (spec Section 8, Phase 4 acceptance tests).

import { addDays, mondayOf } from './days';

/** How many weeks in a row, ending with the most recent full week, have a check-in. */
export function checkInsInARow(weekStarts: string[], today: string): number {
  const marked = new Set(weekStarts.map((w) => w.slice(0, 10)));
  let week = addDays(mondayOf(today), -7);
  let n = 0;
  while (marked.has(week)) {
    n += 1;
    week = addDays(week, -7);
  }
  return n;
}

export interface CheckInWeek {
  weekStart: string;
  /** "Nov 2" */
  label: string;
  /** "Week of Nov 2", or "This week" for the week holding today. */
  title: string;
  marked: boolean;
  isThisWeek: boolean;
}

/** The most finished weeks Home shows, however long the run. */
export const MOST_WEEKS_SHOWN = 12;
/** The fewest finished weeks Home shows. */
export const FEWEST_WEEKS_SHOWN = 4;

function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The weeks for Home, oldest first, ending with this week. Finished weeks
 * shown: enough to cover the count in a row, at least four (at most twelve,
 * the latest ones). This week comes last: it is not over, so it is never
 * marked missed and never counted (the count only includes finished weeks).
 */
export function checkInWeeks(weekStarts: string[], today: string, minFinished = FEWEST_WEEKS_SHOWN): CheckInWeek[] {
  const marked = new Set(weekStarts.map((w) => w.slice(0, 10)));
  const thisMonday = mondayOf(today);
  const finished = Math.min(MOST_WEEKS_SHOWN, Math.max(minFinished, checkInsInARow(weekStarts, today)));
  const out: CheckInWeek[] = [];
  for (let i = finished; i >= 0; i -= 1) {
    const weekStart = addDays(thisMonday, -7 * i);
    const label = weekLabel(weekStart);
    out.push({ weekStart, label, title: i === 0 ? 'This week' : `Week of ${label}`, marked: i > 0 && marked.has(weekStart), isThisWeek: i === 0 });
  }
  return out;
}

/** The line under the weeks: the count and where it starts. */
export function checkInLine(weekStarts: string[], today: string): string {
  const n = checkInsInARow(weekStarts, today);
  if (!n) return 'No check-ins in a row yet.';
  const since = weekLabel(addDays(mondayOf(today), -7 * n));
  return `${n} check-in${n === 1 ? '' : 's'} in a row, since the week of ${since}.`;
}
