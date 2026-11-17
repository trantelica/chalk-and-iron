-- Chalk and Iron, Phase 1: a reset cuts off the old sign-in at once.
-- Decided by Nathan on 17 November 2026, after testing on a real account:
-- a reset exists because the old way of signing in can no longer be trusted,
-- so making the reset link must stop it immediately, not when the link is
-- opened.
--
-- Plain-language summary for Nathan:
--   * Making a reset link now signs the person out everywhere, disconnects
--     their coach apps and (through the app's server) removes their old
--     passkeys and blocks sign-in until the link is opened, straight away.
--   * As a second lock, the database refuses every pass issued before the
--     reset, from the app or from a coach, even one still in someone's hands.
--   * Opening the link is then the only way back in: it makes a new passkey.

alter table public.profiles add column if not exists sign_ins_cut_at timestamptz;

-- The caller's user id, but only while their account is active and their
-- pass was issued after any reset. (Replaces the Phase 1 version.)
create or replace function app.current_uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.id = auth.uid()
    and p.account_status = 'active'
    and (p.sign_ins_cut_at is null
         or coalesce(nullif(auth.jwt() ->> 'iat', '')::numeric, 0) >= floor(extract(epoch from p.sign_ins_cut_at)))
$$;

-- Ends every sign-in a person has. A table Supabase does not let the
-- database change is skipped rather than failing the whole action: the
-- sign_ins_cut_at lock above still refuses every older pass.
create or replace function app.end_all_sign_ins(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t text;
begin
  foreach t in array array['auth.sessions', 'auth.refresh_tokens', 'auth.oauth_authorizations', 'auth.oauth_consents'] loop
    if to_regclass(t) is not null then
      begin
        if t = 'auth.refresh_tokens' then
          execute format('delete from %s where user_id::text = $1::text', t) using p_user;
        else
          execute format('delete from %s where user_id = $1', t) using p_user;
        end if;
      exception when insufficient_privilege or undefined_column then
        raise notice 'Could not clear %: the sign-in cut-off still applies', t;
      end;
    end if;
  end loop;
end $$;

-- Making a reset link now cuts off the old sign-in at once.
create or replace function public.admin_create_reset(p_user uuid)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
  c text := app.new_code();
  r public.invites;
  who text;
begin
  select display_name into who from public.profiles where id = p_user;
  if who is null then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
  -- Any earlier reset link for this person stops working.
  update public.invites set cancelled_at = now()
  where for_user = p_user and purpose = 'reset' and used_at is null and cancelled_at is null;
  insert into public.invites (code_hash, purpose, for_user, label, created_by)
  values (app.hash_code(c), 'reset', p_user, who, me)
  returning * into r;
  update public.profiles set sign_ins_cut_at = now(), reset_notice_at = now() where id = p_user;
  perform app.end_all_sign_ins(p_user);
  perform app.log_admin_action(me, 'create_reset', p_user, who, r.id);
  return query select r.id, c, r.expires_at;
end $$;

-- Opening the reset link: marks it used. The old sign-ins were already ended
-- when it was made; this clears anything made since, so only the new
-- passkey set up next works.
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
  update public.profiles set sign_ins_cut_at = now(), reset_notice_at = now() where id = inv.for_user;
  perform app.end_all_sign_ins(inv.for_user);
  return inv.for_user;
end $$;

revoke all on function public.admin_create_reset(uuid), public.redeem_reset(text) from public, anon;
grant execute on function public.admin_create_reset(uuid) to authenticated;
grant execute on function public.redeem_reset(text) to service_role;
grant execute on function app.current_uid() to authenticated, service_role;
grant execute on function app.end_all_sign_ins(uuid) to service_role;
