-- Chalk and Iron, Phase 4, stage 4D: Accept and Decline (26 November 2026).
-- Follows docs/SPEC.md Section 4 ("Proposals in the app") and Section 10
-- ("Proposals", "Supersets"), and docs/TECHNICAL_DESIGN.md Section 3
-- ("What each proposal carries") and Section 5 (Proposal, Session).
--
-- Plain-language summary for Nate:
--   * One guarded step decides every card from a coach: Accept or Decline.
--     Only you can call it, with the app's own sign-in; a coach cannot.
--   * Accept applies the whole card or none of it, after checking that
--     nothing it would change was edited since it was made (if it was, the
--     card is marked out of date and nothing is applied).
--       - An exercise card adds the exercise to the library, or edits it.
--       - A workout card adds or edits the workout, with any new exercises it
--         brings, all at once.
--       - A campaign card arrives as a draft (you activate it), or edits a
--         campaign's days and overrides, or shifts it forward a week; it can
--         bring new exercises and new workouts too.
--       - A profile card changes your coach profile, or adds or edits a gym.
--       - A change to today changes only today: the workout you are doing,
--         inside it, without starting a new one, or today's plan if you have
--         not started yet. It never changes the library or the campaign, and
--         never a set you have already logged.
--   * Decline changes nothing but the card. It can carry an optional one-line
--     reason, up to 300 characters, which the coach can read.
--   * A change to today expires at the 3:00 am rollover that ends its day.
--   * A phone that was offline when a change to its workout was accepted
--     cannot overwrite it: it is told, and applies the change to its own copy.
--   * A day sent from your planner is decided as before.
--   * No table is removed and no data is deleted. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. A running workout counts the accepted changes to its plan
-- ---------------------------------------------------------------------------

alter table public.sessions add column if not exists plan_revision integer not null default 0;
alter table public.sessions drop constraint if exists sessions_plan_revision_check;
alter table public.sessions add constraint sessions_plan_revision_check check (plan_revision >= 0);

-- ---------------------------------------------------------------------------
-- 2. A change to today expires at the 3:00 am rollover that ends its day
-- ---------------------------------------------------------------------------

-- The next 3:00 am in the person's own time zone (spec Section 10, "Days and campaigns").
create or replace function app.next_rollover(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select ((app.training_day_now(p_user) + 1)::timestamp + interval '3 hours') at time zone coalesce(p.time_zone, 'America/Denver')
  from public.profiles p where p.id = p_user
$$;

-- Every card for today ends at that rollover, whoever adds it: a coach cannot
-- give one a later end. An earlier one is kept.
create or replace function app.today_card_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r timestamptz;
begin
  if new.kind = 'today_change' then
    r := app.next_rollover(new.user_id);
    new.expires_at := least(coalesce(new.expires_at, r), r);
  end if;
  return new;
end $$;

drop trigger if exists today_card_expiry on public.proposals;
create trigger today_card_expiry before insert on public.proposals
  for each row execute function app.today_card_expiry();

-- Marks cards past their end as expired, so the coach reads "expired" as soon
-- as the day ends (run every few minutes; ...20261126000200_expiry_schedules.sql).
create or replace function app.expire_due_proposals() returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.proposals set status = 'expired'
    where status = 'pending' and expires_at is not null and expires_at <= now()
    returning 1)
  select count(*)::integer from done
$$;

-- ---------------------------------------------------------------------------
-- 3. Saving a workout from the phone: an older copy never overwrites the
--    account's plan
-- ---------------------------------------------------------------------------

-- The same function as in 20261124000200_late_copy_offline_time.sql, with two
-- changes (26 Nov):
--   * A copy made before an accepted change to today (its plan_revision is
--     older than the account's) changes the workout's header (clocks, finish)
--     and adds blocks and exercises the account has never seen, so sets
--     logged on them are kept, but changes nothing the account already has.
--     It answers 'stale'; the phone replays the change and sends its copy again.
--   * An exercise a current copy no longer has, with nothing ever logged on it,
--     is taken out: an accepted change removed it from today's workout.
create or replace function app.apply_one_change(p_me uuid, p_kind text, d jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  s public.sessions;
  b public.session_blocks;
  x public.session_exercises;
  l public.set_logs;
  other record;
  existing record;
  frozen boolean := false;
  stale boolean := false;
  in_rev integer;
  stop_at timestamptz;
  accepted_at timestamptz;
  block_ids uuid[];
  exercise_ids uuid[];
  touched uuid[] := '{}';
  cur uuid;
  fire timestamptz;
  nm text;
  n integer;
begin
  if p_kind = 'session.put' then
    -- The whole session as the phone has it: header, blocks and the plan
    -- snapshot. Sets travel separately (set.put), so they are never overwritten here.
    s := jsonb_populate_record(null::public.sessions, d -> 'session');
    if s.id is null then
      raise exception 'A session needs an id.';
    end if;
    select status, ended_at, finish_reason, plan_revision into existing from public.sessions where id = s.id;
    -- Changed by the account since this copy was made: an accepted coach's
    -- change to today (stage 4D, 26 Nov). The copy names the revision of the
    -- plan it was made from; an older one never overwrites the account's plan.
    in_rev := coalesce(s.plan_revision, 0);
    stale := coalesce(found and existing.finish_reason is distinct from 'replaced' and in_rev < existing.plan_revision, false);
    -- Replaced by a day sent from the planner: never reopened (20 Nov).
    frozen := coalesce(found and existing.finish_reason = 'replaced', false);
    -- Unless the phone had in fact finished it before the day was accepted, with
    -- no connection, so its "finished" had not arrived yet (review, 23 Nov):
    -- then nothing was running to replace, and the workout is put back as the
    -- phone finished it, with its campaign day.
    if frozen and s.status = 'finished' and s.ended_at is not null then
      select max(p.decided_at) into accepted_at from public.proposals p
      where p.user_id = p_me and p.status = 'accepted' and p.result ->> 'replaced_session_id' = s.id::text;
      if accepted_at is not null and s.ended_at <= accepted_at then
        frozen := false;
        update public.sessions set source_kind = coalesce(s.source_kind, 'ad_hoc'), campaign_day_id = s.campaign_day_id
        where id = s.id and user_id = p_me;
      end if;
    end if;
    if s.status = 'active' and not frozen then
      -- Only one active session per person (decided 17 Nov, question 30).
      select id, workout_name, started_at, last_activity_at into other
      from public.sessions where user_id = p_me and status = 'active' and id <> s.id;
      if found then
        return jsonb_build_object('conflict', jsonb_build_object(
          'code', 'other_active', 'session_id', other.id, 'workout_name', other.workout_name,
          'started_at', other.started_at, 'last_activity_at', other.last_activity_at));
      end if;
    end if;
    if not frozen and existing.status = 'finished' and s.status = 'active' and existing.ended_at < now() - interval '48 hours' then
      raise exception 'A finished workout can be reopened only within 48 hours of finishing.';
    end if;
    if not frozen then
      insert into public.sessions (id, user_id, local_date, source_kind, campaign_day_id, workout_id, workout_name, gym_id,
                                   started_at, ended_at, status, finish_reason, clock_banked_seconds, clock_running_since,
                                   rest_ends_at, rest_total_seconds, last_activity_at, break_undo, plan_revision)
      values (s.id, p_me, s.local_date, coalesce(s.source_kind, 'ad_hoc'), s.campaign_day_id, s.workout_id, s.workout_name, s.gym_id,
              s.started_at, s.ended_at, s.status, s.finish_reason, coalesce(s.clock_banked_seconds, 0), s.clock_running_since,
              s.rest_ends_at, s.rest_total_seconds, coalesce(s.last_activity_at, s.started_at), s.break_undo, in_rev)
      on conflict (id) do update set
        local_date = excluded.local_date, workout_name = excluded.workout_name,
        ended_at = excluded.ended_at, status = excluded.status, finish_reason = excluded.finish_reason,
        clock_banked_seconds = excluded.clock_banked_seconds, clock_running_since = excluded.clock_running_since,
        rest_ends_at = excluded.rest_ends_at, rest_total_seconds = excluded.rest_total_seconds,
        last_activity_at = excluded.last_activity_at,
        -- An older copy's Undo break would undo the account's plan, so it is not taken.
        break_undo = case when stale then public.sessions.break_undo else excluded.break_undo end,
        plan_revision = greatest(public.sessions.plan_revision, excluded.plan_revision);

      -- A workout started from a prepared plan for today uses it up (design
      -- Section 2, today_plans). New on 19 Nov, with the Home screen's Today panel.
      if d ->> 'today_plan_id' is not null then
        update public.today_plans set consumed_at = coalesce(consumed_at, now()) where id = (d ->> 'today_plan_id')::uuid;
        -- The plan came from accepting a card that split a running session (20 Nov).
        update public.sessions ss set split_from_session_id = (p.result ->> 'replaced_session_id')::uuid
        from public.today_plans t join public.proposals p on t.made_by = 'proposal:' || p.id::text
        where t.id = (d ->> 'today_plan_id')::uuid and ss.id = s.id and ss.split_from_session_id is null
          and p.result ->> 'replaced_session_id' is not null;
      end if;
    end if;

    -- Blocks: a broken-out block after the superset it came from. For a
    -- replaced workout too, as the phone has them (a break or a reorder made
    -- before its changes arrived), but with every clock stopped, never below
    -- what the account had banked (24 Nov). A clock still running on the phone
    -- stops at the account's end time, or at the phone's last step if that came
    -- later: work done there with no signal still counts (24 Nov).
    if frozen then
      stop_at := greatest(existing.ended_at, coalesce(s.last_activity_at, existing.ended_at));
    end if;
    block_ids := '{}';
    for b in
      select * from jsonb_populate_recordset(null::public.session_blocks, coalesce(d -> 'blocks', '[]'))
      order by (broken_from_block_id is not null), position
    loop
      block_ids := block_ids || b.id;
      insert into public.session_blocks (id, user_id, session_id, position, superset_letter, time_budget_seconds,
                                         clock_started_at, clock_banked_seconds, clock_running_since, clock_stopped_at,
                                         broken_at, broken_from_block_id, members_at_break, sets_done_at_break, sets_planned_at_break)
      values (b.id, p_me, s.id, b.position, b.superset_letter, coalesce(b.time_budget_seconds, 0),
              b.clock_started_at,
              -- A replaced workout's clocks stop: time the phone's clock was still
              -- running up to the stop is banked (24 Nov).
              case when frozen
                then coalesce(b.clock_banked_seconds, 0)
                     + case when b.clock_running_since is null then 0
                            else greatest(0, extract(epoch from (stop_at - b.clock_running_since))) end
                else coalesce(b.clock_banked_seconds, 0) end,
              case when frozen then null else b.clock_running_since end,
              case when frozen and b.clock_started_at is not null
                then coalesce(b.clock_stopped_at, greatest(stop_at, b.clock_started_at)) else b.clock_stopped_at end,
              b.broken_at, b.broken_from_block_id, b.members_at_break, b.sets_done_at_break, b.sets_planned_at_break)
      on conflict (id) do update set
        position = excluded.position, superset_letter = excluded.superset_letter,
        time_budget_seconds = excluded.time_budget_seconds, clock_started_at = excluded.clock_started_at,
        -- Never less than the account already banked for a replaced workout's block (24 Nov).
        clock_banked_seconds = case when frozen then greatest(public.session_blocks.clock_banked_seconds, excluded.clock_banked_seconds)
                                    else excluded.clock_banked_seconds end,
        clock_running_since = excluded.clock_running_since,
        clock_stopped_at = excluded.clock_stopped_at, broken_at = excluded.broken_at,
        broken_from_block_id = excluded.broken_from_block_id, members_at_break = excluded.members_at_break,
        sets_done_at_break = excluded.sets_done_at_break, sets_planned_at_break = excluded.sets_planned_at_break
      -- An older copy than the account's plan adds only blocks the account has never seen (26 Nov).
      where public.session_blocks.session_id = excluded.session_id and not stale;
    end loop;

    -- The plan snapshot. A swap changes the exercise in place, so its sets'
    -- records move with it and both exercises are worked out again. For a
    -- replaced workout too (review, 23 Nov): a swap made on the phone before
    -- its changes arrived must not leave the sets under the old exercise. Only
    -- an exercise still to do keeps the state the account gave it.
    exercise_ids := '{}';
    for x in select * from jsonb_populate_recordset(null::public.session_exercises, coalesce(d -> 'exercises', '[]')) loop
      exercise_ids := exercise_ids || x.id;
      select exercise_id into existing from public.session_exercises where id = x.id;
      if found and not stale and existing.exercise_id <> x.exercise_id then
        touched := touched || existing.exercise_id || x.exercise_id;
      end if;
      insert into public.session_exercises (id, user_id, session_id, block_id, exercise_id, exercise_name_then, position_in_block,
                                            planned_set_types, planned_reps, planned_weight_lb, planned_weight_entered_value,
                                            planned_weight_entered_unit, seed_weights_lb, planned_rest_seconds, work_seconds,
                                            state, origin, swapped_from_exercise_id, sets_before_break)
      values (x.id, p_me, s.id, x.block_id, x.exercise_id, x.exercise_name_then, coalesce(x.position_in_block, 0),
              x.planned_set_types, x.planned_reps, x.planned_weight_lb, x.planned_weight_entered_value,
              x.planned_weight_entered_unit, x.seed_weights_lb, x.planned_rest_seconds, x.work_seconds,
              case when frozen and coalesce(x.state, 'open') = 'open' then 'replaced' else coalesce(x.state, 'open') end,
              coalesce(x.origin, 'plan'), x.swapped_from_exercise_id, x.sets_before_break)
      on conflict (id) do update set
        block_id = excluded.block_id, exercise_id = excluded.exercise_id, exercise_name_then = excluded.exercise_name_then,
        position_in_block = excluded.position_in_block, planned_set_types = excluded.planned_set_types,
        planned_reps = excluded.planned_reps, planned_weight_lb = excluded.planned_weight_lb,
        planned_weight_entered_value = excluded.planned_weight_entered_value,
        planned_weight_entered_unit = excluded.planned_weight_entered_unit, seed_weights_lb = excluded.seed_weights_lb,
        planned_rest_seconds = excluded.planned_rest_seconds, work_seconds = excluded.work_seconds,
        state = case when frozen and excluded.state = 'replaced' then public.session_exercises.state else excluded.state end,
        origin = excluded.origin, swapped_from_exercise_id = excluded.swapped_from_exercise_id,
        sets_before_break = excluded.sets_before_break
      -- The same for exercises: one the phone added offline is kept, so its sets are not lost (26 Nov).
      where public.session_exercises.session_id = excluded.session_id and not stale;
    end loop;

    if frozen then
      return jsonb_build_object('replaced', s.id, 'exercises', to_jsonb(touched), 'session', s.id);
    end if;

    if stale then
      -- The phone is told, and replays the accepted change on its own copy
      -- (src/rules/today-change.ts), then sends that copy at the new revision.
      return jsonb_build_object('stale', s.id, 'exercises', to_jsonb(touched), 'session', s.id);
    end if;

    -- Exercises the phone no longer has and nothing was ever logged on: taken
    -- out of today's workout by an accepted change (26 Nov).
    delete from public.session_exercises se
    where se.session_id = s.id and se.id <> all (exercise_ids)
      and not exists (select 1 from public.set_logs sl where sl.session_exercise_id = se.id);

    -- Blocks the phone no longer has (an undone break) and nothing points to.
    delete from public.session_blocks sb
    where sb.session_id = s.id and sb.id <> all (block_ids)
      and not exists (select 1 from public.session_exercises se where se.block_id = sb.id)
      and not exists (select 1 from public.session_blocks c where c.broken_from_block_id = sb.id);

    cur := s.current_session_exercise_id;
    if cur is not null and not (cur = any (exercise_ids)) then
      cur := null;
    end if;
    update public.sessions set current_session_exercise_id = cur where id = s.id and current_session_exercise_id is distinct from cur;
    if s.status <> 'active' then
      update public.rest_alerts set status = 'cancelled' where session_id = s.id and status = 'scheduled';
    end if;
    return jsonb_build_object('exercises', to_jsonb(touched), 'session', s.id);

  elsif p_kind = 'set.put' then
    -- One logged set, new or edited. The last change to reach the server wins,
    -- except that a deleted set stays deleted (design Section 6).
    l := jsonb_populate_record(null::public.set_logs, d);
    select deleted_at, session_exercise_id into existing from public.set_logs where id = l.id;
    if found and existing.deleted_at is not null then
      return jsonb_build_object('ignored', 'deleted');
    end if;
    insert into public.set_logs (id, user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit,
                                 reps, set_type, rpe, logged_at, record_types)
    values (l.id, p_me, l.session_exercise_id, l.set_number, l.weight_lb, l.entered_value, l.entered_unit,
            l.reps, coalesce(l.set_type, 'working'), l.rpe, l.logged_at, '{}')
    on conflict (id) do update set
      set_number = excluded.set_number, weight_lb = excluded.weight_lb, entered_value = excluded.entered_value,
      entered_unit = excluded.entered_unit, reps = excluded.reps, set_type = excluded.set_type, rpe = excluded.rpe,
      record_types = case when excluded.set_type = 'warm_up' then '{}' else public.set_logs.record_types end
    where public.set_logs.deleted_at is null and public.set_logs.session_exercise_id = excluded.session_exercise_id;
    -- A late set on an exercise of a replaced workout: it was done after all (20 Nov).
    update public.session_exercises set state = 'done' where id = l.session_exercise_id and state = 'replaced';
    select array_agg(se.exercise_id) into touched from public.session_exercises se where se.id = l.session_exercise_id;
    return jsonb_build_object('exercises', to_jsonb(coalesce(touched, '{}')),
      'session', (select se.session_id from public.session_exercises se where se.id = l.session_exercise_id));

  elsif p_kind = 'set.delete' then
    update public.set_logs set deleted_at = coalesce(deleted_at, (d ->> 'deleted_at')::timestamptz, now()), record_types = '{}'
    where id = (d ->> 'id')::uuid
    returning session_exercise_id into cur;
    if cur is null then
      return jsonb_build_object('ignored', 'unknown set');
    end if;
    select array_agg(se.exercise_id) into touched from public.session_exercises se where se.id = cur;
    return jsonb_build_object('exercises', to_jsonb(coalesce(touched, '{}')),
      'session', (select se.session_id from public.session_exercises se where se.id = cur));

  elsif p_kind = 'session.finish_other' then
    -- The person chose to finish a workout left running on another device.
    perform app.cut_back_and_finish((d ->> 'session_id')::uuid, 'user');
    return '{}'::jsonb;

  elsif p_kind = 'rest.set' then
    -- When rest ends (or null when it stopped). The server sends "Rest over"
    -- at that moment to a phone in the background (design Section 7).
    update public.rest_alerts set status = 'cancelled'
    where session_id = (d ->> 'session_id')::uuid and status = 'scheduled';
    fire := (d ->> 'fire_at')::timestamptz;
    if fire is not null and fire > now()
       and exists (select 1 from public.sessions where id = (d ->> 'session_id')::uuid and status = 'active') then
      insert into public.rest_alerts (user_id, session_id, fire_at) values (p_me, (d ->> 'session_id')::uuid, fire);
    end if;
    return '{}'::jsonb;

  elsif p_kind = 'display_unit.put' then
    -- The phone's lb/kg switch: a remembered display choice, never a library
    -- edit, so it raises no version and never makes a proposal out of date.
    insert into public.exercise_display_units (user_id, exercise_id, unit)
    values (p_me, (d ->> 'exercise_id')::uuid, d ->> 'unit')
    on conflict (user_id, exercise_id) do update set unit = excluded.unit;
    return '{}'::jsonb;

  elsif p_kind = 'note.put' then
    -- The one-line note: a deliberate edit to the exercise (confirmed by
    -- Nathan, 17 Nov). The last change to reach the server wins.
    update public.exercises set note = left(coalesce(d ->> 'note', ''), 500)
    where id = (d ->> 'exercise_id')::uuid and note is distinct from left(coalesce(d ->> 'note', ''), 500);
    return '{}'::jsonb;

  elsif p_kind = 'exercise.create' then
    -- A swap to an alternate not yet in the library (spec Section 2,
    -- Quick-swap; design question 16). The phone makes the exercise at once,
    -- with its own id, and sends it ahead of the workout that uses it. It
    -- joins the library with what is known from the original; anything not
    -- known (usually equipment) stays empty, which only a swap may do.
    if exists (select 1 from public.exercises where id = (d ->> 'id')::uuid) then
      return '{}'::jsonb; -- already here (sent twice, or made on another phone)
    end if;
    nm := left(btrim(coalesce(d ->> 'name', '')), 120);
    -- Two phones offline could both make it. The second keeps its own id, so
    -- its sets are never lost, under a name that does not clash.
    n := 1;
    while exists (select 1 from public.exercises where user_id = p_me and archived_at is null and lower(name) = lower(nm)) loop
      n := n + 1;
      nm := left(btrim(d ->> 'name'), 110) || ' (' || n || ')';
    end loop;
    insert into public.exercises (id, user_id, name, muscle_group_id, focus_id, equipment_id, default_unit,
                                  work_seconds, rest_seconds, created_via)
    values ((d ->> 'id')::uuid, p_me, nm, (d ->> 'muscle_group_id')::uuid, (d ->> 'focus_id')::uuid,
            (d ->> 'equipment_id')::uuid, d ->> 'default_unit', coalesce((d ->> 'work_seconds')::integer, 45),
            coalesce((d ->> 'rest_seconds')::integer, 120), 'swap');
    return '{}'::jsonb;

  elsif p_kind = 'exercise.confirm' then
    -- The one-tap confirm of a swap-made exercise's suggested details. An
    -- ordinary edit, so it raises the exercise's version as any edit does.
    -- Only an exercise made by a swap is changed this way.
    update public.exercises set
      muscle_group_id = (d ->> 'muscle_group_id')::uuid,
      focus_id = (d ->> 'focus_id')::uuid,
      equipment_id = (d ->> 'equipment_id')::uuid,
      default_unit = d ->> 'default_unit',
      work_seconds = (d ->> 'work_seconds')::integer,
      rest_seconds = (d ->> 'rest_seconds')::integer
    where id = (d ->> 'id')::uuid and created_via = 'swap';
    return '{}'::jsonb;
  end if;
  raise exception 'Unknown kind of change: %', p_kind;
end $$;

-- The same function as in 20261120000100_decide_planner_proposal.sql, with one
-- addition: the answer lists the sessions whose copy was older than the
-- account's plan ("stale"), so the phone replays the accepted change (26 Nov).
create or replace function public.apply_changes(p_changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
  c jsonb;
  cid uuid;
  k text;
  prev record;
  r jsonb;
  msg text;
  done jsonb := '[]';
  rejected jsonb := '[]';
  conflict jsonb := null;
  replaced jsonb := '[]';
  stale jsonb := '[]';
  touched uuid[] := '{}';
  sessions uuid[] := '{}';
  e uuid;
  records jsonb;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 500 then
    raise exception 'Send a list of at most 500 changes.' using errcode = '22023';
  end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    begin
      cid := (c ->> 'id')::uuid;
    exception when others then
      cid := null;
    end;
    if cid is null then
      rejected := rejected || jsonb_build_object('id', c ->> 'id', 'reason', 'A change needs an id.');
      continue;
    end if;
    k := coalesce(c ->> 'kind', '');
    select outcome, reason into prev from public.received_changes where user_id = me and change_id = cid;
    if found then
      if prev.outcome = 'applied' then
        done := done || to_jsonb(cid::text);
      else
        rejected := rejected || jsonb_build_object('id', cid, 'reason', prev.reason);
      end if;
      continue;
    end if;
    begin
      r := app.apply_one_change(me, k, coalesce(c -> 'data', '{}'));
      if r ? 'conflict' then
        conflict := (r -> 'conflict') || jsonb_build_object('change_id', cid);
        exit;
      end if;
      if r ? 'replaced' and not replaced @> jsonb_build_array(r ->> 'replaced') then
        replaced := replaced || jsonb_build_array(r ->> 'replaced');
      end if;
      if r ? 'stale' and not stale @> jsonb_build_array(r ->> 'stale') then
        stale := stale || jsonb_build_array(r ->> 'stale');
      end if;
      if r ? 'exercises' then
        touched := touched || array(select jsonb_array_elements_text(r -> 'exercises')::uuid);
      end if;
      if r ->> 'session' is not null then
        sessions := sessions || (r ->> 'session')::uuid;
      end if;
      insert into public.received_changes (change_id, user_id, kind) values (cid, me, k);
      done := done || to_jsonb(cid::text);
    exception when integrity_constraint_violation or data_exception or insufficient_privilege or raise_exception then
      -- Everything this change did is undone; the ones before it stand.
      get stacked diagnostics msg = message_text;
      insert into public.received_changes (change_id, user_id, kind, outcome, reason)
      values (cid, me, k, 'rejected', left(msg, 300));
      rejected := rejected || jsonb_build_object('id', cid, 'reason', left(msg, 300));
    end;
  end loop;

  foreach e in array coalesce((select array_agg(distinct t) from unnest(touched) t where t is not null), '{}') loop
    perform app.recalc_records(e);
  end loop;

  select coalesce(jsonb_object_agg(l.id, to_jsonb(l.record_types)), '{}') into records
  from public.set_logs l join public.session_exercises se on se.id = l.session_exercise_id
  where se.session_id = any (sessions) and l.deleted_at is null;

  return jsonb_build_object('done', done, 'rejected', rejected, 'conflict', conflict, 'records', records, 'replaced', replaced, 'stale', stale);
end $$;

-- ---------------------------------------------------------------------------
-- 4. What a card for today needs to be applied: read with your own access
-- ---------------------------------------------------------------------------

-- A short code for the state of a workout: its header and its sets. If either
-- changes between reading the workout and applying a change to it, Accept
-- asks for it to be read again rather than apply a change worked out from an
-- older state.
create or replace function app.session_mark(p_session uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(s.updated_at::text || '|' || s.plan_revision || '|' ||
             (select count(*) || ':' || coalesce(max(l.updated_at)::text, '')
              from public.set_logs l join public.session_exercises se on se.id = l.session_exercise_id
              where se.session_id = s.id))
  from public.sessions s where s.id = p_session
$$;

-- Everything the app needs to work out a card's change to today, in one read:
-- the card, the workout running today if there is one (with its blocks,
-- exercises and sets), today's plan (prepared plans and the active campaign),
-- the library facts of the exercises involved, and what was lifted before
-- (for the starting weights of an exercise swapped in or added). It runs with
-- the person's own access, so it reads only their own rows, and refuses a
-- coach's pass. The working out itself is src/rules/today-change.ts, the same
-- rules the phone uses for its own changes.
create or replace function public.proposal_context(p_proposal uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
  p record;
  v_date date;
  sa public.sessions;
  v_camp uuid;
  wanted uuid[];
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select id, kind, status, payload, source into p from public.proposals where id = p_proposal and user_id = me;
  if not found then
    return jsonb_build_object('proposal', null);
  end if;
  v_date := coalesce(case when (p.payload ->> 'local_date') ~ '^\d{4}-\d{2}-\d{2}$' then (p.payload ->> 'local_date')::date end,
                     ((now() at time zone (select pr.time_zone from public.profiles pr where pr.id = me)) - interval '3 hours')::date);
  select * into sa from public.sessions where user_id = me and status = 'active' and local_date = v_date;
  select id into v_camp from public.campaigns where user_id = me and status = 'active';

  select coalesce(array_agg(distinct x), '{}') into wanted from (
    select se.exercise_id as x from public.session_exercises se where sa.id is not null and se.session_id = sa.id
    union all
    select (v #>> '{}')::uuid from jsonb_path_query(p.payload, 'strict $.**') v
    where jsonb_typeof(v) = 'string' and (v #>> '{}') ~* uuid_re
    union all
    select (v #>> '{}')::uuid from public.today_plans tp, jsonb_path_query(tp.plan, 'strict $.**') v
    where tp.user_id = me and tp.local_date = v_date and tp.consumed_at is null and jsonb_typeof(v) = 'string' and (v #>> '{}') ~* uuid_re
    union all
    select i.exercise_id from public.workout_items i join public.campaign_days d on d.workout_id = i.workout_id where d.campaign_id = v_camp
    union all
    select o.exercise_id from public.campaign_day_overrides o join public.campaign_days d on d.id = o.campaign_day_id where d.campaign_id = v_camp
  ) w where x is not null;

  return jsonb_build_object(
    'proposal', jsonb_build_object('id', p.id, 'kind', p.kind, 'status', p.status, 'source', p.source, 'payload', p.payload),
    'date', to_char(v_date, 'YYYY-MM-DD'),
    'session', case when sa.id is null then null else to_jsonb(sa) end,
    'mark', case when sa.id is null then null else app.session_mark(sa.id) end,
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.session_blocks b where sa.id is not null and b.session_id = sa.id), '[]'),
    'exercises', coalesce((select jsonb_agg(to_jsonb(x)) from public.session_exercises x where sa.id is not null and x.session_id = sa.id), '[]'),
    'sets', coalesce((select jsonb_agg(to_jsonb(l)) from public.set_logs l join public.session_exercises x on x.id = l.session_exercise_id
                      where sa.id is not null and x.session_id = sa.id and l.deleted_at is null), '[]'),
    'plan', jsonb_build_object(
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'local_date', x.local_date, 'status', x.status,
                              'campaign_day_id', x.campaign_day_id, 'workout_name', x.workout_name, 'finish_reason', x.finish_reason))
                            from public.sessions x where x.user_id = me and x.local_date = v_date), '[]'),
      'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'start_date', c.start_date, 'week_count', c.week_count, 'status', c.status))
                             from public.campaigns c where c.id = v_camp), '[]'),
      'days', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'campaign_id', d.campaign_id, 'week', d.week, 'weekday', d.weekday, 'workout_id', d.workout_id))
                        from public.campaign_days d where d.campaign_id = v_camp), '[]'),
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', s.campaign_id, 'blank_week_starts_on', s.blank_week_starts_on))
                          from public.campaign_shifts s where s.campaign_id = v_camp), '[]'),
      'overrides', coalesce((select jsonb_agg(jsonb_build_object('campaign_day_id', o.campaign_day_id, 'workout_item_id', o.workout_item_id,
                               'exercise_id', o.exercise_id, 'sets', o.sets, 'reps', o.reps, 'weight_lb', o.weight_lb, 'rest_seconds', o.rest_seconds))
                             from public.campaign_day_overrides o join public.campaign_days d on d.id = o.campaign_day_id where d.campaign_id = v_camp), '[]'),
      'today_plans', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'local_date', t.local_date, 'workout_id', t.workout_id,
                                 'campaign_day_id', t.campaign_day_id, 'plan', t.plan, 'consumed_at', t.consumed_at, 'created_at', t.created_at))
                               from public.today_plans t where t.user_id = me and t.local_date = v_date and t.consumed_at is null), '[]'),
      'workouts', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'archived_at', w.archived_at))
                            from public.workouts w where w.user_id = me and (w.id in (select d.workout_id from public.campaign_days d where d.campaign_id = v_camp)
                              or w.id in (select t.workout_id from public.today_plans t where t.user_id = me and t.local_date = v_date and t.consumed_at is null))), '[]'),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'workout_id', i.workout_id, 'position', i.position, 'exercise_id', i.exercise_id,
                            'sets', i.sets, 'reps', i.reps, 'rest_seconds', i.rest_seconds, 'superset_letter', i.superset_letter))
                         from public.workout_items i where i.user_id = me and (i.workout_id in (select d.workout_id from public.campaign_days d where d.campaign_id = v_camp)
                           or i.workout_id in (select t.workout_id from public.today_plans t where t.user_id = me and t.local_date = v_date and t.consumed_at is null))), '[]')),
    'library', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'muscle', coalesce(mg.name, ''), 'equipment', coalesce(eq.name, ''), 'unit', e.default_unit,
        'assisted', e.assisted, 'load_count', e.load_count, 'work_seconds', e.work_seconds, 'rest_seconds', e.rest_seconds,
        'archived', e.archived_at is not null,
        'alternates', coalesce((select jsonb_agg(jsonb_build_object('tier', a.tier, 'name', a.name) order by a.tier)
                                from public.exercise_alternates a where a.exercise_id = e.id), '[]')))
      from public.exercises e
      left join public.vocabulary_terms mg on mg.id = e.muscle_group_id
      left join public.vocabulary_terms eq on eq.id = e.equipment_id
      where e.user_id = me and e.id = any (wanted)), '[]'),
    'memory', coalesce((select jsonb_agg(to_jsonb(m)) from public.exercise_memory(sa.id) m where m.exercise_id = any (wanted)), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Applying each kind of card (called only by decide_proposal, below)
-- ---------------------------------------------------------------------------
-- A refusal is raised with one of these codes, so decide_proposal can tell
-- them apart and keep nothing of a card that fails part-way:
--   CI001  the card cannot be applied as it stands; it stays pending
--   CI002  something it would change has changed; it becomes out of date
--   CI003  the workout changed while Accept was being worked out; read again
-- Every statement names the owner (me), so only that person's rows are touched.

-- A library exercise's alternates, one per tier, linked to the library
-- exercise of the same name where there is one (as the starter library is).
create or replace function app.proposal_set_alternates(me uuid, p_ex uuid, a jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  t text;
begin
  if jsonb_typeof(a) is distinct from 'object' then
    return;
  end if;
  foreach t in array array['bodyweight', 'basic_gym', 'full_gym'] loop
    if coalesce(btrim(a ->> t), '') <> '' then
      insert into public.exercise_alternates (user_id, exercise_id, tier, name, alternate_exercise_id)
      values (me, p_ex, t, left(btrim(a ->> t), 120),
              (select e.id from public.exercises e where e.user_id = me and e.archived_at is null and e.id <> p_ex
                 and lower(e.name) = lower(btrim(a ->> t)) limit 1))
      on conflict (exercise_id, tier) do update set name = excluded.name, alternate_exercise_id = excluded.alternate_exercise_id;
    end if;
  end loop;
end $$;

-- A new library exercise from a card (spec Section 10: one proposed by a
-- coach is complete, with its three alternates; the connector checks that).
create or replace function app.proposal_new_exercise(me uuid, x jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid;
  nm text := left(btrim(coalesce(x ->> 'name', '')), 120);
begin
  if nm = '' then
    raise exception 'A new exercise on this card has no name.' using errcode = 'CI001';
  end if;
  -- Added since the card was made under the same name: out of date, never a duplicate (design Section 5).
  if exists (select 1 from public.exercises e where e.user_id = me and e.archived_at is null and lower(e.name) = lower(nm)) then
    raise exception '% is already in your library, added since this card was made.', nm using errcode = 'CI002';
  end if;
  insert into public.exercises (user_id, name, muscle_group_id, focus_id, equipment_id, default_unit, work_seconds, rest_seconds, note, created_via)
  values (me, nm, nullif(x ->> 'muscle_group_id', '')::uuid, nullif(x ->> 'focus_id', '')::uuid, nullif(x ->> 'equipment_id', '')::uuid,
          x ->> 'default_unit', coalesce((x ->> 'work_seconds')::integer, 45), coalesce((x ->> 'rest_seconds')::integer, 120),
          left(coalesce(x ->> 'note', ''), 500), 'proposal')
  returning id into v;
  perform app.proposal_set_alternates(me, v, x -> 'alternates');
  return v;
end $$;

-- The new exercises a card brings, in order. Returns each one's id under the
-- name the card uses for it ("ref", or its name if it has none).
create or replace function app.proposal_new_exercises(me uuid, list jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  x jsonb;
  refs jsonb := '{}';
begin
  if list is not null and jsonb_typeof(list) <> 'array' then
    raise exception 'The new exercises on this card are not a list.' using errcode = 'CI001';
  end if;
  for x in select value from jsonb_array_elements(coalesce(list, '[]')) loop
    refs := refs || jsonb_build_object(coalesce(nullif(x ->> 'ref', ''), btrim(x ->> 'name')), app.proposal_new_exercise(me, x));
  end loop;
  return refs;
end $$;

-- The library exercise a row names: "exercise_id", or "new_exercise" for one
-- the same card brings.
create or replace function app.proposal_exercise_ref(me uuid, it jsonb, refs jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid;
begin
  if nullif(it ->> 'new_exercise', '') is not null then
    v := (refs ->> (it ->> 'new_exercise'))::uuid;
    if v is null then
      raise exception 'This card names a new exercise, %, that it does not bring.', it ->> 'new_exercise' using errcode = 'CI001';
    end if;
    return v;
  end if;
  v := nullif(it ->> 'exercise_id', '')::uuid;
  if v is null or not exists (select 1 from public.exercises e where e.id = v and e.user_id = me) then
    raise exception 'An exercise on this card is not in your library.' using errcode = 'CI001';
  end if;
  return v;
end $$;

-- A workout's rows, set to the card's list in order. A row for an exercise the
-- workout already has keeps its place in the database, so campaign days keep
-- their overrides for it; a row the list no longer has goes, with its
-- overrides. Returns how many campaign days had a superset's set counts
-- brought back in line with the workout (their set overrides for that
-- superset now follow the workout), so supersets stay even on every day.
create or replace function app.proposal_workout_items(me uuid, p_workout uuid, items jsonb, refs jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb;
  pos integer := 0;
  v_ex uuid;
  v_row uuid;
  kept uuid[] := '{}';
  n integer;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 40 then
    raise exception 'A workout needs between 1 and 40 exercises.' using errcode = 'CI001';
  end if;
  for it in select value from jsonb_array_elements(items) loop
    v_ex := app.proposal_exercise_ref(me, it, refs);
    select i.id into v_row from public.workout_items i
    where i.workout_id = p_workout and i.user_id = me and i.exercise_id = v_ex and i.id <> all (kept)
    order by i.position limit 1;
    if found then
      update public.workout_items set position = pos, sets = (it ->> 'sets')::integer, reps = (it ->> 'reps')::integer,
        rest_seconds = (it ->> 'rest_seconds')::integer, superset_letter = nullif(it ->> 'superset_letter', '')
      where id = v_row and user_id = me;
    else
      insert into public.workout_items (user_id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter)
      values (me, p_workout, pos, v_ex, (it ->> 'sets')::integer, (it ->> 'reps')::integer, (it ->> 'rest_seconds')::integer,
              nullif(it ->> 'superset_letter', ''))
      returning id into v_row;
    end if;
    kept := kept || v_row;
    pos := pos + 1;
  end loop;
  delete from public.workout_items where workout_id = p_workout and user_id = me and id <> all (kept);

  -- An exercise joining a superset takes its set count (spec Section 10), on
  -- every campaign day too: a day's set override that would leave a superset
  -- uneven gives way to the workout's.
  with uneven as (
    select d.id as day_id, i.superset_letter as letter
    from public.campaign_days d
    join public.workout_items i on i.workout_id = d.workout_id
    left join public.campaign_day_overrides o on o.campaign_day_id = d.id and o.workout_item_id = i.id
    where d.workout_id = p_workout and d.user_id = me and i.superset_letter is not null
    group by d.id, i.superset_letter
    having count(distinct coalesce(o.sets, i.sets)) > 1
  ), evened as (
    update public.campaign_day_overrides o set sets = null
    from uneven u, public.workout_items i
    where o.campaign_day_id = u.day_id and i.id = o.workout_item_id and i.superset_letter = u.letter and o.sets is not null and o.user_id = me
    returning 1
  )
  select count(distinct day_id) into n from uneven;
  return n;
end $$;

-- A new workout a card brings (a campaign may bring its own), returned by id.
create or replace function app.proposal_new_workout(me uuid, w jsonb, refs jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid;
  nm text := left(btrim(coalesce(w ->> 'name', '')), 120);
begin
  if nm = '' then
    raise exception 'A new workout on this card has no name.' using errcode = 'CI001';
  end if;
  insert into public.workouts (user_id, name) values (me, nm) returning id into v;
  perform app.proposal_workout_items(me, v, w -> 'items', refs);
  return v;
end $$;

-- An exercise card: a new exercise, or edits to one (only the fields given).
create or replace function app.accept_exercise(me uuid, pl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid := nullif(pl ->> 'exercise_id', '')::uuid;
  nm text;
begin
  if v is null then
    v := app.proposal_new_exercise(me, pl);
    select name into nm from public.exercises where id = v;
    return jsonb_build_object('exercise_id', v, 'created', true, 'name', nm);
  end if;
  if not exists (select 1 from public.exercises e where e.id = v and e.user_id = me) then
    raise exception 'The exercise this card edits is not in your library.' using errcode = 'CI001';
  end if;
  update public.exercises e set
    name = case when pl ? 'name' then left(btrim(pl ->> 'name'), 120) else e.name end,
    muscle_group_id = case when pl ? 'muscle_group_id' then nullif(pl ->> 'muscle_group_id', '')::uuid else e.muscle_group_id end,
    -- A new muscle group without a focus leaves the focus empty, since a focus belongs to its muscle group.
    focus_id = case when pl ? 'focus_id' then nullif(pl ->> 'focus_id', '')::uuid
                    when pl ? 'muscle_group_id' and nullif(pl ->> 'muscle_group_id', '')::uuid is distinct from e.muscle_group_id then null
                    else e.focus_id end,
    equipment_id = case when pl ? 'equipment_id' then nullif(pl ->> 'equipment_id', '')::uuid else e.equipment_id end,
    default_unit = case when pl ? 'default_unit' then pl ->> 'default_unit' else e.default_unit end,
    work_seconds = case when pl ? 'work_seconds' then (pl ->> 'work_seconds')::integer else e.work_seconds end,
    rest_seconds = case when pl ? 'rest_seconds' then (pl ->> 'rest_seconds')::integer else e.rest_seconds end,
    note = case when pl ? 'note' then left(coalesce(pl ->> 'note', ''), 500) else e.note end
  where e.id = v and e.user_id = me
  returning e.name into nm;
  if pl ? 'alternates' then
    perform app.proposal_set_alternates(me, v, pl -> 'alternates');
  end if;
  return jsonb_build_object('exercise_id', v, 'created', false, 'name', nm);
end $$;

-- A workout card: a new workout or edits to one, with the new exercises it brings first.
create or replace function app.accept_workout(me uuid, pl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid := nullif(pl ->> 'workout_id', '')::uuid;
  refs jsonb := app.proposal_new_exercises(me, pl -> 'new_exercises');
  evened integer := 0;
  made boolean := v is null;
  nm text;
begin
  if made then
    if coalesce(btrim(pl ->> 'name'), '') = '' then
      raise exception 'A new workout on this card has no name.' using errcode = 'CI001';
    end if;
    insert into public.workouts (user_id, name) values (me, left(btrim(pl ->> 'name'), 120)) returning id into v;
    evened := app.proposal_workout_items(me, v, pl -> 'items', refs);
  else
    if not exists (select 1 from public.workouts w where w.id = v and w.user_id = me) then
      raise exception 'The workout this card edits is not in your library.' using errcode = 'CI001';
    end if;
    if pl ? 'name' then
      update public.workouts set name = left(btrim(pl ->> 'name'), 120) where id = v and user_id = me;
    end if;
    if pl ? 'items' then
      evened := app.proposal_workout_items(me, v, pl -> 'items', refs);
    end if;
  end if;
  select name into nm from public.workouts where id = v;
  return jsonb_build_object('workout_id', v, 'created', made, 'name', nm,
    'new_exercise_ids', coalesce((select jsonb_agg(value) from jsonb_each(refs)), '[]'), 'days_evened', evened);
end $$;

-- A campaign card: a new campaign (always a draft), or edits to one (its
-- name, dates and length, the days it lists, and their overrides), or a shift
-- forward of one week. New exercises come first, then new workouts.
--   A listed day sets that week and weekday: a workout (with the overrides it
--   lists, when it lists them; a new workout drops the day's old overrides),
--   or "rest": true to empty it. Days not listed stay as they are.
create or replace function app.accept_campaign(me uuid, pl jsonb, p_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v uuid := nullif(pl ->> 'campaign_id', '')::uuid;
  refs jsonb := app.proposal_new_exercises(me, pl -> 'new_exercises');
  wrefs jsonb := '{}';
  w jsonb;
  d jsonb;
  o jsonb;
  made boolean := v is null;
  c public.campaigns;
  v_day uuid;
  v_dayw uuid;
  v_w uuid;
  v_item uuid;
  v_week date;
  v_lb numeric;
begin
  if pl -> 'new_workouts' is not null and jsonb_typeof(pl -> 'new_workouts') <> 'array' then
    raise exception 'The new workouts on this card are not a list.' using errcode = 'CI001';
  end if;
  for w in select value from jsonb_array_elements(coalesce(pl -> 'new_workouts', '[]')) loop
    wrefs := wrefs || jsonb_build_object(coalesce(nullif(w ->> 'ref', ''), btrim(w ->> 'name')), app.proposal_new_workout(me, w, refs));
  end loop;

  if made then
    if coalesce(btrim(pl ->> 'name'), '') = '' or pl ->> 'start_date' is null or pl ->> 'week_count' is null then
      raise exception 'A new campaign needs a name, a start date and a number of weeks.' using errcode = 'CI001';
    end if;
    -- A new campaign arrives as a draft; the person activates it (spec Section 10).
    insert into public.campaigns (user_id, name, start_date, week_count, status)
    values (me, left(btrim(pl ->> 'name'), 120), (pl ->> 'start_date')::date, (pl ->> 'week_count')::integer, 'draft')
    returning id into v;
  else
    select * into c from public.campaigns where id = v and user_id = me;
    if not found then
      raise exception 'The campaign this card edits is not in your campaigns.' using errcode = 'CI001';
    end if;
    update public.campaigns set
      name = case when pl ? 'name' then left(btrim(pl ->> 'name'), 120) else name end,
      start_date = case when pl ? 'start_date' then (pl ->> 'start_date')::date else start_date end,
      week_count = case when pl ? 'week_count' then (pl ->> 'week_count')::integer else week_count end
    where id = v and user_id = me;
    -- Fewer weeks: the days past the new end go.
    delete from public.campaign_days where campaign_id = v and user_id = me
      and week > (select week_count from public.campaigns where id = v);
  end if;

  -- Shift forward a week (spec Section 10): the week holding today (or the
  -- start, if later) is left empty and every later day moves back a week. It
  -- does not count toward the six-week limit.
  if coalesce((pl ->> 'shift_forward_weeks')::integer, 0) <> 0 then
    if made then
      raise exception 'Only a campaign you already have can be shifted forward.' using errcode = 'CI001';
    end if;
    if (pl ->> 'shift_forward_weeks')::integer <> 1 then
      raise exception 'A campaign is shifted forward one week at a time.' using errcode = 'CI001';
    end if;
    if c.status = 'finished' then
      raise exception 'A finished campaign cannot be shifted forward.' using errcode = 'CI002';
    end if;
    v_week := greatest(app.training_day_now(me), c.start_date);
    v_week := v_week - (extract(isodow from v_week)::integer - 1);
    while exists (select 1 from public.campaign_shifts s where s.campaign_id = v and s.blank_week_starts_on = v_week) loop
      v_week := v_week + 7;
    end loop;
    insert into public.campaign_shifts (user_id, campaign_id, blank_week_starts_on, made_by)
    values (me, v, v_week, 'proposal:' || p_id::text);
  end if;

  if pl -> 'days' is not null and jsonb_typeof(pl -> 'days') <> 'array' then
    raise exception 'The days on this card are not a list.' using errcode = 'CI001';
  end if;
  for d in select value from jsonb_array_elements(coalesce(pl -> 'days', '[]')) loop
    select id, workout_id into v_day, v_dayw from public.campaign_days
    where campaign_id = v and user_id = me and week = (d ->> 'week')::integer and weekday = (d ->> 'weekday')::integer;
    if coalesce((d ->> 'rest')::boolean, false) then
      delete from public.campaign_days where id = v_day and user_id = me;
      continue;
    end if;
    if nullif(d ->> 'new_workout', '') is not null then
      v_w := (wrefs ->> (d ->> 'new_workout'))::uuid;
      if v_w is null then
        raise exception 'This card names a new workout, %, that it does not bring.', d ->> 'new_workout' using errcode = 'CI001';
      end if;
    else
      v_w := nullif(d ->> 'workout_id', '')::uuid;
      if v_w is null or not exists (select 1 from public.workouts x where x.id = v_w and x.user_id = me) then
        raise exception 'A workout on this card is not in your library.' using errcode = 'CI001';
      end if;
    end if;
    if v_day is null then
      insert into public.campaign_days (user_id, campaign_id, week, weekday, workout_id)
      values (me, v, (d ->> 'week')::integer, (d ->> 'weekday')::integer, v_w) returning id into v_day;
    elsif v_dayw is distinct from v_w then
      -- A new workout for the day: its old overrides go with the old workout.
      update public.campaign_days set workout_id = v_w where id = v_day and user_id = me;
    elsif d ? 'overrides' then
      delete from public.campaign_day_overrides where campaign_day_id = v_day and user_id = me;
    end if;
    if d -> 'overrides' is not null and jsonb_typeof(d -> 'overrides') <> 'array' then
      raise exception 'A day''s overrides on this card are not a list.' using errcode = 'CI001';
    end if;
    for o in select value from jsonb_array_elements(coalesce(d -> 'overrides', '[]')) loop
      -- "item" is the row's place in the day's workout, counting from 0.
      select i.id into v_item from public.workout_items i where i.workout_id = v_w and i.user_id = me
      order by i.position offset greatest(0, coalesce((o ->> 'item')::integer, -1)) limit 1;
      if not found or (o ->> 'item') is null or (o ->> 'item')::integer < 0 then
        raise exception 'An override on this card names a row its day''s workout does not have.' using errcode = 'CI001';
      end if;
      v_lb := round((o ->> 'weight_lb')::numeric, 3);
      insert into public.campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, exercise_id, sets, reps,
                                                 weight_lb, weight_entered_value, weight_entered_unit, rest_seconds)
      values (me, v_day, v_w, v_item,
              case when nullif(o ->> 'exercise_id', '') is not null or nullif(o ->> 'new_exercise', '') is not null
                   then app.proposal_exercise_ref(me, o, refs) end,
              (o ->> 'sets')::integer, (o ->> 'reps')::integer, v_lb,
              case when v_lb is not null then coalesce(round((o ->> 'weight_entered_value')::numeric, 3), v_lb) end,
              case when v_lb is not null then coalesce(o ->> 'weight_entered_unit', 'lb') end,
              (o ->> 'rest_seconds')::integer)
      on conflict (campaign_day_id, workout_item_id) do update set
        exercise_id = excluded.exercise_id, sets = excluded.sets, reps = excluded.reps, weight_lb = excluded.weight_lb,
        weight_entered_value = excluded.weight_entered_value, weight_entered_unit = excluded.weight_entered_unit,
        rest_seconds = excluded.rest_seconds;
    end loop;
  end loop;

  select * into c from public.campaigns where id = v;
  return jsonb_build_object('campaign_id', v, 'created', made, 'name', c.name, 'status', c.status,
    'new_exercise_ids', coalesce((select jsonb_agg(value) from jsonb_each(refs)), '[]'),
    'new_workout_ids', coalesce((select jsonb_agg(value) from jsonb_each(wrefs)), '[]'));
end $$;

-- A profile card: the coach profile and its intake answers (only the fields
-- given; an empty answer clears a choice), and or one gym, new or edited.
create or replace function app.accept_profile(me uuid, pl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  f jsonb := pl -> 'profile';
  g jsonb := pl -> 'gym';
  v_gym uuid;
  made boolean := false;
begin
  if f is null and g is null then
    raise exception 'This card has nothing to change.' using errcode = 'CI001';
  end if;
  if jsonb_typeof(f) = 'object' then
    insert into public.coach_profiles (user_id) values (me) on conflict (user_id) do nothing;
    update public.coach_profiles c set
      goals = case when f ? 'goals' then coalesce(f ->> 'goals', '') else c.goals end,
      injuries_and_limits = case when f ? 'injuries_and_limits' then coalesce(f ->> 'injuries_and_limits', '') else c.injuries_and_limits end,
      weekly_schedule = case when f ? 'weekly_schedule' then coalesce(f ->> 'weekly_schedule', '') else c.weekly_schedule end,
      notes = case when f ? 'notes' then coalesce(f ->> 'notes', '') else c.notes end,
      coach_style = case when f ? 'coach_style' then nullif(f ->> 'coach_style', '') else c.coach_style end,
      experience = case when f ? 'experience' then nullif(f ->> 'experience', '') else c.experience end,
      priorities = case when f ? 'priorities' then coalesce(nullif(f -> 'priorities', 'null'::jsonb), '[]') else c.priorities end,
      progression_pace = case when f ? 'progression_pace' then nullif(f ->> 'progression_pace', '') else c.progression_pace end,
      workout_minutes = case when f ? 'workout_minutes' then (f ->> 'workout_minutes')::integer else c.workout_minutes end,
      days_per_week = case when f ? 'days_per_week' then (f ->> 'days_per_week')::integer else c.days_per_week end,
      variety = case when f ? 'variety' then nullif(f ->> 'variety', '') else c.variety end,
      exercises_liked = case when f ? 'exercises_liked' then coalesce(f ->> 'exercises_liked', '') else c.exercises_liked end,
      exercises_to_avoid = case when f ? 'exercises_to_avoid' then coalesce(f ->> 'exercises_to_avoid', '') else c.exercises_to_avoid end,
      how_to_coach_me = case when f ? 'how_to_coach_me' then coalesce(f ->> 'how_to_coach_me', '') else c.how_to_coach_me end
    where c.user_id = me;
  end if;
  if jsonb_typeof(g) = 'object' then
    v_gym := nullif(g ->> 'gym_id', '')::uuid;
    if v_gym is null then
      if coalesce(btrim(g ->> 'name'), '') = '' then
        raise exception 'A new gym on this card has no name.' using errcode = 'CI001';
      end if;
      insert into public.gyms (user_id, name, equipment, notes)
      values (me, left(btrim(g ->> 'name'), 80),
              coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}'), coalesce(g ->> 'notes', ''))
      returning id into v_gym;
      made := true;
    else
      if not exists (select 1 from public.gyms x where x.id = v_gym and x.user_id = me) then
        raise exception 'The gym this card edits is not in your gyms.' using errcode = 'CI001';
      end if;
      update public.gyms x set
        name = case when g ? 'name' then left(btrim(g ->> 'name'), 80) else x.name end,
        equipment = case when g ? 'equipment' then coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}') else x.equipment end,
        notes = case when g ? 'notes' then coalesce(g ->> 'notes', '') else x.notes end
      where x.id = v_gym and x.user_id = me;
    end if;
    if g ? 'make_default' and (g ->> 'make_default')::boolean then
      update public.gyms set is_default = false where user_id = me and is_default and id <> v_gym;
      update public.gyms set is_default = true where id = v_gym and user_id = me and not is_default;
    elsif g ? 'make_default' then
      update public.gyms set is_default = false where id = v_gym and user_id = me and is_default;
    end if;
  end if;
  return jsonb_build_object('profile', jsonb_typeof(f) = 'object', 'gym_id', v_gym, 'gym_created', made);
end $$;

-- Today's prepared plan, checked as a day sent from the planner is.
create or replace function app.proposal_plan_items(me uuid, items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb;
  ex record;
  bad record;
  out jsonb := '[]';
  one jsonb;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 40 then
    raise exception 'Today''s workout needs between 1 and 40 exercises.' using errcode = 'CI001';
  end if;
  for it in select value from jsonb_array_elements(items) loop
    select e.name, e.archived_at into ex from public.exercises e where e.id = nullif(it ->> 'exercise_id', '')::uuid and e.user_id = me;
    if not found then
      raise exception 'An exercise on this card is not in your library.' using errcode = 'CI001';
    end if;
    if (it ->> 'sets')::integer not between 1 and 12 or (it ->> 'reps')::integer not between 1 and 50
       or coalesce((it ->> 'rest_seconds')::integer, 0) not between 0 and 600
       or coalesce((it ->> 'weight_lb')::numeric, 0) not between 0 and 2000
       or coalesce(it ->> 'superset_letter', 'A') !~ '^[A-Z]$' then
      raise exception '% on this card has sets, reps, rest or weight out of range.', ex.name using errcode = 'CI001';
    end if;
    one := jsonb_build_object('exercise_id', it ->> 'exercise_id', 'sets', (it ->> 'sets')::integer, 'reps', (it ->> 'reps')::integer);
    if it ->> 'rest_seconds' is not null then one := one || jsonb_build_object('rest_seconds', (it ->> 'rest_seconds')::integer); end if;
    if it ->> 'superset_letter' is not null then one := one || jsonb_build_object('superset_letter', it ->> 'superset_letter'); end if;
    if it ->> 'weight_lb' is not null then one := one || jsonb_build_object('weight_lb', round((it ->> 'weight_lb')::numeric, 3)); end if;
    out := out || jsonb_build_array(one);
  end loop;
  select x.v ->> 'superset_letter' as letter, count(*) as members into bad
  from jsonb_array_elements(out) as x(v) where x.v ? 'superset_letter'
  group by x.v ->> 'superset_letter'
  having count(*) not between 2 and 3 or count(distinct x.v ->> 'sets') > 1
  limit 1;
  if found then
    raise exception 'Superset % must have two or three exercises with the same number of sets.', bad.letter using errcode = 'CI001';
  end if;
  return out;
end $$;

-- A change to today. The app works the change out with the same rules the
-- phone uses (src/rules/today-change.ts) from what proposal_context read, and
-- sends the result here as p_today:
--   { "mode": "session", "session_id", "mark", "rows": { "session", "blocks", "exercises" } }
--       the running workout, changed (rows as the phone saves them);
--   { "mode": "plan", "based_on": today_plan id or null, "workout_id", "campaign_day_id", "name", "items": [...] }
--       today's prepared plan, changed, when no workout is running today;
--   { "mode": "out_of_date", "message" }
--       the change no longer fits today (an exercise it names is done, say).
-- Here it is checked against the account as it is now: if the workout changed
-- in the meantime the app reads again (CI003). Nothing already logged may
-- move: each logged set stays on the exercise it was done on.
create or replace function app.accept_today(me uuid, p public.proposals, t jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_date date := (p.payload ->> 'local_date')::date;
  sa public.sessions;
  before jsonb;
  after jsonb;
  r jsonb;
  hdr jsonb;
  e uuid;
  v_plan uuid;
  v_newest uuid;
  items jsonb;
begin
  if t is null or jsonb_typeof(t) <> 'object' then
    raise exception 'A change to today is accepted from the app.' using errcode = 'CI001';
  end if;
  if t ->> 'mode' = 'out_of_date' then
    raise exception '%', left(coalesce(nullif(t ->> 'message', ''), 'This change no longer fits today''s workout.'), 300) using errcode = 'CI002';
  end if;
  select * into sa from public.sessions where user_id = me and status = 'active' and local_date = v_date for update;
  if found then
    if t ->> 'mode' is distinct from 'session' or (t ->> 'session_id') is distinct from sa.id::text
       or (t ->> 'mark') is distinct from app.session_mark(sa.id) then
      raise exception 'Your workout changed while this was being accepted.' using errcode = 'CI003';
    end if;
    -- Each logged set, and the exercise it was done on.
    select coalesce(jsonb_object_agg(l.id, se.exercise_id), '{}') into before
    from public.set_logs l join public.session_exercises se on se.id = l.session_exercise_id
    where se.session_id = sa.id and l.deleted_at is null;
    hdr := coalesce(t -> 'rows' -> 'session', '{}') || jsonb_build_object('id', sa.id, 'plan_revision', sa.plan_revision + 1);
    r := app.apply_one_change(me, 'session.put', jsonb_build_object('session', hdr,
           'blocks', coalesce(t -> 'rows' -> 'blocks', '[]'), 'exercises', coalesce(t -> 'rows' -> 'exercises', '[]')));
    if r ? 'conflict' or r ? 'stale' or r ? 'replaced' then
      raise exception 'Your workout changed while this was being accepted.' using errcode = 'CI003';
    end if;
    select coalesce(jsonb_object_agg(l.id, se.exercise_id), '{}') into after
    from public.set_logs l join public.session_exercises se on se.id = l.session_exercise_id
    where se.session_id = sa.id and l.deleted_at is null;
    if after is distinct from before or exists (
         select 1 from public.session_exercises se
         where se.session_id = sa.id
           and cardinality(se.planned_set_types) < (select count(*) from public.set_logs l where l.session_exercise_id = se.id and l.deleted_at is null)) then
      raise exception 'This change would alter a set already logged, so it was not applied.' using errcode = 'CI001';
    end if;
    for e in select distinct jsonb_array_elements_text(coalesce(r -> 'exercises', '[]'))::uuid loop
      perform app.recalc_records(e);
    end loop;
    return jsonb_build_object('mode', 'session', 'session_id', sa.id, 'plan_revision', sa.plan_revision + 1,
                              'changes', coalesce(p.payload -> 'changes', '[]'));
  end if;

  if t ->> 'mode' = 'session' then
    -- The workout finished (or another started) while this was being worked out.
    raise exception 'Your workout changed while this was being accepted.' using errcode = 'CI003';
  end if;
  if t ->> 'mode' is distinct from 'plan' then
    raise exception 'A change to today is accepted from the app.' using errcode = 'CI001';
  end if;
  select id into v_newest from public.today_plans
  where user_id = me and local_date = v_date and consumed_at is null order by created_at desc limit 1;
  if v_newest is distinct from nullif(t ->> 'based_on', '')::uuid then
    raise exception 'Today''s plan changed while this was being accepted.' using errcode = 'CI003';
  end if;
  items := app.proposal_plan_items(me, t -> 'items');
  insert into public.today_plans (user_id, local_date, source_kind, campaign_day_id, workout_id, plan, made_by)
  values (me, v_date, case when nullif(t ->> 'campaign_day_id', '') is not null then 'campaign_day' else 'workout' end,
          nullif(t ->> 'campaign_day_id', '')::uuid, nullif(t ->> 'workout_id', '')::uuid,
          jsonb_build_object('items', items, 'name', nullif(left(btrim(coalesce(t ->> 'name', '')), 120), '')),
          'proposal:' || p.id::text)
  returning id into v_plan;
  return jsonb_build_object('mode', 'plan', 'today_plan_id', v_plan);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Accept or Decline a card
-- ---------------------------------------------------------------------------

-- Returns, for every expected outcome, an answer rather than an error:
--   { "ok": true,  "status": "accepted", "kind", "result": {...}, "message" }
--   { "ok": true,  "status": "rejected", "message" }
--   { "ok": false, "status": <the card's status, or null>, "code", "message" }
-- where code is one of:
--   not_found        not this person's card (or no such card)
--   already_decided  decided before (status says how); nothing changes
--   out_of_date      something it would change was edited since it was made;
--                    it cannot be accepted, and can still be declined
--   expired          a card for today whose day ended at 3:00 am
--   reason_too_long  a decline reason over 300 characters; nothing changes
--   invalid          the card cannot be applied as it stands; it stays pending
--   try_again        the workout changed while Accept was worked out; the app
--                    reads it again and retries
-- A day sent from the planner is decided by decide_planner_proposal, as before.
-- Raises 'not_signed_in' for a coach's pass, a deactivated account, or no sign-in.
--
-- It runs as the database (security definer), because a person has no right
-- to change a proposal directly; whose it is comes from the caller's own
-- sign-in (app.can_write_uid()), and every row it reads or writes is theirs.
create or replace function public.decide_proposal(p_proposal uuid, p_accept boolean, p_reason text default null, p_today jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
  p public.proposals;
  t record;
  cur integer;
  v_reason text;
  res jsonb;
  msg text;
  st text;
  code text;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_proposal is null or p_accept is null then
    raise exception 'Say which card, and whether to accept it.' using errcode = '22023';
  end if;
  select * into p from public.proposals where id = p_proposal and user_id = me for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', null, 'code', 'not_found', 'message', 'This card is not in your inbox.');
  end if;
  if p.source = 'planner' then
    return public.decide_planner_proposal(p_proposal, p_accept);
  end if;

  -- The optional reason: one line, up to 300 characters (spec Section 4).
  if not p_accept then
    v_reason := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
    if char_length(v_reason) > 300 then
      return jsonb_build_object('ok', false, 'status', p.status, 'code', 'reason_too_long',
        'message', 'Keep the reason to one line of up to 300 characters. Nothing was changed.');
    end if;
  end if;

  if p.status = 'out_of_date' then
    if p_accept then
      return jsonb_build_object('ok', false, 'status', p.status, 'code', 'out_of_date',
        'message', 'Something this card would change was edited since the coach sent it, so it cannot be accepted. Decline it and ask your coach again.');
    end if;
    update public.proposals set status = 'rejected', decided_at = now(), decline_reason = v_reason where id = p.id and user_id = me;
    return jsonb_build_object('ok', true, 'status', 'rejected', 'message', 'Declined. Nothing was changed.');
  end if;
  if p.status <> 'pending' then
    return jsonb_build_object('ok', false, 'status', p.status, 'code', 'already_decided',
      'message', case p.status when 'accepted' then 'This card was already accepted.'
                               when 'rejected' then 'This card was already declined.'
                               else 'This card''s day has already ended.' end);
  end if;
  -- A card for today expires at the 3:00 am rollover (spec Section 10, "Proposals").
  if p.expires_at is not null and p.expires_at <= now() then
    update public.proposals set status = 'expired' where id = p.id and user_id = me;
    return jsonb_build_object('ok', false, 'status', 'expired', 'code', 'expired',
      'message', 'This card''s day ended at 3:00 am, so it has expired. Nothing was changed.');
  end if;

  if not p_accept then
    -- Decline is the same as dismissing, and changes nothing else.
    update public.proposals set status = 'rejected', decided_at = now(), decline_reason = v_reason where id = p.id and user_id = me;
    return jsonb_build_object('ok', true, 'status', 'rejected',
      'message', case when v_reason is null then 'Declined. Nothing was changed.'
                      else 'Declined. Nothing was changed. Your coach can read your reason.' end);
  end if;

  -- Every record the card would change must be as it was when the card was
  -- made (design Section 5). Editing one marks the card out of date at once;
  -- this checks again, in the same step as applying it.
  for t in select record_kind, record_id, version_seen from public.proposal_targets where proposal_id = p.id and user_id = me loop
    cur := case t.record_kind
      when 'exercises' then (select x.version from public.exercises x where x.id = t.record_id and x.user_id = me)
      when 'workouts' then (select x.version from public.workouts x where x.id = t.record_id and x.user_id = me)
      when 'campaigns' then (select x.version from public.campaigns x where x.id = t.record_id and x.user_id = me)
      when 'gyms' then (select x.version from public.gyms x where x.id = t.record_id and x.user_id = me)
      when 'coach_profiles' then (select x.version from public.coach_profiles x where x.user_id = t.record_id and x.user_id = me)
      else -1 end;
    if cur is null or (cur <> -1 and t.version_seen is not null and cur <> t.version_seen) then
      update public.proposals set status = 'out_of_date' where id = p.id and user_id = me;
      return jsonb_build_object('ok', false, 'status', 'out_of_date', 'code', 'out_of_date',
        'message', 'Something this card would change was edited since the coach sent it, so nothing was applied. Decline it and ask your coach again.');
    end if;
  end loop;

  -- All of it or none of it: anything that fails undoes everything this card did.
  begin
    -- Marked first, so the edits below do not mark this card itself out of date.
    update public.proposals set status = 'accepted', decided_at = now() where id = p.id and user_id = me;
    res := case p.kind
      when 'exercise' then app.accept_exercise(me, p.payload)
      when 'workout' then app.accept_workout(me, p.payload)
      when 'campaign' then app.accept_campaign(me, p.payload, p.id)
      when 'profile_update' then app.accept_profile(me, p.payload)
      when 'today_change' then app.accept_today(me, p, p_today)
    end;
    -- The superset checks normally wait for the end of the step; here they run
    -- now, so a card that would leave a superset uneven is refused and undone.
    set constraints all immediate;
    update public.proposals set result = res where id = p.id and user_id = me;
  exception
    when sqlstate 'CI002' then
      get stacked diagnostics msg = message_text;
      st := 'out_of_date';
    when sqlstate 'CI003' then
      get stacked diagnostics msg = message_text;
      st := 'try_again';
    when sqlstate 'CI001' or integrity_constraint_violation or data_exception or raise_exception then
      get stacked diagnostics msg = message_text, code = returned_sqlstate;
      st := 'invalid';
      if code = '23505' then
        msg := 'This card would give two live exercises the same name.';
      elsif code <> 'CI001' and code not like 'P0%' then
        msg := 'This card could not be applied as it stands (' || left(msg, 200) || ').';
      end if;
  end;
  if st = 'out_of_date' then
    update public.proposals set status = 'out_of_date' where id = p.id and user_id = me;
    return jsonb_build_object('ok', false, 'status', 'out_of_date', 'code', 'out_of_date',
      'message', msg || ' Nothing was applied. Decline it and ask your coach again.');
  elsif st = 'try_again' then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'try_again', 'message', msg || ' Try again.');
  elsif st = 'invalid' then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid',
      'message', msg || ' Nothing was applied. You can decline it.');
  end if;

  return jsonb_build_object('ok', true, 'status', 'accepted', 'kind', p.kind, 'result', res, 'message',
    case p.kind
      when 'exercise' then case when (res ->> 'created')::boolean
        then format('Accepted. %s is in your library.', res ->> 'name')
        else format('Accepted. %s is updated in your library. Workouts already done are unchanged.', res ->> 'name') end
      when 'workout' then case when (res ->> 'created')::boolean
        then format('Accepted. %s is in your library', res ->> 'name') else format('Accepted. %s is updated', res ->> 'name') end
        || case when jsonb_array_length(res -> 'new_exercise_ids') > 0
                then format(', with %s new exercise%s', jsonb_array_length(res -> 'new_exercise_ids'),
                            case when jsonb_array_length(res -> 'new_exercise_ids') = 1 then '' else 's' end) else '' end
        || '. Workouts already done are unchanged.'
        || case when (res ->> 'days_evened')::integer > 0
                then format(' On %s campaign day%s, a superset''s sets now follow the workout.', res ->> 'days_evened',
                            case when (res ->> 'days_evened')::integer = 1 then '' else 's' end) else '' end
      when 'campaign' then case when (res ->> 'created')::boolean
        then format('Accepted. %s is a draft campaign: activate it when you are ready. Your active campaign is unchanged.', res ->> 'name')
        else format('Accepted. %s is updated. Workouts already done are unchanged.', res ->> 'name') end
      when 'profile_update' then 'Accepted. ' || case when (res ->> 'profile')::boolean and res ->> 'gym_id' is not null then 'Your coach profile and gym are updated.'
                                                     when res ->> 'gym_id' is not null then 'Your gym is updated.'
                                                     else 'Your coach profile is updated.' end
      when 'today_change' then case when res ->> 'mode' = 'session'
        then 'Accepted. Your workout is changed; sets already logged are unchanged. Your library and campaign are unchanged.'
        else 'Accepted. Today''s workout is changed, for today only. Your library and campaign are unchanged.' end
    end);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Who may call what
-- ---------------------------------------------------------------------------

revoke all on function app.next_rollover(uuid), app.today_card_expiry(), app.expire_due_proposals(),
  app.session_mark(uuid), app.proposal_set_alternates(uuid, uuid, jsonb), app.proposal_new_exercise(uuid, jsonb),
  app.proposal_new_exercises(uuid, jsonb), app.proposal_exercise_ref(uuid, jsonb, jsonb),
  app.proposal_workout_items(uuid, uuid, jsonb, jsonb), app.proposal_new_workout(uuid, jsonb, jsonb),
  app.accept_exercise(uuid, jsonb), app.accept_workout(uuid, jsonb), app.accept_campaign(uuid, jsonb, uuid),
  app.accept_profile(uuid, jsonb), app.proposal_plan_items(uuid, jsonb), app.accept_today(uuid, public.proposals, jsonb)
  from public, anon, authenticated;
-- proposal_context runs with the person's own access and asks for this code.
grant execute on function app.session_mark(uuid) to authenticated;
grant execute on function app.next_rollover(uuid), app.expire_due_proposals(), app.session_mark(uuid) to service_role;

-- The two new doors: each refuses a coach's pass (app.can_write_uid()).
revoke all on function public.decide_proposal(uuid, boolean, text, jsonb), public.proposal_context(uuid) from public, anon;
grant execute on function public.decide_proposal(uuid, boolean, text, jsonb), public.proposal_context(uuid) to authenticated, service_role;
