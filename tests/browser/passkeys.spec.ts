// The passkey steps in a real browser, with the browser's stand-in passkey
// (design Section 10E, point 10): register from an invite, sign in, and a
// reset that refuses the old passkey and makes a new one.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}

/** An invite made straight in the test database, as an admin's would be. */
async function invite(label: string) {
  const code = randomBytes(24).toString('hex');
  await sql(`insert into public.invites (code_hash, purpose, label) values (app.hash_code($1), 'invite', $2)`, [code, label]);
  return code;
}

/** Gives the page a stand-in passkey device that says yes to every Face ID check. */
async function standInPasskey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return {
    count: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length,
    forgetAll: () => cdp.send('WebAuthn.clearCredentials', { authenticatorId }),
  };
}

async function signOut(page: Page) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/signin');
}

test('register with a passkey, sign in with it, and a reset refuses the old one and makes a new one', async ({ page }) => {
  const passkeys = await standInPasskey(page);
  const email = `browser${Date.now()}@example.test`;

  // Register from an invite: the app makes a passkey, and sends no email.
  await page.goto(`/register#code=${await invite('Robin')}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  await expect(page.getByText('Hi, Robin')).toBeVisible();
  expect(await passkeys.count()).toBe(1);
  await expect(page.getByText('You have no passkey yet')).toHaveCount(0);

  // Sign out, and back in with the passkey alone.
  await signOut(page);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
  await expect(page.getByText('Hi, Robin')).toBeVisible();

  // Robin is made an admin and resets their own sign-in through the app's server,
  // as an admin's Reset button does.
  const [{ id }] = await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]);
  await sql(`update public.profiles set is_admin = true where id = $1`, [id]);
  const reset = await page.evaluate(async (userId) => {
    const r = await fetch('/api/admin/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) });
    return { status: r.status, body: await r.json() };
  }, id);
  expect(reset.status, JSON.stringify(reset.body)).toBe(200);

  // At once, this browser is signed out, and the old passkey no longer signs in.
  await page.goto('/app');
  await expect(page.getByText('Hi, Robin')).toHaveCount(0);
  await page.goto('/signin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.error')).toBeVisible();
  expect(page.url()).toContain('/signin');

  // The reset link makes a new passkey on a device that has only that one.
  await passkeys.forgetAll();
  await page.waitForTimeout(1100);
  await page.goto(`/reset#code=${reset.body.code}`);
  await page.getByRole('button', { name: 'Create new passkey' }).click();
  await page.waitForURL('**/app');
  await expect(page.getByText('Hi, Robin')).toBeVisible();
  await expect(page.getByText('Action required: reconnect your coach.')).toBeVisible();
  expect(await passkeys.count()).toBe(1);

  // And the new passkey signs in.
  await signOut(page);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
  await expect(page.getByText('Hi, Robin')).toBeVisible();

  // The reset link works once.
  await signOut(page);
  await page.goto(`/reset#code=${reset.body.code}`);
  await page.getByRole('button', { name: 'Create new passkey' }).click();
  await expect(page.locator('.error')).toContainText('not valid');
});
