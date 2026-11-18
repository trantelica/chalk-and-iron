// Account tests on Supabase's own local version (Phase 1 review, 17 Nov 2026;
// design Section 10E point 10). These hold real renewal tokens, from a second
// device and from a connected coach app, through a reset.
import { describe, expect, it } from 'vitest';
import { adminClient } from '@/server/admin-client';
import { createReset, redeemReset } from '@/server/accounts';
import { claims, connectCoach, registerAccount, renew, seesOwnProfile, signInOnNewDevice, sql, theAdmin } from './helpers';

async function secondDevice(email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return signInOnNewDevice(data.properties.hashed_token);
}

describe('a reset on real Supabase', () => {
  it('cuts off every device and coach app at once, and stays shut after the link is opened', async () => {
    const admin = await theAdmin();
    const sam = await registerAccount('Sam');
    const phone = sam.session;
    const laptop = (await secondDevice(sam.email)).session;
    const coach = await connectCoach(sam.client);
    console.log('coach pass sign-in details: ' + JSON.stringify({ amr: claims(coach.access).amr, client_id: claims(coach.access).client_id }));
    // Before the reset, all three work.
    expect(await seesOwnProfile(phone.access_token)).toBe(true);
    expect(await seesOwnProfile(laptop.access_token)).toBe(true);
    expect(await seesOwnProfile(coach.access)).toBe(true);
    const c0 = await coach.renew(coach.refresh);
    expect(c0.ok).toBe(true);
    const coachRefresh = c0.ok ? c0.refresh : coach.refresh;

    const { code } = await createReset(admin.id, sam.id);

    // At once: no renewal works, and passes still in hand see nothing.
    expect((await renew(phone.refresh_token)).ok).toBe(false);
    expect((await renew(laptop.refresh_token)).ok).toBe(false);
    expect((await coach.renew(coachRefresh)).ok).toBe(false);
    expect(await seesOwnProfile(phone.access_token)).toBe(false);
    expect(await seesOwnProfile(coach.access)).toBe(false);
    expect(await sql(`select count(*)::int as n from auth.sessions where user_id = $1`, [sam.id])).toEqual([{ n: 0 }]);

    // Opening the link (a moment later) lifts the block, and still none of the old ones get back in.
    await new Promise((r) => setTimeout(r, 1100));
    const { tokenHash } = await redeemReset(code);
    expect((await renew(phone.refresh_token)).ok).toBe(false);
    expect((await renew(laptop.refresh_token)).ok).toBe(false);
    expect((await coach.renew(coachRefresh)).ok).toBe(false);
    expect(await seesOwnProfile(phone.access_token)).toBe(false);

    // Only the sign-in made through the link works.
    const fresh = await signInOnNewDevice(tokenHash);
    expect(await seesOwnProfile(fresh.session.access_token)).toBe(true);
    expect(await sql(`select count(*)::int as n from auth.sessions where user_id = $1`, [sam.id])).toEqual([{ n: 1 }]);
    // And it renews normally.
    const again = await renew(fresh.session.refresh_token);
    expect(again.ok && (await seesOwnProfile(again.access))).toBe(true);
    // The admin and everyone else stay signed in.
    expect(await seesOwnProfile(admin.session.access_token)).toBe(true);
  });

  it('the database refuses a pass renewed from a sign-in older than the reset, even if Supabase hands one out', async () => {
    const pat = await registerAccount('Pat');
    // Cut off sign-ins in the database alone, leaving Supabase's own renewal working,
    // as on the live project, where the database cannot end Supabase's sign-ins.
    await new Promise((r) => setTimeout(r, 1100));
    await sql(`update public.profiles set sign_ins_cut_at = now() where id = $1`, [pat.id]);
    const renewed = await renew(pat.session.refresh_token);
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    // The fresh pass keeps the moment the sign-in began...
    expect(claims(renewed.access).amr).toEqual(claims(pat.session.access_token).amr);
    // ...so it sees nothing.
    expect(await seesOwnProfile(renewed.access)).toBe(false);
    // A new sign-in works.
    const fresh = await secondDevice(pat.email);
    expect(await seesOwnProfile(fresh.session.access_token)).toBe(true);
  });

  it('works for a deactivated account too, which stays blocked until reactivated', async () => {
    const admin = await theAdmin();
    const lee = await registerAccount('Lee');
    const { error } = await admin.client.rpc('admin_set_active', { p_user: lee.id, p_active: false });
    expect(error).toBeNull();
    await adminClient().auth.admin.updateUserById(lee.id, { ban_duration: '876000h' });
    const { code } = await createReset(admin.id, lee.id);
    await new Promise((r) => setTimeout(r, 1100));
    await redeemReset(code);
    const { data } = await adminClient().auth.admin.getUserById(lee.id);
    expect(data.user?.banned_until).toBeTruthy();
    // Reactivated later: the old sign-in still sees nothing.
    await admin.client.rpc('admin_set_active', { p_user: lee.id, p_active: true });
    await adminClient().auth.admin.updateUserById(lee.id, { ban_duration: 'none' });
    const r = await renew(lee.session.refresh_token);
    if (r.ok) expect(await seesOwnProfile(r.access)).toBe(false);
  });
});

describe('the 14-day account clean-up on real Supabase', () => {
  it('removes the sign-in record and everything the person owns, as the daily scheduled job runs it', async () => {
    await theAdmin();
    const kim = await registerAccount('Kim');
    const stay = await registerAccount('Stay');
    await sql(`update public.profiles set delete_requested_at = now() - interval '15 days' where id = $1`, [kim.id]);
    await sql(`update public.profiles set delete_requested_at = now() - interval '13 days' where id = $1`, [stay.id]);
    // The scheduled job runs as the database owner, as here.
    const [{ who }] = await sql<{ who: string }>(`select current_user as who`);
    expect(who).toBe('postgres');
    const [{ n }] = await sql<{ n: number }>(`select app.purge_deleted_accounts() as n`);
    expect(n).toBe(1);
    expect(await sql(`select count(*)::int as n from auth.users where id = $1`, [kim.id])).toEqual([{ n: 0 }]);
    expect(await sql(`select count(*)::int as n from public.exercises where user_id = $1`, [kim.id])).toEqual([{ n: 0 }]);
    expect(await sql(`select count(*)::int as n from auth.users where id = $1`, [stay.id])).toEqual([{ n: 1 }]);
    // The job is scheduled daily.
    expect(await sql(`select schedule from cron.job where jobname = 'purge-deleted-accounts'`)).toEqual([{ schedule: '17 10 * * *' }]);
    // Its sign-in is gone too.
    expect((await renew(kim.session.refresh_token)).ok).toBe(false);
  });
});
