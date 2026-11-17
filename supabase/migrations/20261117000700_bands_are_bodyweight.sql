-- Chalk and Iron, Phase 1: band exercises are bodyweight exercises.
-- Decided by Nathan on 17 November 2026: band resistance is not standardized
-- or labeled, so a band set is logged as 1 BW and a rep count, like a push-up
-- (spec Section 3, design Section 10E point 9).
--
-- Plain-language summary for Nathan:
--   * New accounts already get this from the data file. This brings accounts
--     made before then up to date: every exercise whose equipment is "band"
--     becomes a bodyweight exercise.
--   * An exercise that already has a logged set is left alone and listed at
--     the end, so no history changes meaning. Phase 1 has no logging screen,
--     so none should be listed.
--   * Bodyweight exercises have no lb/kg switch, so any remembered switch for
--     these exercises is removed.
--   * Nothing else changes. It is safe to run more than once. It ends by
--     showing what it did for each account.

begin;

create temp table bands_report (account text, switched integer, left_alone integer) on commit drop;

with band_exercises as (
  select e.id, e.user_id,
         exists (select 1 from public.session_exercises se
                 join public.set_logs s on s.session_exercise_id = se.id
                 where se.exercise_id = e.id) as has_sets
  from public.exercises e
  join public.vocabulary_terms q on q.id = e.equipment_id and q.kind = 'equipment' and lower(q.name) = 'band'
  where e.default_unit <> 'bw'
), switched as (
  update public.exercises e set default_unit = 'bw'
  from band_exercises b
  where e.id = b.id and not b.has_sets
  returning e.id, e.user_id
), cleared as (
  delete from public.exercise_display_units d
  using switched s
  where d.exercise_id = s.id and d.user_id = s.user_id
  returning 1
)
insert into bands_report (account, switched, left_alone)
select p.email,
       (select count(*) from switched s where s.user_id = p.id),
       (select count(*) from band_exercises b where b.user_id = p.id and b.has_sets)
from public.profiles p
order by p.created_at;

select * from bands_report;

commit;
