// In a real browser against Supabase's local version: the Home screen's Today
// panel starts today's campaign workout, and a swap part-way through an
// exercise to an alternate not yet in the library adds it, keeps the logged
// set with the original, and offers the one-tap confirm.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { mondayOf, trainingDay, weekday } from '../../src/rules/days';

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
  const email = `today${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}

test("the Today panel starts today's workout, and a part-way swap adds a new alternate", async ({ page }) => {
  const me = await register(page, 'Today Tess');
  await expect(page.getByText('No workout planned for today.')).toBeVisible();

  // A campaign with today's day holding "Test Push" (bench press, 3 × 8).
  const today = trainingDay(new Date(), 'America/Denver');
  const bench = (await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and name = 'Barbell Bench Press'`, [me]))[0].id;
  const w = (await sql<{ id: string }>(`insert into public.workouts (user_id, name) values ($1, 'Test Push') returning id`, [me]))[0].id;
  await sql(`insert into public.workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8)`, [me, w, bench]);
  const c = (await sql<{ id: string }>(`insert into public.campaigns (user_id, name, start_date, week_count, status) values ($1, 'Test Block', $2, 2, 'active') returning id`, [me, mondayOf(today)]))[0].id;
  const day = (await sql<{ id: string }>(`insert into public.campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, $3, $4) returning id`, [me, c, weekday(today), w]))[0].id;
  // Make the full-gym alternate "not yet in the library".
  await sql(`update public.exercises set archived_at = now() where user_id = $1 and name = 'Selectorized Machine Chest Press'`, [me]);

  await page.reload();
  await expect(page.getByText('Test Block · Week 1 of 2')).toBeVisible();
  await expect(page.locator('.wk-day.today')).toContainText('Test Push');
  await page.getByRole('link', { name: 'Start Test Push' }).click();

  // The workout starts by itself from the Home screen's button.
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await page.getByLabel('Weight in lb').fill('135');
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(page.getByText('1 · Done')).toBeVisible();

  // The bench is taken: swap part-way to an alternate not in the library.
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await expect(page.getByText(/The 1 set you logged stays with Barbell Bench Press\. The 2 sets left are done/)).toBeVisible();
  await page.getByRole('button', { name: /Selectorized Machine Chest Press/ }).click();
  await expect(page.getByText('Added to your library')).toBeVisible();
  await page.getByLabel('Equipment').selectOption({ label: 'selectorized machine' });
  await page.getByRole('button', { name: 'Confirm details' }).click();
  await expect(page.getByRole('heading', { name: 'Selectorized Machine Chest Press' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start exercise' })).toBeVisible();
  await expect(page.getByText('Saved to your account')).toBeVisible({ timeout: 30000 });

  // In the account: the new exercise, made by the swap and confirmed; the
  // logged set stays with the bench; the session is today's campaign day.
  const made = await sql<{ id: string; created_via: string; equipment: string | null }>(
    `select e.id, e.created_via, v.name as equipment from public.exercises e left join public.vocabulary_terms v on v.id = e.equipment_id
     where e.user_id = $1 and e.name = 'Selectorized Machine Chest Press' and e.archived_at is null`, [me]);
  expect(made).toHaveLength(1);
  expect(made[0]).toMatchObject({ created_via: 'swap', equipment: 'selectorized machine' });
  const rows = await sql<{ exercise_id: string; sets: string[]; n: number }>(
    `select se.exercise_id, se.planned_set_types as sets, (select count(*)::int from public.set_logs l where l.session_exercise_id = se.id and l.deleted_at is null) as n
     from public.session_exercises se join public.sessions s on s.id = se.session_id where s.user_id = $1 and s.campaign_day_id = $2`, [me, day]);
  expect(rows.find((r) => r.exercise_id === bench)).toMatchObject({ n: 1 });
  expect(rows.find((r) => r.exercise_id === made[0].id)).toMatchObject({ n: 0 });
  expect(rows.find((r) => r.exercise_id === made[0].id)!.sets).toHaveLength(2);

  // Home now offers to resume it.
  await page.goto('/app');
  await expect(page.getByRole('link', { name: 'Resume Test Push' })).toBeVisible();
});
