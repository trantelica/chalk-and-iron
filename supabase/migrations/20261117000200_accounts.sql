-- Chalk and Iron, Phase 1: accounts, invites, resets, the admin page and
-- account deletion. Design Section 4, "Invites and the admin page".
--
-- Plain-language summary for Nathan:
--   * A link's secret is never stored. The database keeps only a scrambled
--     copy (a hash), so reading the database does not reveal a usable link.
--   * Every admin action is checked here: the caller must be an admin using
--     the app's own sign-in (never a coach), and the last admin is protected.
--   * Admin functions return account details only. No training data.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app.hash_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_code, 'UTF8')), 'hex')
$$;

-- A fresh link secret: 64 random hex characters.
create or replace function app.new_code() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create or replace function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
begin
  if me is null or not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'Only an admin can do this' using errcode = 'insufficient_privilege';
  end if;
  return me;
end $$;

-- True when p_user is the only active admin left.
create or replace function app.is_last_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and is_admin and account_status = 'active'
                   and delete_requested_at is null)
     and not exists (select 1 from public.profiles where id <> p_user and is_admin
                       and account_status = 'active' and delete_requested_at is null)
$$;

create or replace function app.log_admin_action(p_admin uuid, p_action text, p_user uuid, p_label text, p_invite uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions (admin_id, action, target_user, target_label, invite_id)
  values (p_admin, p_action, p_user, coalesce(p_label, ''), p_invite)
$$;

-- Ends every sign-in a person has: app sessions and coach connections.
-- Supabase keeps these in its auth schema. The tables are looked up by name
-- so this also runs on a test database that lacks them.
create or replace function app.end_all_sign_ins(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1::text' using p_user;
  end if;
  if to_regclass('auth.oauth_authorizations') is not null then
    execute 'delete from auth.oauth_authorizations where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.oauth_consents') is not null then
    execute 'delete from auth.oauth_consents where user_id = $1' using p_user;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seeding a new account: vocabulary and the starter library
-- ---------------------------------------------------------------------------

-- p_starter is the repository file data/starter-library.json, passed in by the
-- server at registration. Exercises are linked to vocabulary by name, and an
-- alternate is linked to a library exercise when one has its name.
create or replace function app.seed_account(p_user uuid, p_starter jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  mg jsonb;
  f jsonb;
  eq jsonb;
  ex jsonb;
  tier text;
  mg_id uuid;
  n integer := 0;
  m integer;
begin
  for mg in select * from jsonb_array_elements(p_starter -> 'vocabulary' -> 'muscle_groups') loop
    n := n + 1;
    insert into public.vocabulary_terms (user_id, kind, name, sort_order)
    values (p_user, 'muscle_group', mg ->> 'name', n) returning id into mg_id;
    m := 0;
    for f in select * from jsonb_array_elements(coalesce(mg -> 'focus', '[]'::jsonb)) loop
      m := m + 1;
      insert into public.vocabulary_terms (user_id, kind, name, parent_id, sort_order)
      values (p_user, 'focus', f #>> '{}', mg_id, m);
    end loop;
  end loop;
  n := 0;
  for eq in select * from jsonb_array_elements(p_starter -> 'vocabulary' -> 'equipment') loop
    n := n + 1;
    insert into public.vocabulary_terms (user_id, kind, name, sort_order)
    values (p_user, 'equipment', eq #>> '{}', n);
  end loop;

  for ex in select * from jsonb_array_elements(p_starter -> 'exercises') loop
    insert into public.exercises (user_id, name, muscle_group_id, focus_id, equipment_id, default_unit,
                                  work_seconds, rest_seconds, note, created_via)
    select p_user, ex ->> 'name', g.id, fo.id, e.id, ex ->> 'default_unit',
           (ex ->> 'work_seconds')::integer, (ex ->> 'rest_seconds')::integer, coalesce(ex ->> 'note', ''), 'starter'
    from public.vocabulary_terms g
    left join public.vocabulary_terms fo on fo.user_id = p_user and fo.kind = 'focus' and fo.parent_id = g.id
                                         and lower(fo.name) = lower(ex ->> 'focus')
    join public.vocabulary_terms e on e.user_id = p_user and e.kind = 'equipment' and lower(e.name) = lower(ex ->> 'equipment')
    where g.user_id = p_user and g.kind = 'muscle_group' and lower(g.name) = lower(ex ->> 'muscle_group');
    if not found then
      raise exception 'Starter exercise % names a muscle group or equipment that is not in the vocabulary', ex ->> 'name';
    end if;
    if ex ->> 'focus' is not null and not exists (
         select 1 from public.exercises x where x.user_id = p_user and x.name = ex ->> 'name' and x.focus_id is not null) then
      raise exception 'Starter exercise % names a focus value that is not in the vocabulary', ex ->> 'name';
    end if;
  end loop;

  for ex in select * from jsonb_array_elements(p_starter -> 'exercises') loop
    foreach tier in array array['bodyweight', 'basic_gym', 'full_gym'] loop
      if ex -> 'alternates' ->> tier is not null then
        insert into public.exercise_alternates (user_id, exercise_id, tier, name, alternate_exercise_id)
        select p_user, x.id, tier, ex -> 'alternates' ->> tier,
               (select a.id from public.exercises a
                where a.user_id = p_user and lower(a.name) = lower(ex -> 'alternates' ->> tier))
        from public.exercises x where x.user_id = p_user and x.name = ex ->> 'name';
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Registering, and resetting a sign-in (called by the app's server only)
-- ---------------------------------------------------------------------------

-- Checks an invite link before the registration form is shown.
create or replace function public.check_link(p_code text)
returns table (purpose text, label text, valid boolean, reason text)
language sql stable security definer set search_path = '' as $$
  select i.purpose, i.label,
         i.used_at is null and i.cancelled_at is null and i.expires_at > now(),
         case when i.used_at is not null then 'used'
              when i.cancelled_at is not null then 'cancelled'
              when i.expires_at <= now() then 'expired'
              else 'ok' end
  from public.invites i where i.code_hash = app.hash_code(p_code)
$$;

-- Uses an invite: creates the profile, the coach profile, the vocabulary and
-- the starter library in one step. The sign-in record (auth.users) is made by
-- the server just before. A used link never works again.
create or replace function public.register_with_invite(p_code text, p_user uuid, p_email text,
                                                       p_display_name text, p_time_zone text, p_starter jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites
  where code_hash = app.hash_code(p_code) and purpose = 'invite'
  for update;
  if not found or inv.used_at is not null or inv.cancelled_at is not null or inv.expires_at <= now() then
    raise exception 'This invite link is not valid. Ask the person who invited you for a new one.'
      using errcode = 'invalid_authorization_specification';
  end if;

  insert into public.profiles (id, email, display_name, time_zone, is_admin)
  values (p_user, trim(p_email), trim(p_display_name), coalesce(nullif(p_time_zone, ''), 'America/Denver'), inv.grants_admin);
  insert into public.coach_profiles (user_id) values (p_user);
  perform app.seed_account(p_user, p_starter);

  update public.invites set used_at = now(), used_by = p_user where id = inv.id;
end $$;

-- Uses a reset link: ends every sign-in and coach connection the person has
-- and leaves a notice they will see the next time they sign in. The server
-- then removes their passkeys through Supabase's admin tools, so they can set
-- up a new one (src/server/accounts.ts). Returns whose account it is.
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
  perform app.end_all_sign_ins(inv.for_user);
  update public.profiles set reset_notice_at = now() where id = inv.for_user;
  return inv.for_user;
end $$;

-- The very first admin. Works only while no account exists at all, and only
-- for the server. Returns the secret for a single-use invite that makes an
-- admin. Run once with scripts/bootstrap-admin.mjs.
create or replace function public.bootstrap_first_admin_invite(p_label text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text := app.new_code();
begin
  if exists (select 1 from public.profiles) then
    raise exception 'Accounts already exist. Ask an admin for an invite.';
  end if;
  update public.invites set cancelled_at = now()
  where grants_admin and used_at is null and cancelled_at is null;
  insert into public.invites (code_hash, purpose, label, grants_admin)
  values (app.hash_code(code), 'invite', coalesce(p_label, 'First admin'), true);
  return code;
end $$;

-- ---------------------------------------------------------------------------
-- The admin page
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_accounts()
returns table (id uuid, display_name text, email text, joined timestamptz, account_status text,
               is_admin boolean, delete_requested_at timestamptz, purge_after timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
    select p.id, p.display_name, p.email, p.created_at, p.account_status, p.is_admin,
           p.delete_requested_at, p.delete_requested_at + interval '14 days'
    from public.profiles p order by p.created_at;
end $$;

create or replace function public.admin_list_links()
returns table (id uuid, purpose text, label text, for_user uuid, for_name text, created_at timestamptz,
               expires_at timestamptz, state text, used_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
    select i.id, i.purpose, i.label, i.for_user, f.display_name, i.created_at, i.expires_at,
           case when i.used_at is not null then 'used'
                when i.cancelled_at is not null then 'cancelled'
                when i.expires_at <= now() then 'expired'
                else 'waiting' end,
           u.display_name
    from public.invites i
    left join public.profiles f on f.id = i.for_user
    left join public.profiles u on u.id = i.used_by
    order by i.created_at desc;
end $$;

-- Makes a single-use invite. The secret is returned once, to build the link,
-- and never again.
create or replace function public.admin_create_invite(p_label text)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
  c text := app.new_code();
  r public.invites;
begin
  insert into public.invites (code_hash, purpose, label, created_by)
  values (app.hash_code(c), 'invite', left(coalesce(trim(p_label), ''), 120), me)
  returning * into r;
  perform app.log_admin_action(me, 'create_invite', null, r.label, r.id);
  return query select r.id, c, r.expires_at;
end $$;

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
  perform app.log_admin_action(me, 'create_reset', p_user, who, r.id);
  return query select r.id, c, r.expires_at;
end $$;

create or replace function public.admin_cancel_link(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
begin
  update public.invites set cancelled_at = now()
  where id = p_invite and used_at is null and cancelled_at is null;
  perform app.log_admin_action(me, 'cancel_link', null, '', p_invite);
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
begin
  if not p_active and app.is_last_admin(p_user) then
    raise exception 'The last admin cannot be deactivated' using errcode = 'check_violation';
  end if;
  update public.profiles set account_status = case when p_active then 'active' else 'inactive' end
  where id = p_user;
  if not found then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
  if not p_active then
    perform app.end_all_sign_ins(p_user);
  end if;
  perform app.log_admin_action(me, case when p_active then 'reactivate' else 'deactivate' end, p_user, '', null);
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
begin
  if not p_admin and app.is_last_admin(p_user) then
    raise exception 'The last admin cannot stop being an admin' using errcode = 'check_violation';
  end if;
  update public.profiles set is_admin = p_admin where id = p_user;
  if not found then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
  perform app.log_admin_action(me, case when p_admin then 'make_admin' else 'unmake_admin' end, p_user, '', null);
end $$;

-- Deleting an account starts a 14-day grace period. A daily job removes the
-- account and all its data after it. An admin can undo it during that time.
create or replace function public.admin_request_delete(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
begin
  if app.is_last_admin(p_user) then
    raise exception 'The last admin cannot be deleted' using errcode = 'check_violation';
  end if;
  update public.profiles set delete_requested_at = now(), delete_requested_by = me
  where id = p_user and delete_requested_at is null;
  perform app.end_all_sign_ins(p_user);
  perform app.log_admin_action(me, 'delete', p_user, '', null);
end $$;

create or replace function public.admin_undo_delete(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.require_admin();
begin
  update public.profiles set delete_requested_at = null, delete_requested_by = null where id = p_user;
  perform app.log_admin_action(me, 'undo_delete', p_user, '', null);
end $$;

-- ---------------------------------------------------------------------------
-- Self-service account deletion
-- ---------------------------------------------------------------------------

create or replace function public.request_my_account_deletion() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if app.is_last_admin(me) then
    raise exception 'You are the last admin. Make someone else an admin first.' using errcode = 'check_violation';
  end if;
  update public.profiles set delete_requested_at = coalesce(delete_requested_at, now()), delete_requested_by = me
  where id = me;
  return (select delete_requested_at + interval '14 days' from public.profiles where id = me);
end $$;

create or replace function public.cancel_my_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles set delete_requested_at = null, delete_requested_by = null where id = me;
end $$;

-- Clears the "your sign-in was reset" notice once it has been shown.
create or replace function public.dismiss_reset_notice() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set reset_notice_at = null where id = app.can_write_uid()
$$;

-- The daily clean-up: removes accounts whose 14 days have passed. Removing
-- the sign-in record removes the profile and, through it, every row the
-- person owns.
create or replace function app.purge_deleted_accounts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with gone as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id and p.delete_requested_at < now() - interval '14 days'
    returning u.id
  ) select count(*) into n from gone;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_coach(), app.current_uid(), app.can_write_uid(), app.is_admin()
  to authenticated, service_role;
grant execute on all functions in schema app to service_role;
-- Called from inside the database's own rules (triggers) on a person's edits.
grant execute on function app.mark_proposals_out_of_date(text, uuid), app.check_workout_supersets(uuid),
  app.check_day_supersets(uuid) to authenticated;

-- Signed-in people (their own account, or an admin's page).
grant execute on function
  public.admin_list_accounts(), public.admin_list_links(), public.admin_create_invite(text),
  public.admin_create_reset(uuid), public.admin_cancel_link(uuid), public.admin_set_active(uuid, boolean),
  public.admin_set_admin(uuid, boolean), public.admin_request_delete(uuid), public.admin_undo_delete(uuid),
  public.request_my_account_deletion(), public.cancel_my_account_deletion(), public.dismiss_reset_notice()
  to authenticated;

-- The app's server only.
grant execute on function
  public.check_link(text), public.register_with_invite(text, uuid, text, text, text, jsonb),
  public.redeem_reset(text), public.bootstrap_first_admin_invite(text)
  to service_role;
