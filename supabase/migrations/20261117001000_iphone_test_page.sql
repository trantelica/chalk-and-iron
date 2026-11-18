-- Chalk and Iron, start of Phase 2: THROWAWAY tables for the iPhone test page
-- (/app/lab). Approved by Nathan on 17 November 2026 (design Section 10E,
-- point 10). They confirm three facts on a real iPhone before the timers and
-- alerts are built on them: notifications reach the home-screen app, a rest
-- alert sent by the server arrives on time while the app is in the
-- background, and the screen can be kept awake. A later migration removes
-- all of this once the real rest alerts exist.
--
-- Plain-language summary for Nathan:
--   * Two small tables: the phone's notification address, and the rest
--     alerts the test page asks for. Only the app's server reads or writes
--     them; a page or a coach cannot.
--   * Supabase's scheduler looks every 5 seconds for an alert about to come
--     due and hands it to the app's server, which waits out the last moment
--     and sends the notification on the second (design Section 7).
--   * It turns on pg_net, Supabase's built-in way for the database to call
--     a web address. Nothing else changes.

create extension if not exists pg_net;

create table if not exists public.lab_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  subscription jsonb not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lab_rest_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  handed_at timestamptz,
  sent_at timestamptz,
  result text
);

-- Server only: row-level security on, no rules, no access for pages or coaches.
alter table public.lab_push_subscriptions enable row level security;
alter table public.lab_rest_alerts enable row level security;
revoke all on public.lab_push_subscriptions, public.lab_rest_alerts from anon, authenticated;

-- Every 5 seconds: hand each alert due within the next 6 seconds to the app.
create or replace function app.lab_hand_over_due_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  n integer := 0;
begin
  for a in
    update public.lab_rest_alerts set handed_at = now()
    where handed_at is null and due_at <= now() + interval '6 seconds' and due_at > now() - interval '5 minutes'
    returning id
  loop
    perform net.http_post(
      url := 'https://chalkandiron.vercel.app/api/lab/rest-due',
      body := jsonb_build_object('id', a.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function app.lab_hand_over_due_alerts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lab-rest-alerts';
select cron.schedule('lab-rest-alerts', '5 seconds', $$select app.lab_hand_over_due_alerts()$$);
