// In a real browser against Supabase's local version: Ask my coach on the Coach
// screen (27 Nov). Each ready message copies itself and opens the saved coach
// link; with no link saved it says where to save one; if the phone refuses to
// copy, the message is shown in a box that can be selected.
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
  const email = `ask${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}

test('Ask my coach: no link says where to save it; with a link it copies and opens the coach', async ({ page, context }) => {
  const me = await register(page, 'Ask Anya');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('https://chatgpt.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>coach</title>' }));
  await page.goto('/app/coach');
  const panel = page.getByRole('region', { name: 'Ask my coach' });
  for (const label of ['Weekly check-in', "Something's taken at the gym, change today's workout", 'Plan my next campaign', 'How did my last workout go?']) {
    await expect(panel.getByRole('button', { name: label })).toBeVisible();
  }
  // The coach is said to be in ChatGPT or Claude, not in the app.
  await expect(page.getByText('Your coach is not inside Chalk and Iron')).toBeVisible();
  // Large tap targets.
  const h = (await panel.getByRole('button', { name: 'Weekly check-in' }).boundingBox())!.height;
  expect(h).toBeGreaterThanOrEqual(44);

  // No link saved: the message is still copied, and the page points to Coach setup.
  await panel.getByRole('button', { name: 'Plan my next campaign' }).click();
  await expect(panel).toContainText('No coach link is saved yet');
  await expect(panel.getByRole('link', { name: 'Open Coach setup' })).toHaveAttribute('href', '/planner/coach-setup');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('plan my next campaign');

  // A link saved: copies and opens it in a new tab.
  await sql(`update public.profiles set coach_link = 'https://chatgpt.com/g/test/project' where id = $1`, [me]);
  await page.reload();
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('region', { name: 'Ask my coach' }).getByRole('link', { name: 'Weekly check-in' }).click(),
  ]);
  expect(opened.url()).toBe('https://chatgpt.com/g/test/project');
  await expect(page.getByRole('region', { name: 'Ask my coach' })).toContainText('Copied. Paste it into your coach chat and send.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Weekly check-in');
});

test('Ask my coach: if copying is refused, the message appears in a box to select', async ({ page }) => {
  await register(page, 'Ask Boris');
  await page.goto('/app/coach');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await page.getByRole('region', { name: 'Ask my coach' }).getByRole('button', { name: 'How did my last workout go?' }).click();
  const box = page.getByRole('textbox', { name: 'Message for your coach' });
  await expect(box).toBeVisible();
  await expect(box).toHaveValue('How did my last workout go?');
});
