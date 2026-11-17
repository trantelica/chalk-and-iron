import { NextResponse } from 'next/server';
import { LinkError } from './accounts';

export function fail(e: unknown) {
  if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong on our side. Try again in a minute.' }, { status: 500 });
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
