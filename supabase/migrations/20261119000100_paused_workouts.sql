-- A paused workout (Nathan, 19 Nov 2026). In the account, a paused workout is
-- an active session whose workout clock is stopped (clock_running_since is
-- empty); the phone stops it on Pause and starts it again on Resume. A
-- running workout still finishes itself after 30 minutes with nothing done.
-- A paused one waits 2 hours, counted from the pause. Either way it ends at
-- its last step, as before (app.cut_back_and_finish is unchanged).
-- Safe to run more than once.

create or replace function app.auto_finish_idle_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.sessions
    where status = 'active'
      and (
        (clock_running_since is not null and last_activity_at < now() - interval '30 minutes')
        or (clock_running_since is null and last_activity_at < now() - interval '2 hours')
      )
  loop
    if app.cut_back_and_finish(r.id, 'auto') then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function app.auto_finish_idle_sessions() from public, anon, authenticated;
grant execute on function app.auto_finish_idle_sessions() to service_role;
