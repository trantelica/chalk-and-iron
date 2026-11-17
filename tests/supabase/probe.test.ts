// Fact-finding on Supabase's own local version (temporary, removed once the
// account fixes are built). Logs how sign-ins behave under a block, a global
// sign-out and the clean-up, so the fixes rest on observed behavior.
import { describe, it } from 'vitest';
import { adminClient } from '@/server/admin-client';
import { claims, connectCoach, registerAccount, renew, sql, seesOwnProfile } from './helpers';

const fact = (k: string, v: unknown) => console.log('FACT ' + k + ' = ' + JSON.stringify(v));
const pick = (c: Record<string, unknown>) => ({ iat: c.iat, session_id: c.session_id, amr: c.amr, client_id: c.client_id, aal: c.aal });

describe('probe', () => {
  it('records sign-in behavior', async () => {
    await registerAccount('Admin');
    const p = await registerAccount('Probe');
    fact('device_claims', pick(claims(p.session.access_token)));
    const r1 = await renew(p.session.refresh_token);
    fact('device_renew', r1.ok ? pick(claims(r1.access)) : r1.error);
    let devRefresh = r1.ok ? r1.refresh : p.session.refresh_token;

    let coach: Awaited<ReturnType<typeof connectCoach>> | null = null;
    try {
      coach = await connectCoach(p.client);
      fact('coach_claims', pick(claims(coach.access)));
      const c1 = await coach.renew(coach.refresh);
      fact('coach_renew', c1.ok ? pick(claims(c1.access)) : c1.error);
      if (c1.ok) coach.refresh = c1.refresh;
    } catch (e) {
      fact('coach_connect_error', String(e));
    }

    for (const t of ['auth.sessions', 'auth.refresh_tokens', 'auth.oauth_authorizations', 'auth.oauth_consents', 'auth.oauth_clients', 'auth.users']) {
      try { fact('select_' + t, (await sql(`select count(*)::int as n from ${t}`))[0]); } catch (e) { fact('select_' + t, String(e)); }
      try {
        await sql(`begin; delete from ${t} where false; rollback;`);
        fact('delete_' + t, 'allowed');
      } catch (e) { fact('delete_' + t, String(e)); }
    }
    try { fact('sessions_cols', (await sql(`select column_name from information_schema.columns where table_schema='auth' and table_name='sessions'`)).map((r) => r.column_name)); } catch (e) { fact('sessions_cols', String(e)); }
    try { fact('current_user', await sql(`select current_user, session_user`)); } catch (e) { fact('current_user', String(e)); }

    // Block sign-in, as a reset does when the link is made.
    await adminClient().auth.admin.updateUserById(p.id, { ban_duration: '876000h' });
    const b1 = await renew(devRefresh);
    fact('device_renew_while_blocked', b1.ok ? 'renewed' : b1.error);
    if (coach) { const cb = await coach.renew(coach.refresh); fact('coach_renew_while_blocked', cb.ok ? 'renewed' : cb.error); if (cb.ok) coach.refresh = cb.refresh; }
    fact('sessions_while_blocked', await sql(`select count(*)::int as n from auth.sessions where user_id = $1`, [p.id]).catch(String));

    // Lift the block, as opening the link does today.
    await adminClient().auth.admin.updateUserById(p.id, { ban_duration: 'none' });
    const u1 = await renew(devRefresh);
    fact('device_renew_after_unblock', u1.ok ? 'renewed' : u1.error);
    if (u1.ok) { devRefresh = u1.refresh; fact('device_sees_profile_after_unblock', await seesOwnProfile(u1.access)); }
    if (coach) { const cu = await coach.renew(coach.refresh); fact('coach_renew_after_unblock', cu.ok ? 'renewed' : cu.error); if (cu.ok) coach.refresh = cu.refresh; }

    // Global sign-out using a fresh server-made sign-in.
    const { data: link } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: p.email });
    const { device } = await import('./helpers');
    const d2 = device();
    const v = await d2.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: 'magiclink' });
    fact('server_session_ok', !!v.data.session);
    const so = await adminClient().auth.admin.signOut(v.data.session!.access_token, 'global');
    fact('global_signout_error', so.error ? String(so.error.message) : null);
    const g1 = await renew(devRefresh);
    fact('device_renew_after_global_signout', g1.ok ? 'renewed' : g1.error);
    if (coach) { const cg = await coach.renew(coach.refresh); fact('coach_renew_after_global_signout', cg.ok ? 'renewed' : cg.error); }
    fact('sessions_after_global_signout', await sql(`select count(*)::int as n from auth.sessions where user_id = $1`, [p.id]).catch(String));

    // The 14-day clean-up, as the scheduler runs it.
    const q = await registerAccount('Leaving');
    await sql(`update public.profiles set delete_requested_at = now() - interval '15 days' where id = $1`, [q.id]);
    try {
      fact('purge_result', await sql(`select app.purge_deleted_accounts() as n`));
      fact('purge_user_left', await sql(`select count(*)::int as n from auth.users where id = $1`, [q.id]));
    } catch (e) { fact('purge_error', String(e)); }
    try { fact('cron_jobs', await sql(`select jobname, schedule, username from cron.job`)); } catch (e) { fact('cron_jobs', String(e)); }
  });
});
