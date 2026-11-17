-- Chalk and Iron, start of Phase 2: a reset stays shut after its link is opened.
-- Found by the Phase 1 review on 17 November 2026 (design Section 10E,
-- point 10). Written on Opus 5.5 at high effort, as sign-in work.
--
-- Plain-language summary for Nathan:
--   * Until now the database refused a pass issued before a reset. But a
--     device or coach app still holding a renewal token could fetch a fresh
--     pass once the reset link was opened, and a fresh pass got through.
--   * Every pass also says when its sign-in began. A renewed pass keeps that
--     moment. So the database now refuses any pass whose sign-in began before
--     the reset, however recently it was renewed. Only a sign-in made through
--     the reset link, or later, gets in.
--   * The app's server also signs the person out everywhere, through
--     Supabase's own sign-out, when the link is made and again when it is
--     opened. This is the second lock, and the first to act.
--   * Nothing else changes, and nobody else is affected.

-- When the caller's sign-in began: the earliest moment in the pass's list of
-- how the person signed in ("amr"), which renewing a pass does not change.
-- A pass without that list falls back to the moment it was issued ("iat").
create or replace function app.signed_in_at() returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select min((a ->> 'timestamp')::numeric)
     from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                                    then auth.jwt() -> 'amr' else '[]'::jsonb end) a
     where jsonb_typeof(a) = 'object' and (a ->> 'timestamp') ~ '^[0-9]+(\.[0-9]+)?$'),
    nullif(auth.jwt() ->> 'iat', '')::numeric,
    0)
$$;

-- The caller's user id, but only while their account is active and their
-- sign-in began after any reset. (Replaces the Phase 1 version.)
create or replace function app.current_uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active'
    and (p.sign_ins_cut_at is null
         or (coalesce(nullif(auth.jwt() ->> 'iat', '')::numeric, 0) >= floor(extract(epoch from p.sign_ins_cut_at))
             and app.signed_in_at() >= floor(extract(epoch from p.sign_ins_cut_at))))
$$;

revoke all on function app.signed_in_at() from public, anon, authenticated;
grant execute on function app.signed_in_at() to authenticated, service_role;
grant execute on function app.current_uid() to authenticated, service_role;
