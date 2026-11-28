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

export interface CheckInWeek { weekStart: string; label: string; marked: boolean; isThisWeek: boolean }

/** The last few weeks for Home, oldest first, ending with the week holding today, each marked when the coach read its summary. */
export function checkInWeeks(weekStarts: string[], today: string, count = 4): CheckInWeek[] {
  const marked = new Set(weekStarts.map((w) => w.slice(0, 10)));
  const thisMonday = mondayOf(today);
  const out: CheckInWeek[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const weekStart = addDays(thisMonday, -7 * i);
    const label = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    out.push({ weekStart, label, marked: marked.has(weekStart), isThisWeek: i === 0 });
  }
  return out;
}
