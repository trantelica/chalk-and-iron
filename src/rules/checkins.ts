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
