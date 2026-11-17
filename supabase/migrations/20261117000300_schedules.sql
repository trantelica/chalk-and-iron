-- Chalk and Iron, Phase 1: scheduled jobs, run by Supabase's built-in
-- scheduler (pg_cron). Design Section 1, "Scheduled work".
-- Phase 1 has one job: the daily clean-up of accounts whose 14-day grace
-- period has passed. Rest alerts, auto-finish and proposal expiry arrive with
-- the features that need them.
-- (The local test database skips this file: it has no scheduler.)
create extension if not exists pg_cron;

select cron.schedule(
  'purge-deleted-accounts',
  '17 10 * * *', -- daily at 10:17 universal time, about 3 am in Denver
  $$select app.purge_deleted_accounts()$$
);
