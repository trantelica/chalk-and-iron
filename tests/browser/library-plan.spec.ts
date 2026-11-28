// In a real browser against Supabase's local version: the Library's Campaigns
// tab is design only (no run controls), and Plan runs a campaign: Start a
// campaign, Shift forward a week, Undo last shift, End campaign, and a second
// run that starts with none of the last run's overrides (Nate, 27 Nov).
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { mondayOf, trainingDay } from '../../src/rules/days';

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
  const email = `fixes${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string; time_zone: string }>(`select id, time_zone from public.profiles where email = $1`, [email]))[0];
}


/** A workout with one row, and a campaign on it with one day (Monday of week 1). */
async function seed(me: { id: string; time_zone: string }, status: 'draft' | 'active' | 'finished', withOverride: boolean) {
  const today = trainingDay(new Date(), me.time_zone);
  const bench = (await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and name = 'Barbell Bench Press'`, [me.id]))[0].id;
  const w = (await sql<{ id: string }>(`insert into public.workouts (user_id, name) values ($1, 'Push Day') returning id`, [me.id]))[0].id;
  const item = (await sql<{ id: string }>(`insert into public.workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8) returning id`, [me.id, w, bench]))[0].id;
  const c = (await sql<{ id: string }>(`insert into public.campaigns (user_id, name, start_date, week_count, status) values ($1, 'Test Block', $2, 2, $3) returning id`, [me.id, mondayOf(today), status]))[0].id;
  const day = (await sql<{ id: string }>(`insert into public.campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 1, $3) returning id`, [me.id, c, w]))[0].id;
  if (withOverride) await sql(`insert into public.campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets, reps) values ($1, $2, $3, $4, 5, 12)`, [me.id, day, w, item]);
  return c;
}
const status = async (c: string) => (await sql<{ status: string }>(`select status from public.campaigns where id = $1`, [c]))[0].status;
const overrideCount = async (c: string) => Number((await sql<{ n: string }>(`select count(*) n from public.campaign_day_overrides o join public.campaign_days d on d.id = o.campaign_day_id where d.campaign_id = $1`, [c]))[0].n);

test('the Library has no run controls, and says a running campaign is running', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const me = await register(page, 'Library Lena');
  await seed(me, 'active', true);
  await page.goto('/planner/library/campaigns');
  await expect(page.getByLabel('Week 1 Mon')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Campaign status' })).toContainText('Running since');
  await expect(page.getByText('This campaign is running; changes to its days apply from today on')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Plan' })).toBeVisible();
  for (const name of ['Activate', 'Shift forward a week', 'Undo last shift', 'End campaign', 'Mark it finished', 'Run again', 'Start']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel('Start date')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New campaign' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy this one' })).toBeVisible();
});

test('Start a campaign from Plan', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const me = await register(page, 'Start Stan');
  const c = await seed(me, 'draft', false);
  await page.goto('/planner/plan');
  await expect(page.getByRole('heading', { name: 'Start a campaign' })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Running: Test Block' })).toBeVisible();
  expect(await status(c)).toBe('active');
});

test('Shift forward, Undo last shift and End campaign from Plan', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const me = await register(page, 'Shift Shay');
  const c = await seed(me, 'active', false);
  await page.goto('/planner/plan');
  await expect(page.getByRole('heading', { name: 'Running: Test Block' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last shift' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Shift forward a week' }).click();
  await expect(page.getByRole('button', { name: 'Undo last shift' })).toBeVisible();
  expect(Number((await sql<{ n: string }>(`select count(*) n from public.campaign_shifts where campaign_id = $1`, [c]))[0].n)).toBe(1);
  await page.getByRole('button', { name: 'Undo last shift' }).click();
  await expect(page.getByRole('button', { name: 'Undo last shift' })).toHaveCount(0);
  await page.getByRole('button', { name: 'End campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Start a campaign' })).toBeVisible();
  expect(await status(c)).toBe('finished');
});

test('a second run starts with none of the last run\'s overrides', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const me = await register(page, 'Again Ana');
  const c = await seed(me, 'active', true);
  await page.goto('/planner/plan');
  await page.getByRole('button', { name: 'End campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Start a campaign' })).toBeVisible();
  expect(await overrideCount(c)).toBe(1); // ending keeps the last run's overrides until a new run starts
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Running: Test Block' })).toBeVisible();
  expect(await status(c)).toBe('active');
  expect(await overrideCount(c)).toBe(0);
});
