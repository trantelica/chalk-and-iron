-- Chalk and Iron, Phase 2: the scheduled jobs for the real rest alerts and
-- the 30-minute auto-finish (design Sections 1 and 7). Run after ...1100.
-- (The local test database skips this file: it has no scheduler and makes no
-- web calls. The functions the jobs call are tested there.)
--
-- Plain-language summary for Nathan:
--   * Every 5 seconds: any rest about to end is handed to the app's server,
--     which waits out the last moment and sends "Rest over. Time for your
--     next set." on the second. This is the same method the iPhone test page
--     proved 0.0 seconds late on 17 November.
--   * Every minute: a workout with nothing done for 30 minutes is finished,
--     ending at its last logged step.
--   * The iPhone test page's own job keeps running until that page is removed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app.hand_over_due_rest_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  n integer := 0;
begin
  for a in
    update public.rest_alerts set handed_at = now()
    where status = 'scheduled' and handed_at is null
      and fire_at <= now() + interval '6 seconds' and fire_at > now() - interval '2 minutes'
    returning id
  loop
    perform net.http_post(
      url := 'https://chalkandiron.vercel.app/api/rest-due',
      body := jsonb_build_object('id', a.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function app.hand_over_due_rest_alerts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('rest-alerts', 'auto-finish-sessions');
select cron.schedule('rest-alerts', '5 seconds', $$select app.hand_over_due_rest_alerts()$$);
select cron.schedule('auto-finish-sessions', '* * * * *', $$select app.auto_finish_idle_sessions()$$);
