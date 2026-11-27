// In a real browser against Supabase's local version: the coach's cards in the
// inbox (stage 4F). The Coach button counts the cards waiting, Accept applies a
// card and a banner says what changed and what did not, Decline takes an
// optional one-line reason (up to 300 characters) that is stored for the coach,
// and out-of-date and expired cards are shown without Accept. The planner's
// Proposals screen shows the same inbox with a long card in full.
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
  const email = `inbox${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}

/** A coach's card as the propose tools store one (added here with full access, as the test's setup). */
async function card(me: string, kind: string, applies: string, lines: string[], payload: unknown, over: { status?: string; expires?: string; target?: string } = {}) {
  const r = await sql<{ id: string }>(
    `insert into public.proposals (user_id, source, kind, applies_to, summary_lines, payload, status, expires_at, decided_at)
     values ($1, 'ChatGPT', $2, $3, $4, $5, $6, $7, case when $6 = 'pending' then null else now() end) returning id`,
    [me, kind, applies, lines, JSON.stringify(payload), over.status ?? 'pending', over.expires ?? null]);
  if (over.target) {
    const v = (await sql<{ version: number }>(`select version from public.exercises where id = $1`, [over.target]))[0].version;
    await sql(`insert into public.proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, 'exercises', $3, $4)`, [me, r[0].id, over.target, v]);
  }
  return r[0].id;
}

test('the Coach button counts waiting cards; Accept shows a banner; Decline keeps its reason; old cards are shown', async ({ page }) => {
  const me = await register(page, 'Inbox Ines');
  const ex = async (name: string) => (await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and name = $2`, [me, name]))[0].id;
  const bench = await ex('Barbell Bench Press');
  const squat = await ex('Barbell Back Squat');
  const row = await ex('Barbell Bent-Over Row');

  const accept = await card(me, 'exercise', 'library', ['Barbell Bench Press: rest 75 seconds'], { exercise_id: bench, rest_seconds: 75 }, { target: bench });
  const decline = await card(me, 'exercise', 'library', ['Barbell Back Squat: rest 45 seconds'], { exercise_id: squat, rest_seconds: 45 }, { target: squat });
  await card(me, 'exercise', 'library', ['Barbell Bent-Over Row: rest 30 seconds'], { exercise_id: row, rest_seconds: 30 }, { status: 'out_of_date' });
  await card(me, 'today_change', 'today', ['Expired card: swap the bench today'], { local_date: '2020-01-01', changes: [] }, { expires: new Date(Date.now() - 3600_000).toISOString() });
  const long = Array.from({ length: 14 }, (_, i) => `Week ${Math.floor(i / 7) + 1}, day ${(i % 7) + 1}: a workout`);
  await card(me, 'campaign', 'campaign', ['New campaign "Twelve Weeks": 14 days', ...long], { name: 'Twelve Weeks' }, { status: 'out_of_date' });

  // The phone: Home and the Coach screen.
  await page.goto('/app/coach');
  await expect(page.getByRole('heading', { name: 'Coach' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Coach proposal, Waiting' })).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Coach proposal, Out of date' })).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Coach proposal, Expired' })).toHaveCount(1);
  // Out of date and expired cards cannot be accepted.
  const stale = page.getByRole('group', { name: 'Coach proposal, Expired' });
  await expect(stale.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Coach proposal, Out of date' }).first().getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByText('Proposals · 2 waiting')).toBeVisible();
  // A long card keeps its extra lines behind one button.
  await page.getByRole('button', { name: /Show all 15 lines/ }).click();
  await expect(page.getByText('Week 2, day 7: a workout')).toBeVisible();

  // Home counts them too, and the workout screen's Coach button carries the count.
  await page.goto('/app');
  await expect(page.getByText('2 waiting for your decision')).toBeVisible();

  // Accept: applies the card, banner says what changed and what did not, count drops.
  await page.goto('/app/coach');
  const first = page.getByRole('group', { name: 'Coach proposal, Waiting' }).filter({ hasText: 'Barbell Bench Press' });
  await first.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Accepted\. Barbell Bench Press is updated in your library\. Workouts already done are unchanged\./ })).toBeVisible();
  await expect(page.getByText('Proposals · 1 waiting')).toBeVisible();
  expect((await sql<{ rest_seconds: number }>(`select rest_seconds from public.exercises where id = $1`, [bench]))[0].rest_seconds).toBe(75);

  // Decline with a reason over 300 characters is refused; a short one is kept.
  const second = page.getByRole('group', { name: 'Coach proposal, Waiting' });
  await second.getByRole('button', { name: 'Decline' }).click();
  await second.getByLabel('Reason for declining (optional)').fill('x'.repeat(301));
  await expect(second.getByRole('button', { name: 'Decline card' })).toBeDisabled();
  await second.getByLabel('Reason for declining (optional)').fill('too much volume');
  await second.getByRole('button', { name: 'Decline card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Declined. Nothing was changed. Your coach can read your reason.' })).toBeVisible();
  await expect(page.getByText('Proposals · 0 waiting')).toBeVisible();
  await expect(page.getByText('Declined. Your reason: too much volume')).toBeVisible();
  const done = (await sql<{ status: string; decline_reason: string }>(`select status, decline_reason from public.proposals where id = $1`, [decline]))[0];
  expect(done).toEqual({ status: 'rejected', decline_reason: 'too much volume' });
  expect((await sql<{ status: string }>(`select status from public.proposals where id = $1`, [accept]))[0].status).toBe('accepted');
  expect((await sql<{ rest_seconds: number }>(`select rest_seconds from public.exercises where id = $1`, [squat]))[0].rest_seconds).not.toBe(45);

  // Decline with no reason works too: dismiss an out of date card.
  const old = page.getByRole('group', { name: 'Coach proposal, Out of date' }).filter({ hasText: 'Bent-Over Row' });
  await old.getByRole('button', { name: 'Dismiss' }).click();
  await old.getByRole('button', { name: 'Dismiss card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Declined. Nothing was changed.' })).toBeVisible();
});

test("the planner's Proposals screen shows the same inbox, and its tab counts waiting cards", async ({ page }) => {
  const me = await register(page, 'Inbox Pia');
  const bench = (await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and name = 'Barbell Bench Press'`, [me]))[0].id;
  await card(me, 'exercise', 'library', ['Barbell Bench Press: rest 60 seconds'], { exercise_id: bench, rest_seconds: 60 }, { target: bench });
  await page.goto('/planner/proposals');
  await expect(page.getByRole('link', { name: /^Proposals/ })).toContainText('1');
  await page.getByRole('group', { name: 'Coach proposal, Waiting' }).getByRole('button', { name: 'Decline' }).click();
  await page.getByRole('button', { name: 'Decline card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Declined. Nothing was changed.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Proposals/ })).not.toContainText('1');
});
