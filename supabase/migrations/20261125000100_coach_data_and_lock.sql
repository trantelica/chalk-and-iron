-- Chalk and Iron, Phase 4, stage 4A: the coach's data and the lock (25 November 2026).
-- Follows docs/SPEC.md Section 4 ("Coach intake", "Proposals in the app") and
-- docs/TECHNICAL_DESIGN.md Section 2 (coach_profiles, proposals,
-- weekly_checkins), Section 3 ("What the connector may not do"), Section 9
-- ("Coach behaviour evals") and Section 11 (stage 4A).
--
-- Plain-language summary for Nate:
--   * The coach profile gains the coach intake: coach style, experience, up to
--     three ranked priorities, pace, workout length, days per week, variety,
--     exercises liked and to avoid, and "how to coach me". Every answer may be
--     left empty; an answer outside its list is refused by the database.
--   * A declined coach card can hold an optional one-line reason, up to 300
--     characters. (Stage 4D builds the Decline that fills it in.)
--   * A new list of weekly check-ins: one mark per week, added the first time a
--     coach reads that week's summary. Only a connected coach can add one, only
--     for its own person, and never for a week that has not started.
--   * The lock: a coach's pass can read, add a pending proposal with its
--     targets, record a check-in, and note a call in the short call log. The
--     database refuses everything else, through every door. Nobody signed out
--     can call anything at all.
--   * The coach eval account: one account can be marked as the eval account.
--     Only the app's server can reset it to a fixed starting state, and the
--     reset refuses to touch any account that is not marked.
--   * No table is removed and no existing data is changed. Safe to run more
--     than once.

-- ---------------------------------------------------------------------------
-- 1. The coach intake, on the coach profile (spec Section 4, "Coach intake")
-- ---------------------------------------------------------------------------

-- Up to three priorities, in rank order. Each is {"value": "strength"} or, for
-- a written-in one, {"value": "other", "text": "Rock climbing"} (up to 100
-- characters). No value twice, except 'other' (with different wording).
create or replace function app.valid_priorities(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 3 then false else
    not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 'value') is distinct from 'string'
         or (e ->> 'value') not in ('strength', 'muscle', 'fat_loss', 'general_fitness', 'endurance',
                                    'mobility', 'sport', 'habit', 'other')
         or case when e ->> 'value' = 'other'
                 then (select array_agg(k order by k) from jsonb_object_keys(e) k) is distinct from array['text', 'value']
                      or jsonb_typeof(e -> 'text') is distinct from 'string'
                      or char_length(btrim(e ->> 'text')) not between 1 and 100
                 else (select array_agg(k) from jsonb_object_keys(e) k) is distinct from array['value']
            end)
    and (select count(*) from jsonb_array_elements(p))
        = (select count(distinct case when e ->> 'value' = 'other' then 'other:' || lower(btrim(e ->> 'text'))
                                      else e ->> 'value' end)
           from jsonb_array_elements(p) e)
  end
$$;

alter table public.coach_profiles
  add column if not exists coach_style text,
  add column if not exists experience text,
  add column if not exists priorities jsonb not null default '[]',
  add column if not exists progression_pace text,
  add column if not exists workout_minutes integer,
  add column if not exists days_per_week integer,
  add column if not exists variety text,
  add column if not exists exercises_liked text not null default '',
  add column if not exists exercises_to_avoid text not null default '',
  add column if not exists how_to_coach_me text not null default '';

alter table public.coach_profiles
  drop constraint if exists coach_profiles_coach_style_check,
  drop constraint if exists coach_profiles_experience_check,
  drop constraint if exists coach_profiles_priorities_check,
  drop constraint if exists coach_profiles_progression_pace_check,
  drop constraint if exists coach_profiles_workout_minutes_check,
  drop constraint if exists coach_profiles_days_per_week_check,
  drop constraint if exists coach_profiles_variety_check,
  drop constraint if exists coach_profiles_free_text_length_check;
alter table public.coach_profiles
  add constraint coach_profiles_coach_style_check
    check (coach_style in ('supportive', 'challenging', 'neutral')),
  add constraint coach_profiles_experience_check
    check (experience in ('new', 'returning', 'intermediate', 'experienced', 'all_in')),
  add constraint coach_profiles_priorities_check check (app.valid_priorities(priorities)),
  add constraint coach_profiles_progression_pace_check
    check (progression_pace in ('steady', 'moderate', 'aggressive')),
  add constraint coach_profiles_workout_minutes_check check (workout_minutes between 10 and 240),
  add constraint coach_profiles_days_per_week_check check (days_per_week between 1 and 7),
  add constraint coach_profiles_variety_check check (variety in ('familiar', 'some', 'lots')),
  add constraint coach_profiles_free_text_length_check
    check (char_length(exercises_liked) <= 2000 and char_length(exercises_to_avoid) <= 2000
           and char_length(how_to_coach_me) <= 2000);

-- A fix found while testing the intake: since Phase 1, any edit to a coach
-- profile failed, because the rule that marks cards out of date after an edit
-- looked for an 'id' the coach profile does not have (its key is user_id).
-- Nothing edited a coach profile until now, so it never showed. The same rule,
-- written so each table's key is read only for that table.
create or replace function app.after_versioned_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'coach_profiles' then
    perform app.mark_proposals_out_of_date(tg_table_name::text, new.user_id);
  else
    perform app.mark_proposals_out_of_date(tg_table_name::text, (to_jsonb(new) ->> 'id')::uuid);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The decline reason (spec Section 4, "Proposals in the app")
-- ---------------------------------------------------------------------------

-- One line, 1 to 300 characters, only on a declined card from a coach (the
-- planner's own cards are dismissed without one). A coach cannot write it:
-- the coach may only fill the columns named in its insert grant (foundation
-- migration), and this is not one of them.
alter table public.proposals add column if not exists decline_reason text;
alter table public.proposals drop constraint if exists proposals_decline_reason_check;
alter table public.proposals add constraint proposals_decline_reason_check
  check (decline_reason is null
         or (status = 'rejected' and source <> 'planner'
             and char_length(btrim(decline_reason)) between 1 and 300
             and char_length(decline_reason) <= 300
             and decline_reason !~ '[\r\n]'));

-- ---------------------------------------------------------------------------
-- 3. Weekly check-ins (design Section 2, weekly_checkins)
-- ---------------------------------------------------------------------------

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  first_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_checkins_by_user on public.weekly_checkins (user_id, week_start desc);

revoke all on public.weekly_checkins from public, anon, authenticated;
alter table public.weekly_checkins enable row level security;
drop policy if exists own_rows_read on public.weekly_checkins;
create policy own_rows_read on public.weekly_checkins for select to authenticated
  using (user_id = (select app.current_uid()));
-- Read only. A mark is added through record_weekly_checkin below, never directly.
grant select on public.weekly_checkins to authenticated;
grant all on public.weekly_checkins to service_role;

-- The training day now for a person: the day rolls over at 3:00 am in their
-- own time zone (spec Section 10, "Days and campaigns").
create or replace function app.training_day_now(p_user uuid) returns date
language sql stable security definer set search_path = '' as $$
  select ((now() at time zone coalesce(p.time_zone, 'America/Denver')) - interval '3 hours')::date
  from public.profiles p where p.id = p_user
$$;

-- Called by the connector when a coach reads a week's summary
-- (get_weekly_summary, stage 4C). p_week_of is any date in that week. The
-- first read adds the mark; any later read of the same week changes nothing.
-- Returns the week's Monday and whether this read added the mark.
create or replace function public.record_weekly_checkin(p_week_of date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_uid();
  v_week date;
  added integer;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if not app.is_coach() then
    raise exception 'A check-in is recorded only when a connected coach reads the weekly summary.'
      using errcode = '42501';
  end if;
  if p_week_of is null then
    raise exception 'Say which week.' using errcode = '22023';
  end if;
  v_week := p_week_of - (extract(isodow from p_week_of)::integer - 1);
  if v_week > app.training_day_now(me) then
    raise exception 'That week has not started yet.' using errcode = '22023';
  end if;
  insert into public.weekly_checkins (user_id, week_start) values (me, v_week)
  on conflict (user_id, week_start) do nothing;
  get diagnostics added = row_count;
  return jsonb_build_object('week_start', v_week, 'added', added = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 4. The call log, through one guarded step (design Section 2, connector_calls)
-- ---------------------------------------------------------------------------

-- Until now a coach could add rows to the call log directly, choosing any time
-- and any text. Now it goes through one step that only appends a row for the
-- signed-in person, stamped with the time now, and keeps the log short: rows
-- older than 30 days are cleared as new ones arrive. No content is stored.
drop policy if exists add_own_call on public.connector_calls;
revoke insert, update, delete on public.connector_calls from authenticated;

create or replace function public.record_connector_call(p_client_name text, p_tool text, p_ok boolean)
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
     or char_length(coalesce(p_client_name, '')) > 80 then
    raise exception 'A call is logged as a tool name, a client name of up to 80 characters, and whether it worked.'
      using errcode = '22023';
  end if;
  insert into public.connector_calls (user_id, client_name, tool, ok)
  values (me, coalesce(btrim(p_client_name), ''), p_tool, p_ok);
  delete from public.connector_calls where user_id = me and called_at < now() - interval '30 days';
end $$;

-- ---------------------------------------------------------------------------
-- 5. The lock, tightened (design Section 3, "What the connector may not do")
-- ---------------------------------------------------------------------------

-- The step that marks cards out of date runs inside the database's own rules
-- when a person edits a record. A coach's pass cannot edit anything, so it
-- never needs it; called directly with a coach's pass, it now does nothing.
create or replace function app.mark_proposals_out_of_date(p_kind text, p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.proposals p set status = 'out_of_date'
  where p.status = 'pending'
    and not app.is_coach()
    and p.user_id = coalesce(auth.uid(), p.user_id)
    and p.id in (select t.proposal_id from public.proposal_targets t
                 where t.record_kind = p_kind and t.record_id = p_id)
$$;

-- Every function in the API's schema is closed to everyone, then opened to
-- signed-in people one by one. Supabase opens new functions to everyone by
-- default; this takes away what earlier files did not take away by name.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  -- The admin page (each refuses anyone who is not an admin on the app's own sign-in).
  public.admin_list_accounts(), public.admin_list_links(), public.admin_create_invite(text),
  public.admin_cancel_link(uuid), public.admin_set_active(uuid, boolean),
  public.admin_set_admin(uuid, boolean), public.admin_request_delete(uuid), public.admin_undo_delete(uuid),
  -- A person's own account (each refuses a coach's pass).
  public.request_my_account_deletion(), public.cancel_my_account_deletion(), public.dismiss_reset_notice(),
  -- Saving, the planner and the inbox (each refuses a coach's pass).
  public.apply_changes(jsonb), public.save_workout(uuid, jsonb, uuid[], jsonb),
  public.decide_planner_proposal(uuid, boolean),
  -- Read only.
  public.exercise_memory(uuid),
  -- The coach's two guarded steps (each refuses anything but a coach's pass).
  public.record_weekly_checkin(date), public.record_connector_call(text, text, boolean)
  to authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function app.valid_priorities(jsonb) to authenticated, service_role;
grant execute on function app.training_day_now(uuid) to service_role;

-- From now on, a function or table added to the API's schema is closed to
-- signed-in and signed-out people until a later file opens it by name. (On
-- Supabase the files run as the database owner, 'postgres'.)
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The coach eval account (design Section 9, "Coach behaviour evals")
-- ---------------------------------------------------------------------------

-- At most one account is the eval account. It is marked once, by hand, in the
-- SQL Editor (docs/SETUP.md). Nobody can mark it from the app.
alter table public.profiles add column if not exists is_eval_account boolean not null default false;
create unique index if not exists profiles_one_eval_account on public.profiles (is_eval_account) where is_eval_account;

-- Resets the eval account to one fixed starting state, in one step: all or
-- nothing. Only the app's server can call it (scripts/coach-eval-reset.mjs),
-- and it works only on the account marked as the eval account, so no mistake
-- in the script can reach anyone else's data.
--
-- It clears the account's training data (library, history, plans, cards,
-- check-ins, gyms and coach profile), seeds the starter library again from
-- p_starter (data/starter-library.json), then adds the state's rows. Kept:
-- the account itself, its sign-in, its devices, its coach connections and the
-- call log.
--
-- p_state (built by tests/coach-evals/states.mjs):
--   { "name": "standard",
--     "profile": { "time_zone": "America/Denver", "totals_unit": "lb" },
--     "coach_profile": { "goals": "...", "coach_style": "neutral", ... },
--     "rows": [ { "table": "gyms", "rows": [ {...}, ... ] }, ... ] }
-- A row names an exercise by its library name under "exercise"; it is turned
-- into the exercise's id here. Every row is given the eval account's user_id.
create or replace function public.load_coach_eval_state(p_starter jsonb, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  n integer;
  batch jsonb;
  t text;
  r jsonb;
  cols text;
  v_ex uuid;
  counts jsonb := '{}';
  allowed text[] := array['gyms', 'workouts', 'workout_items', 'campaigns', 'campaign_days',
                          'campaign_day_overrides', 'campaign_shifts', 'today_plans', 'sessions',
                          'session_blocks', 'session_exercises', 'set_logs', 'cardio_logs',
                          'proposals', 'proposal_targets', 'weekly_checkins'];
begin
  select count(*) into n from public.profiles where is_eval_account;
  if n <> 1 then
    raise exception 'No account is marked as the coach eval account (docs/SETUP.md).' using errcode = '42501';
  end if;
  select id into me from public.profiles where is_eval_account;

  -- Clear, in an order the links between records allow.
  delete from public.proposals where user_id = me;
  delete from public.weekly_checkins where user_id = me;
  delete from public.today_plans where user_id = me;
  delete from public.rest_alerts where user_id = me;
  delete from public.sessions where user_id = me;
  delete from public.cardio_logs where user_id = me;
  delete from public.campaigns where user_id = me;
  delete from public.workouts where user_id = me;
  delete from public.exercise_alternates where user_id = me;
  delete from public.exercise_display_units where user_id = me;
  delete from public.exercises where user_id = me;
  delete from public.vocabulary_terms where user_id = me and kind = 'focus';
  delete from public.vocabulary_terms where user_id = me;
  delete from public.gyms where user_id = me;
  delete from public.coach_profiles where user_id = me;

  insert into public.coach_profiles (user_id) values (me);
  perform app.seed_account(me, p_starter);

  if p_state ? 'profile' then
    update public.profiles set
      time_zone = coalesce(p_state -> 'profile' ->> 'time_zone', time_zone),
      totals_unit = coalesce(p_state -> 'profile' ->> 'totals_unit', totals_unit)
    where id = me;
  end if;

  if jsonb_typeof(p_state -> 'coach_profile') = 'object' then
    update public.coach_profiles c set
      (goals, injuries_and_limits, weekly_schedule, notes, coach_style, experience, priorities,
       progression_pace, workout_minutes, days_per_week, variety, exercises_liked, exercises_to_avoid,
       how_to_coach_me) =
      (select x.goals, x.injuries_and_limits, x.weekly_schedule, x.notes, x.coach_style, x.experience,
              x.priorities, x.progression_pace, x.workout_minutes, x.days_per_week, x.variety,
              x.exercises_liked, x.exercises_to_avoid, x.how_to_coach_me
       from jsonb_populate_record(c, p_state -> 'coach_profile') x)
    where c.user_id = me;
  end if;

  for batch in select * from jsonb_array_elements(coalesce(p_state -> 'rows', '[]')) loop
    t := batch ->> 'table';
    if t is null or not (t = any (allowed)) then
      raise exception 'The eval state names a table it may not fill: %', coalesce(t, '(none)') using errcode = '22023';
    end if;
    for r in select * from jsonb_array_elements(batch -> 'rows') loop
      if r ? 'exercise' then
        select e.id into v_ex from public.exercises e
        where e.user_id = me and e.archived_at is null and lower(e.name) = lower(r ->> 'exercise');
        if not found then
          raise exception 'The eval state names an exercise the starter library does not have: %', r ->> 'exercise'
            using errcode = '22023';
        end if;
        r := (r - 'exercise') || jsonb_build_object('exercise_id', v_ex);
      end if;
      r := r || jsonb_build_object('user_id', me);
      select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(r) k;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                     t, cols, cols, t) using r;
    end loop;
    counts := counts || jsonb_build_object(t, coalesce((counts ->> t)::integer, 0) + jsonb_array_length(batch -> 'rows'));
  end loop;

  -- Records (heaviest, 6+, 10+, 20+, most reps) as the app works them out.
  for v_ex in select distinct se.exercise_id from public.session_exercises se where se.user_id = me loop
    perform app.recalc_records(v_ex);
  end loop;

  return jsonb_build_object('state', p_state ->> 'name', 'user_id', me, 'rows', counts);
end $$;

revoke all on function public.load_coach_eval_state(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.load_coach_eval_state(jsonb, jsonb) to service_role;
