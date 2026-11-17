-- Chalk and Iron, start of Phase 2: assisted machines and load counts.
-- Decided by Nathan on 17 November 2026 (spec Section 3, design Section 10E
-- point 9). Written on Opus 5.5 at high effort, as docs/MODEL_AND_EFFORT.md
-- asks for a change to the data model.
--
-- Plain-language summary for Nathan:
--   * Every exercise gets two new details.
--     - "Assisted": yes for an assisted machine, where the number logged is
--       the machine's help, so less is better. The assisted dip and the
--       assisted pull-up are the two in the starter library.
--     - "Load count": how many times the logged weight is moved in one rep.
--       1 for most exercises, 2 for a pair of dumbbells or a lift logged per
--       side, 4 for a pair of dumbbells logged per side. It is used only to
--       work out volume (total weight moved). The weight you log, records,
--       last time and the graph all use the number you typed.
--   * New accounts get both from the data file. This brings accounts made
--     before then up to date, by exercise name, from the list below. That
--     list is the same as the data file; an automated test checks it.
--   * An exercise you have renamed, or made yourself, keeps the plain
--     defaults (load count 1, not assisted). It can be changed in the planner
--     once the planner exists (Phase 3).
--   * Like any edit, setting a detail raises that exercise's version number.
--   * Nothing is deleted. It is safe to run more than once. It ends by
--     showing how many exercises it set for each account.

begin;

alter table public.exercises
  add column if not exists load_count smallint not null default 1,
  add column if not exists assisted boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_load_count_check') then
    alter table public.exercises add constraint exercises_load_count_check check (load_count in (1, 2, 4));
  end if;
  -- An assisted machine logs a number of pounds or kilograms of help, so it
  -- cannot be a bodyweight exercise.
  if not exists (select 1 from pg_constraint where conname = 'exercises_assisted_is_weighted') then
    alter table public.exercises add constraint exercises_assisted_is_weighted check (not assisted or default_unit <> 'bw');
  end if;
end $$;

-- New accounts: the starter library's two new details are copied in.
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
                                  work_seconds, rest_seconds, note, load_count, assisted, created_via)
    select p_user, ex ->> 'name', g.id, fo.id, e.id, ex ->> 'default_unit',
           (ex ->> 'work_seconds')::integer, (ex ->> 'rest_seconds')::integer, coalesce(ex ->> 'note', ''),
           coalesce((ex ->> 'load_count')::integer, 1), coalesce((ex ->> 'assisted')::boolean, false), 'starter'
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

-- Accounts made before this: set the two details by exercise name.
create temp table load_counts (name text primary key, load_count smallint, assisted boolean) on commit drop;
insert into load_counts (name, load_count, assisted) values
  ('Dumbbell Bench Press', 2, false),
  ('Dumbbell Incline Press', 2, false),
  ('Cable Standing Fly', 2, false),
  ('Dumbbell One-Arm Row', 2, false),
  ('Dumbbell Shoulder Press', 2, false),
  ('Dumbbell Lateral Raise', 2, false),
  ('Dumbbell Incline Curl', 2, false),
  ('Dumbbell Hammer Curl', 2, false),
  ('Dumbbell Skull Crusher', 2, false),
  ('Dumbbell Wrist Curl', 2, false),
  ('Cable Pallof Press', 2, false),
  ('Cable Woodchop', 2, false),
  ('Dumbbell Bulgarian Split Squat', 4, false),
  ('Dumbbell Fly', 2, false),
  ('Dumbbell Incline Fly', 2, false),
  ('Cable Ascending Fly', 2, false),
  ('Dumbbell Decline Press', 2, false),
  ('Cable Descending Fly', 2, false),
  ('Selectorized Machine Assisted Dip', 1, true),
  ('Selectorized Machine Assisted Pull-Up', 1, true),
  ('Dumbbell Chest-Supported Row', 2, false),
  ('Cable One-Arm Row', 2, false),
  ('Plate-Loaded Machine One-Arm Row', 2, false),
  ('Dumbbell Shrug', 2, false),
  ('Dumbbell Seated Shoulder Press', 2, false),
  ('Bodyweight Side-Lying Lateral Raise', 2, false),
  ('Dumbbell Upright Row', 2, false),
  ('Cable Lateral Raise', 2, false),
  ('Dumbbell Bent-Over Reverse Fly', 2, false),
  ('Dumbbell Lying Reverse Lateral Raise', 2, false),
  ('Cable Rear Delt Fly', 2, false),
  ('Dumbbell Alternating Curl', 2, false),
  ('Dumbbell Preacher Curl', 2, false),
  ('Cable Bayesian Curl', 2, false),
  ('Dumbbell Triceps Kickback', 2, false),
  ('Cable Triceps Kickback', 2, false),
  ('Dumbbell Close-Grip Press', 2, false),
  ('Bodyweight Self-Resisted Wrist Curl', 2, false),
  ('Bodyweight Self-Resisted Wrist Extension', 2, false),
  ('Dumbbell Reverse Curl', 2, false),
  ('Dumbbell Wrist Extension', 2, false),
  ('Bodyweight Bird Dog', 2, false),
  ('Band Pallof Press', 2, false),
  ('Cable Half-Kneeling Pallof Press', 2, false),
  ('Bodyweight Side Plank Hip Lift', 2, false),
  ('Dumbbell Side Bend', 2, false),
  ('Band Woodchop', 2, false),
  ('Selectorized Machine Rotary Torso', 2, false),
  ('Bodyweight Single-Leg Glute Bridge', 2, false),
  ('Bodyweight Clamshell', 2, false),
  ('Bodyweight Side-Lying Leg Raise', 2, false),
  ('Band Clamshell', 2, false),
  ('Cable Standing Hip Abduction', 2, false),
  ('Bodyweight Split Squat', 2, false),
  ('Bodyweight Reverse Lunge', 2, false),
  ('Bodyweight Step-Up', 2, false),
  ('Dumbbell Forward Lunge', 4, false),
  ('Dumbbell Reverse Lunge', 4, false),
  ('Dumbbell Walking Lunge', 4, false),
  ('Dumbbell Step-Up', 4, false),
  ('Smith Machine Split Squat', 2, false),
  ('Smith Machine Bulgarian Split Squat', 2, false),
  ('Plate-Loaded Machine Bulgarian Split Squat', 2, false),
  ('Cable Leg Extension', 2, false),
  ('Bodyweight Single-Leg Romanian Deadlift', 2, false),
  ('Dumbbell Romanian Deadlift', 2, false),
  ('Dumbbell Single-Leg Romanian Deadlift', 2, false),
  ('Cable Standing Leg Curl', 2, false),
  ('Bodyweight Single-Leg Calf Raise', 2, false),
  ('Dumbbell Standing Calf Raise', 2, false),
  ('Bodyweight Single-Leg Bent-Knee Calf Raise', 2, false),
  ('Dumbbell Seated Calf Raise', 2, false),
  ('Bodyweight Side-Lying Adduction', 2, false),
  ('Bodyweight Short-Lever Copenhagen Hip Lift', 2, false),
  ('Dumbbell Lateral Lunge', 2, false),
  ('Band Hip Adduction', 2, false),
  ('Cable Standing Hip Adduction', 2, false),
  ('Band Standing Hip Abduction', 2, false),
  ('Plate-Loaded Machine Standing Leg Curl', 2, false),
  ('Selectorized Machine Standing Leg Curl', 2, false),
  ('Dumbbell Zottman Curl', 2, false),
  ('Cable Seated Shoulder Press', 2, false),
  ('Cable Seated Chest Press', 2, false);

create temp table load_count_report (account text, exercises_set integer) on commit drop;

with changed as (
  update public.exercises x
  set load_count = l.load_count, assisted = l.assisted
  from load_counts l
  where lower(x.name) = lower(l.name)
    and x.created_via = 'starter'
    and (x.load_count, x.assisted) is distinct from (l.load_count, l.assisted)
  returning x.user_id
)
insert into load_count_report (account, exercises_set)
select p.email, (select count(*) from changed c where c.user_id = p.id)
from public.profiles p
order by p.created_at;

select * from load_count_report;

commit;
