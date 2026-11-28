// In a real browser against Supabase's local version: the workout screen's
// + and − buttons sit centred beside their value (phone and desktop), Home
// shows the Inbox above Weekly check-ins, the start screen offers Pick a
// workout and Ad-hoc workout with Start workout at the top, and the planner's
// four tabs stay on one line with the rest in the Menu.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { mondayOf, addDays, trainingDay } from '../../src/rules/days';

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

const box = async (page: Page, sel: ReturnType<Page['locator']>) => {
  const b = await sel.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
};
const centre = (b: { y: number; height: number }) => b.y + b.height / 2;

for (const [label, size] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]] as const) {
  test(`the + and − buttons are centred beside their value (${label})`, async ({ page }) => {
    await page.setViewportSize(size);
    await register(page, `Stepper ${label}`);
    await page.goto('/app/workout');
    await page.getByRole('button', { name: /^Ad-hoc workout/ }).click();
    await page.getByLabel('Search your library').fill('Barbell Curl');
    await page.getByRole('button', { name: /^Barbell Curl/ }).first().click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('button', { name: 'Start exercise' }).click();
    for (const [minus, field, plus] of [['Subtract 5 lb', 'Weight in lb', 'Add 5 lb'], ['Subtract 1 rep', 'Reps', 'Add 1 rep']] as const) {
      const v = centre(await box(page, page.getByLabel(field)));
      for (const name of [minus, plus]) {
        const b = await box(page, page.getByRole('button', { name }));
        expect(Math.abs(centre(b) - v), `${name} centre vs ${field}`).toBeLessThanOrEqual(2);
        // The label sits in the middle of its own button too, not at the top.
        const text = await page.getByRole('button', { name }).evaluate((el) => {
          const r = document.createRange(); r.selectNodeContents(el);
          const t = r.getBoundingClientRect(); const e = el.getBoundingClientRect();
          return Math.abs((t.top + t.height / 2) - (e.top + e.height / 2));
        });
        expect(text).toBeLessThanOrEqual(2);
      }
    }
  });
}

test('Home shows the Inbox above Weekly check-ins', async ({ page }) => {
  const me = await register(page, 'Home Hana');
  const week = addDays(mondayOf(trainingDay(new Date(), me.time_zone)), -7);
  await sql(`insert into public.weekly_checkins (user_id, week_start) values ($1, $2)`, [me.id, week]);
  await page.goto('/app');
  const inbox = await box(page, page.getByRole('region', { name: 'Inbox summary' }));
  const checks = await box(page, page.getByRole('region', { name: 'Weekly check-ins' }));
  expect(inbox.y).toBeLessThan(checks.y);
});

test('Start another workout offers Pick a workout and Ad-hoc workout; Start workout is at the top', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const me = await register(page, 'Chooser Cleo');
  const bench = (await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and name = 'Barbell Bench Press'`, [me.id]))[0].id;
  for (const n of ['Zulu Day', 'Alpha Day', 'Mike Day']) {
    const w = (await sql<{ id: string }>(`insert into public.workouts (user_id, name) values ($1, $2) returning id`, [me.id, n]))[0].id;
    await sql(`insert into public.workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8)`, [me.id, w, bench]);
    if (n === 'Zulu Day') {
      await sql(`insert into public.sessions (user_id, local_date, source_kind, workout_id, workout_name, started_at, ended_at, status, finish_reason) values ($1, current_date, 'ad_hoc', $2, $3, now() - interval '2 hours', now() - interval '1 hour', 'finished', 'user')`, [me.id, w, n]);
    }
  }
  await page.goto('/app');
  await page.getByRole('link', { name: 'Start another workout' }).click();
  await expect(page.getByRole('button', { name: /^Pick a workout/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ad-hoc workout/ })).toBeVisible();

  await page.getByRole('button', { name: /^Pick a workout/ }).click();
  const names = await page.locator('.pick-list .btn.opt').allTextContents();
  expect(names.map((t) => t.replace(/\d+ exercises?$/, ''))).toEqual(['Zulu Day', 'Alpha Day', 'Mike Day']);
  await expect(page.getByRole('region', { name: 'Recently used' })).toBeVisible();
  await page.getByLabel('Search your workouts').fill('mik');
  await expect(page.locator('.pick-list .btn.opt')).toHaveCount(1);
  await page.getByRole('button', { name: /^Mike Day/ }).click();
  await expect(page.getByRole('heading', { name: 'Barbell Bench Press' })).toBeVisible({ timeout: 15000 });
});

test('the ad-hoc screen has Start workout above the exercise list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page, 'Adhoc Abe');
  await page.goto('/app/workout');
  await page.getByRole('button', { name: /^Ad-hoc workout/ }).click();
  const start = page.getByRole('button', { name: 'Start workout' });
  await page.getByLabel('Search your library').fill('Barbell Curl');
  await page.getByRole('button', { name: /^Barbell Curl/ }).first().click();
  const picked = await box(page, page.getByText('1. Barbell Curl'));
  const search = await box(page, page.getByLabel('Search your library'));
  const s = await box(page, start);
  expect(s.y).toBeLessThan(picked.y);
  expect(s.y).toBeLessThan(search.y);
});

for (const [label, size] of [['laptop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]] as const) {
  test(`the planner keeps four tabs on one line and the rest in the Menu (${label})`, async ({ page }) => {
    await page.setViewportSize(size);
    await register(page, `Menu ${label}`);
    await page.goto('/planner/plan');
    const tabs = page.getByRole('navigation', { name: 'Planner' }).getByRole('link');
    await expect(tabs).toHaveText([/^Plan$/, /^Library$/, /^History$/, /^Proposals/]);
    const ys = await Promise.all([0, 1, 2, 3].map(async (i) => (await box(page, tabs.nth(i))).y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const n of ['Vocabulary', 'Coach setup', 'Profile and gyms', 'Account', 'Phone home']) await expect(page.getByRole('group', { name: 'Planner menu' }).getByRole('link', { name: n, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Planner menu' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pounds' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await page.getByRole('group', { name: 'Planner menu' }).getByRole('link', { name: 'Vocabulary', exact: true }).click();
    await page.waitForURL('**/planner/vocabulary');
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });
}
