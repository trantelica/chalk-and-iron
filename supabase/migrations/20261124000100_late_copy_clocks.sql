-- Chalk and Iron, Phase 3: the fix check of pull request 47 (24 November 2026).
-- Follows docs/TECHNICAL_DESIGN.md Section 5 ("The phone that still holds the
-- replaced workout").
--
-- Plain-language summary for Nate:
--   * When the phone's late changes to a replaced workout arrive, the time its
--     exercise clocks had already run is kept. Before this, a late change could
--     reset an exercise's time to almost nothing, so that workout's efficiency
--     showed n/a or far too high. Each clock is now stopped at the moment the
--     account ended the workout, and never shows less than the account had.
--   * Nothing else changes. No table is removed and no data is deleted. Safe to
--     run more than once.

-- The same function as in 20261123000100_late_changes_and_workout_save.sql,
-- with one change, for a session the account ended as 'replaced': a block's
-- banked seconds are the phone's banked seconds plus the time its clock was
-- still running up to the account's end time, and never less than what the
-- account already has for that block.
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
    select status, ended_at, finish_reason into existing from public.sessions where id = s.id;
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
                                   rest_ends_at, rest_total_seconds, last_activity_at, break_undo)
      values (s.id, p_me, s.local_date, coalesce(s.source_kind, 'ad_hoc'), s.campaign_day_id, s.workout_id, s.workout_name, s.gym_id,
              s.started_at, s.ended_at, s.status, s.finish_reason, coalesce(s.clock_banked_seconds, 0), s.clock_running_since,
              s.rest_ends_at, s.rest_total_seconds, coalesce(s.last_activity_at, s.started_at), s.break_undo)
      on conflict (id) do update set
        local_date = excluded.local_date, workout_name = excluded.workout_name,
        ended_at = excluded.ended_at, status = excluded.status, finish_reason = excluded.finish_reason,
        clock_banked_seconds = excluded.clock_banked_seconds, clock_running_since = excluded.clock_running_since,
        rest_ends_at = excluded.rest_ends_at, rest_total_seconds = excluded.rest_total_seconds,
        last_activity_at = excluded.last_activity_at, break_undo = excluded.break_undo;

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
    -- before its changes arrived), but with every clock stopped at the
    -- account's end time, never below what the account had banked (24 Nov).
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
              -- A replaced workout's clocks stop at the account's end time: time the
              -- phone's clock was still running up to then is banked (24 Nov).
              case when frozen
                then coalesce(b.clock_banked_seconds, 0)
                     + case when b.clock_running_since is null then 0
                            else greatest(0, extract(epoch from (existing.ended_at - b.clock_running_since))) end
                else coalesce(b.clock_banked_seconds, 0) end,
              case when frozen then null else b.clock_running_since end,
              case when frozen and b.clock_started_at is not null then coalesce(b.clock_stopped_at, existing.ended_at) else b.clock_stopped_at end,
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
      where public.session_blocks.session_id = excluded.session_id;
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
      if found and existing.exercise_id <> x.exercise_id then
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
      where public.session_exercises.session_id = excluded.session_id;
    end loop;

    if frozen then
      return jsonb_build_object('replaced', s.id, 'exercises', to_jsonb(touched), 'session', s.id);
    end if;

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
