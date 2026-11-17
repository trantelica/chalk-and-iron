// Days and weeks (spec Section 10). The day rolls over at 3:00 am in the
// user's time zone, and weeks run Monday to Sunday.

export const ROLLOVER_HOUR = 3;

function partsIn(timeZone: string, at: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
}

/** Calendar date as 2026-11-17, for a plain y/m/d. */
function iso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** The training day a moment belongs to: before 3:00 am counts as the day before. */
export function trainingDay(at: Date, timeZone: string): string {
  const { y, m, d, h } = partsIn(timeZone, at);
  return h < ROLLOVER_HOUR ? iso(y, m, d - 1) : iso(y, m, d);
}

/** ISO weekday, 1 is Monday and 7 is Sunday. */
export function weekday(date: string): number {
  const n = new Date(date + 'T00:00:00Z').getUTCDay();
  return n === 0 ? 7 : n;
}

export function addDays(date: string, days: number): string {
  const dt = new Date(date + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The Monday of the week holding a date. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - weekday(date));
}

/**
 * Where a date falls in a campaign: week 1 is the week holding the start date
 * (decided 17 Nov, question 19). Shifted weeks (each a blank Monday-to-Sunday
 * week) push later days back a week without counting toward the six.
 * Returns null outside the campaign.
 */
export function campaignPosition(
  date: string,
  startDate: string,
  weekCount: number,
  blankWeeks: string[] = [],
): { week: number; weekday: number } | null {
  const monday = mondayOf(date);
  if (blankWeeks.includes(monday)) return null;
  const first = mondayOf(startDate);
  if (monday < first) return null;
  const weeksSince = Math.round((Date.parse(monday) - Date.parse(first)) / (7 * 86400000));
  const skipped = blankWeeks.filter((b) => b >= first && b < monday).length;
  const week = weeksSince - skipped + 1;
  if (week < 1 || week > weekCount) return null;
  if (week === 1 && date < startDate) return null;
  return { week, weekday: weekday(date) };
}

/** The next 3:00 am rollover after a moment, when today proposals expire. */
export function nextRollover(at: Date, timeZone: string): Date {
  // Search forward hour by hour for the first instant whose training day differs.
  const today = trainingDay(at, timeZone);
  let t = new Date(Math.floor(at.getTime() / 3600000) * 3600000);
  for (let i = 0; i < 50; i++) {
    t = new Date(t.getTime() + 3600000);
    if (trainingDay(t, timeZone) !== today) return t;
  }
  throw new Error('No rollover found');
}
