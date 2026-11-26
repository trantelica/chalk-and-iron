// Stage 4B: my_coach_app answers a connected coach with its own app's
// registered name, and nothing to anyone else (design Section 3, "How the
// connector is built", the call log).
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';

let db: Db;
let a: string;
const chatgpt = '11111111-1111-4111-8111-111111111111';
const claude = '22222222-2222-4222-8222-222222222222';
const gone = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  await db.server(`insert into auth.oauth_clients (id, client_name, deleted_at) values
    ($1, 'ChatGPT', null), ($2, '  Claude  ', null), ($3, 'Removed app', now())`, [chatgpt, claude, gone]);
});

const name = async (opts: { coach?: boolean; clientId?: string }) =>
  (await db.as<{ n: string | null }>(a, `select public.my_coach_app() as n`, [], opts))[0].n;

describe('the coach app\'s own name', () => {
  it('a coach gets its own app\'s name, trimmed', async () => {
    expect(await name({ coach: true, clientId: chatgpt })).toBe('ChatGPT');
    expect(await name({ coach: true, clientId: claude })).toBe('Claude');
  });

  it('nothing for an app that was removed, an id that is not one, or the app\'s own sign-in', async () => {
    expect(await name({ coach: true, clientId: gone })).toBeNull();
    expect(await name({ coach: true, clientId: 'not-an-id' })).toBeNull();
    expect(await name({})).toBeNull();
  });

  it('changes nothing', async () => {
    const before = await db.server(`select count(*)::int as n from public.connector_calls`);
    await name({ coach: true, clientId: chatgpt });
    expect(await db.server(`select count(*)::int as n from public.connector_calls`)).toEqual(before);
  });
});
