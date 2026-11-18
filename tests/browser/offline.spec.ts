// Spec Section 8, Resilience, in a real browser against Supabase's local
// version: a set logged with no connection appears exactly once after
// reconnecting, and closing the app mid-session and reopening returns to the
// same exercise with its sets and clocks.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}

async function register(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const code = randomBytes(24).toString('hex');
  await sql(`insert into public.invites (code_hash, purpose, label) values (app.hash_code($1), 'invite', $2)`, [code, name]);
  const email = `offline${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return email;
}

const liveSets = async (email: string) => (await sql<{ n: number }>(
  `select count(*)::int as n from public.set_logs l join public.profiles p on p.id = l.user_id where p.email = $1 and l.deleted_at is null`, [email]))[0].n;

test('sets logged offline reach the account exactly once, and the workout survives closing the app', async ({ page, context }) => {
  const email = await register(page, 'Offline Olly');

  // Start a quick workout with one exercise.
  await page.goto('/app/workout');
  await page.getByLabel('Search your library').fill('Barbell Curl');
  await page.getByRole('button', { name: /^Barbell Curl/ }).first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Barbell Curl' })).toBeVisible();
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await expect(page.getByText('Saved to your account')).toBeVisible({ timeout: 15000 });

  // The connection drops. Two sets are logged.
  await context.setOffline(true);
  for (const w of ['50', '55']) {
    await page.getByLabel('Weight in lb').fill(w);
    await page.getByRole('button', { name: 'Log set' }).click();
  }
  await expect(page.getByText(/saved on this phone/)).toBeVisible({ timeout: 15000 });
  expect(await liveSets(email)).toBe(0);

  // The connection returns: both sets arrive, once each.
  await context.setOffline(false);
  await expect(page.getByText('Saved to your account')).toBeVisible({ timeout: 30000 });
  expect(await liveSets(email)).toBe(2);

  // The app is closed mid-session and opened again five minutes later.
  await page.close();
  const again = await context.newPage();
  await again.clock.install({ time: new Date(Date.now() + 5 * 60 * 1000) });
  await again.goto('/app/workout');
  await expect(again.getByRole('heading', { name: 'Barbell Curl' })).toBeVisible();
  await expect(again.getByText('1 · Done')).toBeVisible();
  await expect(again.getByText('2 · Done')).toBeVisible();
  await expect(again.getByText('3 · Now')).toBeVisible();
  // The workout clock kept counting while the app was closed.
  const clock = await again.locator('.phone-head .clock-text').textContent();
  expect(Number(clock!.split(':')[0])).toBeGreaterThanOrEqual(5);
  // Opening again sent nothing twice.
  await expect(again.getByText('Saved to your account')).toBeVisible({ timeout: 30000 });
  expect(await liveSets(email)).toBe(2);
});
