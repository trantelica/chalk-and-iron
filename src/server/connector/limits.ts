import { z } from 'zod';
import { ConnectorError } from './errors';

// Size limits and too-many-requests (design Section 3, "Rules shared by every tool").

/** The largest request the connector reads. A full campaign proposal is far smaller. */
export const MAX_REQUEST_BYTES = 256 * 1024;
/** At most this many messages in one request (an old form of MCP sends several at once). */
export const MAX_BATCH = 20;
/** List tools return at most 50 items unless noted, with a "next" marker for more. */
export const PAGE_SIZE = 50;

/** Tool calls allowed per person, across all their coach apps. A coach answering one question makes a handful. */
export const CALL_LIMITS = [
  { seconds: 60, calls: 60 },
  { seconds: 3600, calls: 600 },
] as const;

/**
 * Given the times of this person's recent logged calls (newest first or in
 * any order) and the time now, says how long to wait, or null when a call may go ahead.
 */
export function waitSeconds(calledAt: Date[], now: Date): number | null {
  const times = calledAt.map((d) => d.getTime()).sort((a, b) => b - a);
  let wait = 0;
  for (const { seconds, calls } of CALL_LIMITS) {
    const since = now.getTime() - seconds * 1000;
    const inWindow = times.filter((t) => t > since);
    if (inWindow.length >= calls) {
      // The window frees a place when its oldest counted call leaves it.
      const oldest = inWindow[calls - 1];
      wait = Math.max(wait, Math.ceil((oldest + seconds * 1000 - now.getTime()) / 1000));
    }
  }
  return wait > 0 ? wait : null;
}

export function tooManyRequests(wait: number): ConnectorError {
  return new ConnectorError(
    'too_many_requests',
    `Too many calls in a short time. Wait ${wait} seconds, then try again. Read only what this answer needs.`,
    { retry_after_seconds: wait },
  );
}

// The "next" marker: an opaque word that holds where the next page starts.
export const nextInput = z.string().max(200).optional().describe('The "next" value from the previous page. Leave out for the first page.');

export function readNext(next: string | undefined): number {
  if (next === undefined || next === '') return 0;
  try {
    const v = JSON.parse(Buffer.from(next, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof v.o === 'number' && Number.isInteger(v.o) && v.o >= 0 && v.o < 1_000_000) return v.o;
  } catch {
    // fall through
  }
  throw new ConnectorError('invalid_input', 'That "next" value is not one this tool gave out. Leave it out to start from the first page.', {
    problems: [{ field: 'next', problem: 'Use the "next" value exactly as the previous page returned it.' }],
  });
}

export const writeNext = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');

/**
 * One page of a list. `rows` is what was fetched from `offset`, asking for one
 * more than the page size, so a full page knows whether more follow.
 */
export function page<T>(rows: T[], offset: number, size = PAGE_SIZE): { items: T[]; next: string | null } {
  return rows.length > size ? { items: rows.slice(0, size), next: writeNext(offset + size) } : { items: rows, next: null };
}
