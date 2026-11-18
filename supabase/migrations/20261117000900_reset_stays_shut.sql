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
--   * A pass records its times to the whole second only. So the cut-off is
--     now the start of the next whole second after the reset is made: a pass
--     issued in the same second as the reset, just before it, is refused too.
--   * Opening the link no longer moves the cut-off later. Sign-in is blocked
--     from the moment the link is made until it is opened, so nothing new can
--     appear in between, and the sign-in made through the link (a second or
--     more later) must not be refused.
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

-- Making a reset link (through the app's server only, as since ...0500).
-- The same as before, except the cut-off rounds up to the next whole second.
create or replace function public.server_create_reset(p_admin uuid, p_user uuid)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  c text := app.new_code();
  r public.invites;
  who text;
begin
  if not exists (select 1 from public.profiles
                 where id = p_admin and is_admin and account_status = 'active') then
    raise exception 'Only an admin can do this' using errcode = 'insufficient_privilege';
  end if;
  select display_name into who from public.profiles where id = p_user;
  if who is null then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
  update public.invites set cancelled_at = now()
  where for_user = p_user and purpose = 'reset' and used_at is null and cancelled_at is null;
  insert into public.invites (code_hash, purpose, for_user, label, created_by)
  values (app.hash_code(c), 'reset', p_user, who, p_admin)
  returning * into r;
  update public.profiles
  set sign_ins_cut_at = date_trunc('second', now()) + interval '1 second', reset_notice_at = now()
  where id = p_user;
  perform app.end_all_sign_ins(p_user);
  perform app.log_admin_action(p_admin, 'create_reset', p_user, who, r.id);
  return query select r.id, c, r.expires_at;
end $$;

-- Opening the reset link: marks it used. The cut-off stays where the reset
-- put it (see the summary above).
create or replace function public.redeem_reset(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites
  where code_hash = app.hash_code(p_code) and purpose = 'reset'
  for update;
  if not found or inv.used_at is not null or inv.cancelled_at is not null or inv.expires_at <= now() then
    raise exception 'This reset link is not valid. Ask your admin for a new one.'
      using errcode = 'invalid_authorization_specification';
  end if;
  update public.invites set used_at = now(), used_by = inv.for_user where id = inv.id;
  update public.profiles set reset_notice_at = now() where id = inv.for_user;
  perform app.end_all_sign_ins(inv.for_user);
  return inv.for_user;
end $$;

revoke all on function public.server_create_reset(uuid, uuid), public.redeem_reset(text) from public, anon, authenticated;
grant execute on function public.server_create_reset(uuid, uuid) to service_role;
grant execute on function public.redeem_reset(text) to service_role;
