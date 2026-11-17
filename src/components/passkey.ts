'use client';
import { browserClient } from '@/lib/supabase/browser';

// Passkeys (Face ID or Touch ID) through Supabase's own passkey support.

/** Trades a one-time token from the server for a session, then creates a passkey. */
export async function signInWithTokenAndCreatePasskey(tokenHash: string): Promise<string | null> {
  const sb = browserClient();
  const v = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (v.error) return 'Could not sign you in: ' + v.error.message;
  const p = await sb.auth.registerPasskey();
  if (p.error) return 'You are signed in, but the passkey was not created: ' + p.error.message + '. You can try again from the app.';
  return null;
}

export async function signInWithPasskey(): Promise<string | null> {
  const r = await browserClient().auth.signInWithPasskey();
  return r.error ? r.error.message : null;
}

export function readCodeFromLink(): string {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return hash.get('code') ?? '';
}
