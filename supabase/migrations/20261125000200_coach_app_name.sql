-- Chalk and Iron, Phase 4, stage 4B: the coach app's own name (25 November 2026).
-- Follows docs/TECHNICAL_DESIGN.md Section 3, "How the connector is built".
--
-- Plain-language summary for Nate:
--   * The connector logs each call with the coach app's name ("ChatGPT",
--     "Claude"), and stage 4E puts the same name on each card. Supabase's
--     sign-in no longer lets a coach's pass read the person's list of connected
--     apps (since Supabase's November 2026 sign-in update), so the connector
--     could not learn the name. This adds one read-only step that answers a
--     connected coach with its own registered name, and nothing else.
--   * It reads nothing about anyone else, changes nothing, and answers nothing
--     to the app's own sign-in or to anyone signed out.
--   * No table is changed and no data is touched. Safe to run more than once.

create or replace function public.my_coach_app() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client uuid;
  v_name text;
begin
  if app.current_uid() is null or not app.is_coach() then
    return null;
  end if;
  begin
    v_client := (auth.jwt() ->> 'client_id')::uuid;
  exception when others then
    return null;
  end;
  select left(btrim(c.client_name), 80) into v_name
  from auth.oauth_clients c
  where c.id = v_client and c.deleted_at is null;
  return v_name;
end $$;

revoke all on function public.my_coach_app() from public, anon, authenticated;
grant execute on function public.my_coach_app() to authenticated, service_role;
