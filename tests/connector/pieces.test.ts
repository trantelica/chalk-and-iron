// Stage 4B: the connector's small rules, each on its own.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cleanName } from '@/server/connector/calls';
import { invalidInput } from '@/server/connector/errors';
import { page, readNext, waitSeconds, writeNext } from '@/server/connector/limits';
import { requestHash } from '@/server/connector/repeat';
import { protectedResourceMetadata } from '@/server/connector/config';

describe('too many requests', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it('lets a call through under both limits', () => {
    expect(waitSeconds([], now)).toBeNull();
    expect(waitSeconds(Array.from({ length: 59 }, (_, i) => ago(i)), now)).toBeNull();
  });

  it('at 60 calls in a minute, waits until the oldest of them is a minute old', () => {
    const times = Array.from({ length: 60 }, (_, i) => ago(i)); // oldest is 59 s ago
    expect(waitSeconds(times, now)).toBe(1);
  });

  it('at 600 calls in an hour, waits for the hour window', () => {
    const times = Array.from({ length: 600 }, (_, i) => ago(120 + i * 5)); // none in the last minute
    expect(waitSeconds(times, now)).toBe(3600 - (120 + 599 * 5));
  });
});

describe('the "next" marker', () => {
  it('round-trips and pages', () => {
    expect(readNext(undefined)).toBe(0);
    expect(readNext(writeNext(50))).toBe(50);
    const rows = Array.from({ length: 51 }, (_, i) => i);
    expect(page(rows, 0)).toEqual({ items: rows.slice(0, 50), next: writeNext(50) });
    expect(page(rows.slice(0, 7), 50)).toEqual({ items: rows.slice(0, 7), next: null });
  });

  it('refuses a marker it never gave out', () => {
    expect(() => readNext('abc')).toThrow(/not one this tool gave out/);
    expect(() => readNext(Buffer.from(JSON.stringify({ o: -1 })).toString('base64url'))).toThrow();
  });
});

describe('the one-minute repeat guard', () => {
  it('a word-for-word repeat has the same fingerprint, whatever the order of its fields', () => {
    const a = requestHash('propose_workout', { name: 'Push A', items: [{ exercise: 'Bench', sets: 3 }] });
    const b = requestHash('propose_workout', { items: [{ sets: 3, exercise: 'Bench' }], name: 'Push A' });
    expect(a).toBe(b);
  });

  it('any change, or another tool, makes a different fingerprint', () => {
    const a = requestHash('propose_workout', { name: 'Push A' });
    expect(requestHash('propose_workout', { name: 'Push B' })).not.toBe(a);
    expect(requestHash('propose_exercise', { name: 'Push A' })).not.toBe(a);
    expect(requestHash('propose_workout', { items: [1, 2] })).not.toBe(requestHash('propose_workout', { items: [2, 1] }));
  });
});

describe('a coach app\'s name', () => {
  it('is kept short and plain, and never poses as the planner', () => {
    expect(cleanName('  ChatGPT  ')).toBe('ChatGPT');
    expect(cleanName('Claude\n\tweb')).toBe('Claude web');
    expect(cleanName('x'.repeat(200))).toHaveLength(80);
    expect(cleanName('')).toBe('Coach app');
    expect(cleanName(undefined)).toBe('Coach app');
    expect(cleanName('Planner')).toBe('Coach app');
  });
});

describe('invalid input', () => {
  it('names each problem with its field', () => {
    const schema = z.object({ limit: z.number().int().max(100) }).strict();
    const r = schema.safeParse({ limit: 500, extra: true });
    expect(r.success).toBe(false);
    const e = invalidInput('list_sessions', r.error!);
    expect(e.code).toBe('invalid_input');
    expect(e.extra.problems?.map((p) => p.field).sort()).toEqual(['extra', 'limit']);
  });
});

describe('protected resource metadata', () => {
  it('names the connector link and the sign-in service exactly', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcd.supabase.co/';
    process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://chalkandiron.vercel.app';
    const m = protectedResourceMetadata(new Request('https://preview.example/api/connector/metadata'));
    expect(m.resource).toBe('https://chalkandiron.vercel.app/mcp');
    expect(m.authorization_servers).toEqual(['https://abcd.supabase.co/auth/v1']);
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
  });
});
