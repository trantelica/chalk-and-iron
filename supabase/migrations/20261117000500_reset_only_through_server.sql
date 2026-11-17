-- Chalk and Iron, Phase 1: a reset can only be made through the app's server.
-- Found when Nathan retested a reset on 17 November 2026: an Admin page still
-- running older app code asked the database for the reset directly, so the
-- server's steps (blocking sign-in in Supabase and removing the old
-- passkeys) never ran, and the old passkey still signed in.
--
-- Plain-language summary for Nathan:
--   * The database now refuses a reset asked for from a page. Only the app's
--     server can make one, and it always does every step.
--   * The server still checks that the person asking is an admin, using their
--     own sign-in, before it asks the database.

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
  update public.profiles set sign_ins_cut_at = now(), reset_notice_at = now() where id = p_user;
  perform app.end_all_sign_ins(p_user);
  perform app.log_admin_action(p_admin, 'create_reset', p_user, who, r.id);
  return query select r.id, c, r.expires_at;
end $$;

-- The old way in, straight from a page, is closed.
revoke all on function public.admin_create_reset(uuid) from public, anon, authenticated;
revoke all on function public.server_create_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_create_reset(uuid, uuid) to service_role;
