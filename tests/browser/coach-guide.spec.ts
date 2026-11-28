// In a real browser against Supabase's local version: the guide "What you can
// ask your coach" on the phone's Coach screen (27 Nov). Example things to say,
// grouped by moment, each group ending with what happens next, and the Open my
// coach link. Nothing is copied. On Coach setup the guide is at the end.
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
  const email = `guide${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}

test('the Coach screen guide lists examples by moment; Open my coach follows the saved link', async ({ page, context }) => {
  const me = await register(page, 'Guide Greta');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/app/coach');
  await expect(page.getByText('Your coach is not inside Chalk and Iron')).toBeVisible();
  const guide = page.getByRole('region', { name: 'What you can ask your coach' });
  for (const t of ['In the gym', 'Planning', 'Checking in', 'After a decline', 'About you and your gyms']) {
    await expect(guide.locator('summary', { hasText: t })).toBeVisible();
  }
  // No copying any more.
  await expect(page.getByRole('region', { name: 'Ask my coach' })).toHaveCount(0);
  await expect(guide.getByRole('button')).toHaveCount(0);

  // Open a group: examples and one line on what happens next.
  await guide.locator('summary', { hasText: 'In the gym' }).click();
  await expect(guide.getByText('“The bench is taken.”')).toBeVisible();
  await expect(guide.getByText('nothing changes until you do', { exact: false }).first()).toBeVisible();
  await guide.locator('summary', { hasText: 'After a decline' }).click();
  await expect(guide.getByText('“Try again with the push workout I declined yesterday.”')).toBeVisible();
  const box = await guide.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);

  // No link saved: says where to add it.
  await expect(guide).toContainText('No coach link is saved yet. Add it in Coach setup, step 5.');
  await expect(guide.getByRole('link', { name: 'Open Coach setup' })).toHaveAttribute('href', '/planner/coach-setup');

  // A link saved: Open my coach opens it in a new tab.
  await context.route('https://chatgpt.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>coach</title>' }));
  await sql(`update public.profiles set coach_link = 'https://chatgpt.com/g/test/project' where id = $1`, [me]);
  await page.reload();
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('region', { name: 'What you can ask your coach' }).getByRole('link', { name: 'Open my coach' }).click(),
  ]);
  expect(opened.url()).toBe('https://chatgpt.com/g/test/project');
});
