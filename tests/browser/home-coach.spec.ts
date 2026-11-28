// In a real browser against Supabase's local version: Home's weekly check-in
// marks with the count in a row, and the note in a campaign's last week asking
// the user to ask their coach for the next one (stage 4H).
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { addDays, mondayOf, trainingDay } from '../../src/rules/days';

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
  const email = `home${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}


async function campaign(me: string, start: string, weeks: number) {
  return (await sql<{ id: string }>(`insert into public.campaigns (user_id, name, start_date, week_count, status) values ($1, 'Test Block', $2, $3, 'active') returning id`, [me, start, weeks]))[0].id;
}

test('Home marks the weeks the coach read, with the count in a row', async ({ page }) => {
  const me = await register(page, 'Home Hana');
  await expect(page.getByRole('region', { name: 'Weekly check-ins' })).toHaveCount(0);
  const tz = (await sql<{ time_zone: string }>(`select time_zone from public.profiles where id = $1`, [me]))[0].time_zone;
  const monday = mondayOf(trainingDay(new Date(), tz));
  // The last two full weeks are marked; the week before that is not.
  for (const back of [7, 14]) {
    await sql(`insert into public.weekly_checkins (user_id, week_start) values ($1, $2::date - $3::int)`, [me, monday, back]);
  }
  await page.reload();
  const panel = page.getByRole('region', { name: 'Weekly check-ins' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('2 check-ins in a row.')).toBeVisible();
  await expect(panel.locator('[aria-label$="checked in"]')).toHaveCount(2);
  await expect(panel.locator('[aria-label$="no check-in"]')).toHaveCount(2);
  // Breaking the run: remove the most recent full week.
  await sql(`delete from public.weekly_checkins where user_id = $1 and week_start = $2::date - 7`, [me, monday]);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Weekly check-ins' }).getByText('No check-ins in a row yet.')).toBeVisible();
});

test("a campaign's last week shows a note to ask the coach; earlier weeks do not", async ({ page }) => {
  const me = await register(page, 'Home Lars');
  const tz = (await sql<{ time_zone: string }>(`select time_zone from public.profiles where id = $1`, [me]))[0].time_zone;
  const monday = mondayOf(trainingDay(new Date(), tz));
  // Two weeks long, started last Monday: this is week 2 of 2.
  const c = await campaign(me, addDays(monday, -7), 2);
  await page.reload();
  await expect(page.getByText('Test Block · Week 2 of 2')).toBeVisible();
  const note = page.getByRole('note', { name: 'Last week of your campaign' });
  await expect(note).toContainText('Ask your coach for the next one.');
  await expect(note.getByRole('link', { name: /^Coach/ })).toHaveAttribute('href', '/app/coach');
  // A longer campaign: this is week 2 of 3, so no note.
  await sql(`update public.campaigns set week_count = 3 where id = $1`, [c]);
  await page.reload();
  await expect(page.getByText('Test Block · Week 2 of 3')).toBeVisible();
  await expect(page.getByRole('note', { name: 'Last week of your campaign' })).toHaveCount(0);
});
