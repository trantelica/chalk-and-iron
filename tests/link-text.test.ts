import { describe, expect, it } from 'vitest';
import { inviteLink, inviteText, resetLink, resetText } from '@/lib/link-text';

describe('ready-to-paste invite and reset text', () => {
  const when = new Date('2026-11-24T12:00:00Z');
  it('puts the secret after # so it never reaches the server', () => {
    expect(inviteLink('https://chalk.example/', 'abc')).toBe('https://chalk.example/register#code=abc');
    expect(resetLink('https://chalk.example', 'abc')).toBe('https://chalk.example/reset#code=abc');
  });
  it('an invite covers registering, the home screen, notifications and the coach', () => {
    const t = inviteText('Sam', 'https://x/register#code=1', when);
    for (const part of ['Hi Sam', 'https://x/register#code=1', 'passkey', 'Add to Home Screen', 'notifications', 'coach', 'November 24']) expect(t).toContain(part);
  });
  it('a reset says the old sign-in is already off, and history is kept', () => {
    const t = resetText('Sam', 'https://x/reset#code=1', when);
    expect(t).toContain('already been switched off');
    expect(t).toContain('signed out everywhere');
    expect(t).toContain('history is not touched');
  });
});
