// In a real browser against Supabase's own local version: Coach setup and
// Profile and gyms (stage 4G). The intake saves each answer and the database
// holds it; the coach link is kept only as a web address and the phone's Coach
// button opens it; the connection test turns to Connected when a coach's call
// arrives; the connector link and the instructions to copy are on the page; and
// a large gym's equipment can be added in bulk, filtered, removed with Undo and
// edited as text.
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
  const email = `setup${Date.now()}@example.test`;
  await page.goto(`/register#code=${code}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.waitForURL('**/app');
  return (await sql<{ id: string }>(`select id from public.profiles where email = $1`, [email]))[0].id;
}

type Row = Record<string, unknown>;
const coachRow = async (me: string) => (await sql<Row>(`select * from public.coach_profiles where user_id = $1`, [me]))[0];

test('Coach setup: the intake saves, the link is kept, the test turns Connected, and the steps are there', async ({ page }) => {
  const me = await register(page, 'Setup Sam');
  await page.goto('/planner/coach-setup');
  const tabs = page.getByRole('navigation', { name: 'Planner' });
  await expect(tabs.getByRole('link', { name: 'Coach setup' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Profile and gyms' })).toBeVisible();

  // Step 1: the intake. Each answer is saved as it is given.
  await expect(page.getByText(/0 of 12 answered/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Coach style' }).selectOption('challenging');
  await page.getByRole('combobox', { name: 'Experience' }).selectOption('returning');
  await page.getByRole('combobox', { name: 'Priority 1st' }).selectOption('strength');
  await page.getByRole('combobox', { name: 'Priority 2nd' }).selectOption('other');
  await page.getByRole('textbox', { name: 'Your own priority 2nd' }).fill('Rock climbing');
  await page.getByRole('textbox', { name: 'Your own priority 2nd' }).press('Enter');
  await page.getByRole('combobox', { name: 'Progression pace' }).selectOption('steady');
  await page.getByRole('spinbutton', { name: 'Workout length in minutes' }).fill('45');
  await page.getByRole('spinbutton', { name: 'Workout length in minutes' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Days per week' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Days per week' }).press('Enter');
  await page.getByRole('combobox', { name: 'Variety' }).selectOption('some');
  await page.getByRole('textbox', { name: 'Goals', exact: true }).fill('Bench 225 by March');
  await page.getByRole('textbox', { name: 'Goals', exact: true }).blur();
  await expect(page.getByText(/8 of 12 answered/)).toBeVisible({ timeout: 15000 });
  const saved = await coachRow(me);
  expect(saved).toMatchObject({
    coach_style: 'challenging', experience: 'returning', progression_pace: 'steady', workout_minutes: 45, days_per_week: 3, variety: 'some', goals: 'Bench 225 by March',
  });
  expect(saved.priorities).toEqual([{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }]);

  // A priority already chosen is not offered again in another box, and nothing is stored for it.
  const third = page.getByRole('combobox', { name: 'Priority 3rd' });
  await expect(third.getByRole('option', { name: /Build strength/ })).toBeDisabled();
  await expect(third.getByRole('option', { name: 'Build muscle' })).toBeEnabled();
  // Writing in the same "other" words twice is refused: the box snaps back to what is saved, with the reason beside it.
  await third.selectOption('other');
  await page.getByRole('textbox', { name: 'Your own priority 3rd' }).fill('rock climbing');
  await page.getByRole('textbox', { name: 'Your own priority 3rd' }).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'already one of your priorities' })).toBeVisible();
  await expect(third).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Your own priority 3rd' })).toHaveCount(0);
  expect((await coachRow(me)).priorities).toEqual([{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }]);

  // Step 2: the connector link and one set of steps for each coach app, with marked placeholders for screenshots.
  await expect(page.getByRole('textbox', { name: 'Connector link' })).toHaveValue('http://localhost:3000/mcp');
  await expect(page.getByRole('list', { name: 'Steps for ChatGPT' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Screenshot placeholder' }).first()).toContainText('Screenshot to come');
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Steps for Claude' })).toBeVisible();

  // Step 3: the instructions to copy.
  await expect(page.getByRole('textbox', { name: 'Coach instructions' })).toHaveValue(/You are my strength coach/);

  // The two short notes and Step 4: check your setup.
  await expect(page.getByText('@Chalk and Iron').first()).toBeVisible();
  await expect(page.getByText(/personal settings/)).toBeVisible();
  const check = page.getByRole('region', { name: 'Step 4, check your setup' });
  await expect(check).toContainText('check setup');
  await expect(check.getByLabel('Expected reply')).toHaveText('Chalk and Iron coach ready, instructions version 5');

  // Step 5: the coach link is kept only as a web address; the phone's Coach button opens it.
  await page.getByRole('textbox', { name: 'Coach link' }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save the link' }).click();
  await expect(page.getByText('The link must start with https://')).toBeVisible();
  expect((await sql<{ coach_link: string | null }>(`select coach_link from public.profiles where id = $1`, [me]))[0].coach_link).toBeNull();
  await page.getByRole('textbox', { name: 'Coach link' }).fill('https://chatgpt.com/g/test/project');
  await page.getByRole('button', { name: 'Save the link' }).click();
  await expect(page.getByText(/The Coach button on your phone now opens this/)).toBeVisible();
  expect((await sql<{ coach_link: string }>(`select coach_link from public.profiles where id = $1`, [me]))[0].coach_link).toBe('https://chatgpt.com/g/test/project');
  await page.goto('/app/coach');
  await expect(page.getByRole('link', { name: 'Open my coach' })).toHaveAttribute('href', 'https://chatgpt.com/g/test/project');

  // Step 6: the connection test waits, then says Connected when a coach's call arrives.
  await page.goto('/planner/coach-setup');
  await expect(page.getByText('Your coach has not used the connection yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Start the connection test' }).click();
  await expect(page.getByText(/Waiting for your coach/)).toBeVisible();
  await sql(`insert into public.connector_calls (user_id, client_name, tool, ok) values ($1, 'ChatGPT', 'get_profile', true)`, [me]);
  await expect(page.getByText(/Connected\./)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/ChatGPT read your data/)).toBeVisible();

  // Step 7, the guide to what you can ask your coach, and the connected apps list with its Disconnect.
  await expect(page.getByText('Let\'s get started', { exact: false }).first()).toBeVisible();
  const guide = page.getByRole('region', { name: 'What you can ask your coach' });
  await expect(guide.getByRole('heading', { name: 'What you can ask your coach' })).toBeVisible();
  await expect(guide.locator('summary', { hasText: 'In the gym' })).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Open my coach' })).toHaveAttribute('href', 'https://chatgpt.com/g/test/project');
  await expect(page.getByRole('heading', { name: 'Connected coach apps' })).toBeVisible();
});

test('Profile and gyms: the intake answers are there, and a large gym can be reviewed and edited', async ({ page }) => {
  const me = await register(page, 'Gym Gus');
  await sql(`update public.coach_profiles set coach_style = 'neutral', how_to_coach_me = 'Keep it short' where user_id = $1`, [me]);
  await page.goto('/planner/profile');
  // Sections start closed, each with a one-line summary; open one to use it.
  await expect(page.locator('summary', { hasText: 'Your answers' })).toContainText('2 of 12 answered');
  await expect(page.getByRole('combobox', { name: 'Coach style' })).toBeHidden();
  await page.locator('summary', { hasText: 'Your answers' }).click();
  await expect(page.getByRole('combobox', { name: 'Coach style' })).toHaveValue('neutral');
  await expect(page.getByRole('textbox', { name: 'Anything else about how to coach me' })).toHaveValue('Keep it short');

  // A first gym becomes the default one.
  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Big Gym');
  await page.getByRole('button', { name: 'Add gym' }).click();
  const gym = page.getByRole('region', { name: 'Gym Big Gym' });
  await expect(gym.getByText('Default gym')).toBeVisible();
  const equipment = async () => (await sql<{ equipment: string[] }>(`select equipment from public.gyms where user_id = $1 and name = 'Big Gym'`, [me]))[0].equipment;

  // A new gym's parts start closed (Equipment opens once, for a gym just made), with one-line summaries.
  await expect(gym.locator('summary', { hasText: 'Notes and gym details' })).toContainText('No notes');
  await expect(gym.locator('summary', { hasText: 'Weights' })).toContainText('Not recorded');
  await expect(gym.getByRole('textbox', { name: 'Notes for Big Gym' })).toBeHidden();
  // The coach's note about limits is kept as gym notes.
  await gym.locator('summary', { hasText: 'Notes and gym details' }).click();
  await gym.getByRole('textbox', { name: 'Notes for Big Gym' }).fill('Dumbbells go to 100 lb');
  await gym.getByRole('textbox', { name: 'Notes for Big Gym' }).blur();
  await expect.poll(async () => (await sql<{ notes: string }>(`select notes from public.gyms where user_id = $1`, [me]))[0].notes).toBe('Dumbbells go to 100 lb');

  // Add one, then paste forty at once (with one already there).
  // A new gym opens its equipment list at once.
  await expect(gym.getByRole('textbox', { name: 'Add equipment to Big Gym' })).toBeVisible();
  await gym.getByRole('textbox', { name: 'Add equipment to Big Gym' }).fill('Rower');
  await gym.getByRole('textbox', { name: 'Add equipment to Big Gym' }).press('Enter');
  await expect.poll(equipment).toEqual(['Rower']);
  await gym.getByText('Add many at once').click();
  const lines = Array.from({ length: 40 }, (_, i) => `Machine ${String(i + 1).padStart(2, '0')}`);
  await gym.getByRole('textbox', { name: 'Paste equipment for Big Gym' }).fill(['rower', ...lines].join('\n'));
  await expect(gym.getByText('40 new, 1 already in the list.')).toBeVisible();
  await gym.getByRole('button', { name: 'Add 40 to the list' }).click();
  await expect.poll(async () => (await equipment()).length).toBe(41);
  expect((await equipment()).slice(0, 2)).toEqual(['Machine 01', 'Machine 02']);
  await expect(gym.getByText('41 items, kept in A to Z order')).toBeVisible();

  // Filter a long list, then remove one item and put it back with Undo.
  await gym.getByRole('textbox', { name: 'Filter Big Gym equipment' }).fill('machine 3');
  await expect(gym.getByText('Showing 10 of 41.')).toBeVisible();
  await gym.getByRole('textbox', { name: 'Filter Big Gym equipment' }).fill('');
  await gym.getByRole('button', { name: 'Remove Machine 05' }).click();
  await expect.poll(async () => (await equipment()).includes('Machine 05')).toBe(false);
  await gym.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await equipment()).includes('Machine 05')).toBe(true);

  // Rename one item.
  const rename = gym.getByRole('textbox', { name: 'Name of Rower' });
  await rename.fill('Concept2 rower');
  await rename.press('Enter');
  await expect.poll(async () => (await equipment()).includes('Concept2 rower')).toBe(true);

  // Edit the whole list as text: keep three, add one.
  await gym.getByRole('button', { name: 'Edit as text' }).click();
  await gym.getByRole('textbox', { name: 'Equipment text for Big Gym' }).fill('Concept2 rower\nSled\nMachine 02');
  await expect(gym.getByText(/1 to add, 39 to remove/)).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await gym.getByRole('button', { name: 'Save the list' }).click();
  await expect.poll(equipment).toEqual(['Concept2 rower', 'Machine 02', 'Sled']);

  // A second gym can be made the default; archiving hides a gym and Restore brings it back.
  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Hotel');
  await page.getByRole('button', { name: 'Add gym' }).click();
  const hotel = page.getByRole('region', { name: 'Gym Hotel' });
  await hotel.getByRole('button', { name: 'Make default' }).click();
  await expect.poll(async () => (await sql<{ name: string }>(`select name from public.gyms where user_id = $1 and is_default`, [me]))[0]?.name).toBe('Hotel');
  page.once('dialog', (d) => void d.accept());
  await hotel.locator('summary', { hasText: 'Notes and gym details' }).click();
  await hotel.getByRole('button', { name: 'Archive this gym' }).click();
  await expect(page.getByRole('region', { name: 'Gym Hotel' })).toHaveCount(0);
  await page.getByText('1 archived gym').click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('region', { name: 'Gym Hotel' })).toBeVisible();
});

test('Gym presets on a phone: a new gym from a preset, untick what it lacks, add to it later, nothing removed', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const me = await register(page, 'Preset Pat');
  await page.goto('/planner/profile');
  const equipment = async (name: string) => (await sql<{ equipment: string[] }>(`select equipment from public.gyms where user_id = $1 and name = $2`, [me, name]))[0]?.equipment;

  // Adding a gym from a preset needs the name first, then no typing at all.
  await page.getByRole('button', { name: 'Add a gym from a preset' }).click();
  await page.getByRole('button', { name: /Hotel or corporate gym/ }).click();
  await expect(page.getByRole('button', { name: 'Type the gym name first' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Hotel gym');
  // Everything is ticked, and the tap targets are large.
  // The groups start closed, each with a count.
  await expect(page.locator('summary', { hasText: 'Cardio' })).toContainText(/\d+ of \d+ ticked/);
  const treadmill = page.getByRole('checkbox', { name: 'Treadmill' });
  await expect(treadmill).toBeHidden();
  await page.locator('summary', { hasText: 'Cardio' }).click();
  await expect(treadmill).toBeChecked();
  // One item per row: the box is to the left of its label, on the same line, and boxes line up.
  const tb = await treadmill.boundingBox();
  const lb = await page.getByText('Treadmill', { exact: true }).boundingBox();
  expect(lb!.x).toBeGreaterThan(tb!.x + tb!.width - 1);
  expect(Math.abs((lb!.y + lb!.height / 2) - (tb!.y + tb!.height / 2))).toBeLessThan(12);
  const eb = await page.getByRole('checkbox', { name: 'Elliptical' }).boundingBox();
  expect(Math.abs(eb!.x - tb!.x)).toBeLessThan(1);
  const box = await treadmill.locator('xpath=ancestor::label').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeLessThanOrEqual(375);
  // Select all / Clear per group, and one untick.
  await page.getByRole('button', { name: 'Clear Cardio' }).click();
  await expect(treadmill).not.toBeChecked();
  await page.getByRole('button', { name: 'Select all Cardio' }).click();
  await expect(treadmill).toBeChecked();
  await page.getByRole('checkbox', { name: 'Elliptical' }).uncheck();
  await page.getByRole('button', { name: /^Add gym with \d+ items$/ }).click();
  await expect.poll(() => equipment('Hotel gym')).toBeTruthy();
  const hotel = (await equipment('Hotel gym'))!;
  expect(hotel).toContain('Treadmill');
  expect(hotel).not.toContain('Elliptical');
  expect(hotel).toEqual([...hotel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })));
  expect(hotel.every((i) => i.length <= 60)).toBe(true);

  // On the existing gym: its own item stays, the preset adds only what is ticked, and nothing is removed.
  const gym = page.getByRole('region', { name: 'Gym Hotel gym' });
  await gym.getByRole('textbox', { name: 'Add equipment to Hotel gym' }).fill('Sandbag');
  await gym.getByRole('textbox', { name: 'Add equipment to Hotel gym' }).press('Enter');
  await expect.poll(async () => (await equipment('Hotel gym'))!.includes('Sandbag')).toBe(true);
  const before = (await equipment('Hotel gym'))!;
  await gym.getByRole('button', { name: 'Start from a preset' }).click();
  await gym.getByRole('button', { name: /Home gym/ }).click();
  await gym.locator('summary', { hasText: 'Cardio' }).click();
  await expect(gym.getByText('already in the list').first()).toBeVisible();
  await gym.getByRole('button', { name: 'Clear Cardio' }).click();
  await gym.getByRole('button', { name: /^Add \d+ to the list$/ }).click();
  await expect.poll(async () => (await equipment('Hotel gym'))!.includes('Suspension trainer')).toBe(true);
  const after = (await equipment('Hotel gym'))!;
  for (const i of before) expect(after).toContain(i);
  expect(after).not.toContain('Rowing machine');
  expect(after).toContain('Squat rack');
});

test('Gym weights on a phone: set with taps, kept in the notes beside other notes, read back, preset weights, hand edits left alone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const me = await register(page, 'Weights Wes');
  await page.goto('/planner/profile');
  const notesOf = async (name: string) => (await sql<{ notes: string }>(`select notes from public.gyms where user_id = $1 and name = $2`, [me, name]))[0]?.notes;

  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Garage');
  await page.getByRole('button', { name: 'Add gym' }).click();
  const gym = page.getByRole('region', { name: 'Gym Garage' });
  await gym.locator('summary', { hasText: 'Notes and gym details' }).click();
  await gym.getByRole('textbox', { name: 'Notes for Garage' }).fill('Closed Sundays');
  await gym.getByRole('textbox', { name: 'Notes for Garage' }).blur();
  await expect.poll(() => notesOf('Garage')).toBe('Closed Sundays');

  // Open Weights; all targets are large and nothing is wider than the phone.
  await gym.locator('summary', { hasText: 'Weights' }).click();
  const weights = gym.getByRole('group', { name: 'Weights for Garage' });
  await weights.getByRole('button', { name: 'Has some' }).first().click(); // dumbbells
  const more = weights.getByRole('button', { name: 'More Heaviest' });
  const b = await more.boundingBox();
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(b!.width).toBeGreaterThanOrEqual(44);
  await weights.getByRole('button', { name: 'More Heaviest' }).click(); // 50 -> 55
  await weights.getByRole('button', { name: 'More Heaviest' }).click(); // 60
  await weights.getByRole('group', { name: 'Kettlebells present' }).getByRole('button', { name: 'Has some' }).click();
  const bell = weights.getByRole('group', { name: 'Kettlebell sizes' }).getByRole('checkbox', { name: '35 lb' });
  await bell.check();
  const bellRow = await bell.boundingBox();
  const bellLabel = await weights.getByText('35 lb', { exact: true }).boundingBox();
  expect(bellLabel!.x).toBeGreaterThan(bellRow!.x);
  expect(bellRow!.height).toBeGreaterThanOrEqual(20);
  await weights.getByRole('group', { name: 'Plates present' }).getByRole('button', { name: 'Has some' }).click();
  await weights.getByRole('button', { name: 'More 45 lb plates' }).click();
  await weights.getByRole('button', { name: 'More 45 lb plates' }).click();
  await expect(weights.getByRole('status').filter({ hasText: 'Heaviest barbell: 375 lb' })).toBeVisible();
  await weights.getByRole('button', { name: 'Save weights' }).click();
  await expect.poll(() => notesOf('Garage')).toMatch(/^Closed Sundays\nWeights: Dumbbells 5 to 60 lb in 5 lb steps\. Kettlebells 35 lb\. Plates \(lb\): 45 x4, 35 x2, 25 x2, 10 x2, 5 x2\. Heaviest barbell: 375 lb \(bar 45 lb\)\.$/);
  // Nothing in the Weights section is wider than the phone (the rest of the planner page is not this test's concern).
  const widest = await weights.evaluate((el) => Math.max(...[el, ...Array.from(el.querySelectorAll('*'))].map((n) => n.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(375);

  // Reading back fills the section: reload, and the saved values are shown.
  await page.reload();
  const again = page.getByRole('region', { name: 'Gym Garage' });
  await expect(again.locator('summary', { hasText: 'Weights' })).toContainText('Dumbbells 5 to 60 lb, Kettlebells 1 size, Heaviest barbell 375 lb');
  await again.locator('summary', { hasText: 'Weights' }).click();
  await expect(again.getByRole('status').filter({ hasText: 'Heaviest barbell: 375 lb' })).toBeVisible();
  await expect(again.getByLabel('Heaviest value')).toHaveText('60 lb');

  // A later save replaces only the block.
  await again.getByRole('button', { name: 'Less Heaviest' }).click();
  await again.getByRole('button', { name: 'Save weights' }).click();
  await expect.poll(() => notesOf('Garage')).toMatch(/^Closed Sundays\nWeights: Dumbbells 5 to 55 lb/);
  expect(((await notesOf('Garage'))!.match(/Weights:/g) ?? []).length).toBe(1);

  // A hand-edited block is reported and left alone.
  await sql(`update public.gyms set notes = 'Closed Sundays' || chr(10) || 'Weights: dumbbells to about 100' where user_id = $1`, [me]);
  await page.reload();
  const edited = page.getByRole('region', { name: 'Gym Garage' });
  await edited.locator('summary', { hasText: 'Weights' }).click();
  await expect(edited.getByText(/cannot be read, so it is left as it is/)).toBeVisible();
  await expect(edited.getByRole('button', { name: 'Save weights' })).toHaveCount(0);
  expect(await notesOf('Garage')).toBe('Closed Sundays\nWeights: dumbbells to about 100');

  // A new gym from a preset records that preset's typical weights.
  await page.getByRole('button', { name: 'Add a gym from a preset' }).click();
  await page.getByRole('button', { name: /Hotel or corporate gym/ }).click();
  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Hotel gym');
  await expect(page.getByRole('checkbox', { name: /typical weights/ })).toBeChecked();
  await page.getByRole('button', { name: /^Add gym with \d+ items$/ }).click();
  await expect.poll(() => notesOf('Hotel gym')).toContain('Weights: Dumbbells 5 to 50 lb in 5 lb steps. Kettlebells none. Plates none.');
});
