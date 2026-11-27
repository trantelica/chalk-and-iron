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

  // The same priority twice is refused on the page and nothing is stored.
  await page.getByRole('combobox', { name: 'Priority 3rd' }).selectOption('strength');
  await expect(page.getByRole('alert').filter({ hasText: 'Each priority can be chosen once.' })).toBeVisible();
  expect((await coachRow(me)).priorities).toEqual([{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }]);

  // Step 2: the connector link and one set of steps for each coach app, with marked placeholders for screenshots.
  await expect(page.getByRole('textbox', { name: 'Connector link' })).toHaveValue('http://localhost:3000/mcp');
  await expect(page.getByRole('list', { name: 'Steps for ChatGPT' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Screenshot placeholder' }).first()).toContainText('Screenshot to come');
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Steps for Claude' })).toBeVisible();

  // Step 3: the instructions to copy.
  await expect(page.getByRole('textbox', { name: 'Coach instructions' })).toHaveValue(/You are my strength coach/);

  // Step 4: the coach link is kept only as a web address; the phone's Coach button opens it.
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

  // Step 5: the connection test waits, then says Connected when a coach's call arrives.
  await page.goto('/planner/coach-setup');
  await expect(page.getByText('Your coach has not used the connection yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Start the connection test' }).click();
  await expect(page.getByText(/Waiting for your coach/)).toBeVisible();
  await sql(`insert into public.connector_calls (user_id, client_name, tool, ok) values ($1, 'ChatGPT', 'get_profile', true)`, [me]);
  await expect(page.getByText(/Connected\./)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/ChatGPT read your data/)).toBeVisible();

  // Step 6, and the connected apps list with its Disconnect.
  await expect(page.getByText('Let\'s get started', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connected coach apps' })).toBeVisible();
});

test('Profile and gyms: the intake answers are there, and a large gym can be reviewed and edited', async ({ page }) => {
  const me = await register(page, 'Gym Gus');
  await sql(`update public.coach_profiles set coach_style = 'neutral', how_to_coach_me = 'Keep it short' where user_id = $1`, [me]);
  await page.goto('/planner/profile');
  await expect(page.getByRole('combobox', { name: 'Coach style' })).toHaveValue('neutral');
  await expect(page.getByRole('textbox', { name: 'Anything else about how to coach me' })).toHaveValue('Keep it short');

  // A first gym becomes the default one.
  await page.getByRole('textbox', { name: 'Name of a new gym' }).fill('Big Gym');
  await page.getByRole('button', { name: 'Add gym' }).click();
  const gym = page.getByRole('region', { name: 'Gym Big Gym' });
  await expect(gym.getByText('Default gym')).toBeVisible();
  const equipment = async () => (await sql<{ equipment: string[] }>(`select equipment from public.gyms where user_id = $1 and name = 'Big Gym'`, [me]))[0].equipment;

  // The coach's note about limits is kept as gym notes.
  await gym.getByRole('textbox', { name: 'Notes for Big Gym' }).fill('Dumbbells go to 100 lb');
  await gym.getByRole('textbox', { name: 'Notes for Big Gym' }).blur();
  await expect.poll(async () => (await sql<{ notes: string }>(`select notes from public.gyms where user_id = $1`, [me]))[0].notes).toBe('Dumbbells go to 100 lb');

  // Add one, then paste forty at once (with one already there).
  // A new gym opens its equipment list at once.
  await expect(gym.getByRole('button', { name: 'Close equipment' })).toBeVisible();
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
  await hotel.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('region', { name: 'Gym Hotel' })).toHaveCount(0);
  await page.getByText('1 archived gym').click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('region', { name: 'Gym Hotel' })).toBeVisible();
});
