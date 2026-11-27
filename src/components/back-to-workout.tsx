'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { keyFor, readStore } from '@/lib/phone-store';
import type { Session } from '@/rules/session';

/**
 * The big "Back to my workout" button at the top of the Coach screen. It shows
 * only while this phone holds a running workout (the same copy the workout
 * screen resumes from, so it works with no connection) and only links back to
 * the workout screen: it starts nothing and changes nothing.
 */
export function BackToWorkout({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const s = readStore<Session | null>(keyFor(userId, 'session'), null);
    setName(s && s.endedAt === null ? s.name : null);
  }, [userId]);
  if (name === null) return null;
  return (
    <Link className="btn primary link-btn" href="/app/workout">
      Back to my workout{name ? `: ${name}` : ''}
    </Link>
  );
}
