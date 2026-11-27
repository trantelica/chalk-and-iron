-- Chalk and Iron, Phase 4, stage 4D (26 November 2026): cards for today end
-- at the 3:00 am rollover. Every five minutes, a card past its end is marked
-- expired, so the coach reads "expired" soon after the day ends (design
-- Section 5, Proposal). Accept checks the end itself as well, to the second.
--
-- Plain-language summary for Nate: one scheduled job, nothing else. Safe to
-- run more than once.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-today-cards';
select cron.schedule('expire-today-cards', '*/5 * * * *', $$select app.expire_due_proposals()$$);
