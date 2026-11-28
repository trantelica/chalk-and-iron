-- Chalk and Iron, Phase 4, coach guides (28 November 2026).
--
-- Plain-language summary for Nate: the call log (which coach app called which
-- tool, and when) gains one small column, the guide's topic, filled only when
-- a coach reads a guide with get_guide (for example "campaign_design"). It is
-- never anything the user wrote. It lets the next coach eval see which guide
-- a coach read first, and lets the optional check, switched off for now,
-- refuse a campaign or workout card whose guide was not read. Nothing you
-- already have is changed or deleted. Safe to run more than once.

alter table public.connector_calls add column if not exists topic text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'connector_calls_topic_shape') then
    alter table public.connector_calls add constraint connector_calls_topic_shape
      check (topic is null or topic ~ '^[a-z][a-z_]{0,59}$');
  end if;
end $$;

-- The same guarded step as stage 4A, with an optional topic. The old
-- three-input version is removed so there is only one; every call the live
-- app makes today (three inputs, by name) still matches this one.
drop function if exists public.record_connector_call(text, text, boolean);

create or replace function public.record_connector_call(p_client_name text, p_tool text, p_ok boolean, p_topic text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_uid();
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if not app.is_coach() then
    raise exception 'Only a connected coach''s calls are logged.' using errcode = '42501';
  end if;
  if p_tool is null or p_tool !~ '^[a-z][a-z_]{0,59}$' or p_ok is null
     or char_length(coalesce(p_client_name, '')) > 80
     or (p_topic is not null and (p_tool <> 'get_guide' or p_topic !~ '^[a-z][a-z_]{0,59}$')) then
    raise exception 'A call is logged as a tool name, a client name of up to 80 characters, whether it worked, and for get_guide the guide''s topic.'
      using errcode = '22023';
  end if;
  insert into public.connector_calls (user_id, client_name, tool, ok, topic)
  values (me, coalesce(btrim(p_client_name), ''), p_tool, p_ok, p_topic);
  delete from public.connector_calls where user_id = me and called_at < now() - interval '30 days';
end $$;

revoke execute on function public.record_connector_call(text, text, boolean, text) from public, anon;
grant execute on function public.record_connector_call(text, text, boolean, text) to authenticated, service_role;
