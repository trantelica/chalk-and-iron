-- Chalk and Iron, Phase 3 (20 November 2026): deciding a day sent from the
-- planner. Follows docs/SPEC.md Section 10 ("Days and campaigns",
-- "Proposals") and docs/TECHNICAL_DESIGN.md Section 2 ("Sending a day from
-- the planner", today_plans, sessions) and Section 5 (Proposal).
--
-- When a day is sent from the planner and today already has a workout, the
-- planner adds a card to the inbox (a proposal with source 'planner'). Until
-- now nothing could decide one: a person may add a pending proposal but never
-- change it. This file adds the one guarded step that does.
--
-- Plain-language summary for Nate:
--   * Accept makes the sent day today's workout, for today only. It never
--     changes an exercise, a workout or a campaign.
--   * Dismiss changes nothing except the card, which ends as declined.
--   * If a workout is running when Accept is tapped, what was already logged
--     is saved as its own workout, and the sent day starts afterwards as a
--     new one. Exercises not reached are marked Replaced and left out of
--     efficiency. The campaign's own day then shows as Missed if not done.
--   * A phone still holding the replaced workout cannot reopen or overwrite
--     it, and is told that it was replaced. Sets it sends late are kept.
--   * A coach cannot add a card that claims to come from your planner.
--   * No table is removed and no data is deleted. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Only the person's own sign-in may add a card from the planner
-- ---------------------------------------------------------------------------

-- A coach may still add its own proposals (source 'ChatGPT' and the like).
drop policy if exists planner_cards_only_from_the_person on public.proposals;
create policy planner_cards_only_from_the_person on public.proposals as restrictive for insert to authenticated
  with check (source <> 'planner' or user_id = (select app.can_write_uid()));

-- ---------------------------------------------------------------------------
-- 2. Finishing a session: 'replaced' marks the exercises not reached
-- ---------------------------------------------------------------------------

-- The same function as in 20261117001100_saving_and_offline.sql. One change:
-- with the reason 'replaced', an exercise with no logged sets is marked
-- Replaced rather than Skipped (spec Section 10, "Proposals"). Either way it
-- is left out of efficiency.
create or replace function app.cut_back_and_finish(p_session uuid, p_reason text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  ends timestamptz;
begin
  select greatest(s.started_at, s.last_activity_at) into ends
  from public.sessions s where s.id = p_session and s.status = 'active';
  if not found then
    return false;
  end if;
  update public.session_blocks b set
    clock_banked_seconds = b.clock_banked_seconds + greatest(0, extract(epoch from (ends - b.clock_running_since))),
    clock_running_since = null,
    clock_stopped_at = coalesce(b.clock_stopped_at, case when b.clock_started_at is not null then ends end)
  where b.session_id = p_session and b.clock_running_since is not null;
  update public.session_exercises se set state = case
      when exists (select 1 from public.set_logs l where l.session_exercise_id = se.id and l.deleted_at is null) then 'done'
      when p_reason = 'replaced' then 'replaced'
      else 'skipped' end
  where se.session_id = p_session and se.state = 'open';
  update public.sessions s set
    clock_banked_seconds = s.clock_banked_seconds
      + case when s.clock_running_since is null then 0 else greatest(0, extract(epoch from (ends - s.clock_running_since))) end,
    clock_running_since = null,
    rest_ends_at = null,
    rest_total_seconds = null,
    ended_at = ends,
    status = 'finished',
    finish_reason = p_reason
  where s.id = p_session;
  update public.rest_alerts set status = 'cancelled' where session_id = p_session and status = 'scheduled';
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Accept or Dismiss a day sent from the planner
-- ---------------------------------------------------------------------------

-- The card's payload, as the planner writes it:
--   { "local_date": "YYYY-MM-DD", "workout_name": text,
--     "workout_id": uuid or null, "campaign_day_id": uuid or null,
--     "plan_items": [{ "exercise_id": uuid, "sets": 1-12, "reps": 1-50,
--                      "rest_seconds"?: 0-600, "superset_letter"?: "A".."Z",
--                      "weight_lb"?: number }],
--     "replaces": text }
--
-- Returns, for every expected outcome, an answer rather than an error:
--   { "ok": true,  "status": "accepted", "today_plan_id": uuid,
--     "replaced_session_id": uuid or null, "message": text }
--   { "ok": true,  "status": "rejected", "message": text }
--   { "ok": false, "status": <the card's status, or null>, "code": text, "message": text }
-- where code is one of:
--   not_found        not this person's card (or no such card)
--   not_planner      not a day sent from the planner
--   already_decided  decided before (status says how); nothing changes
--   out_of_date      cannot be accepted (it can still be dismissed)
--   expired          its day ended at the 3:00 am rollover; now marked expired
--   invalid          the plan breaks a rule; the card stays pending
-- Raises 'not_signed_in' (as apply_changes does) for a coach sign-in, a
-- deactivated account, or no sign-in at all.
--
-- It runs as the database (security definer), because a person has no right
-- to change a proposal directly: otherwise a card could be marked accepted
-- without being applied. Whose it is comes from the caller's own sign-in
-- (app.can_write_uid()), and every row it reads or writes is that person's:
-- each statement names the owner, and the links in today_plans are checked by
-- the database to point at the same person's workout and campaign day.
create or replace function public.decide_planner_proposal(p_proposal uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.can_write_uid();
  p public.proposals;
  pl jsonb;
  items jsonb;
  it jsonb;
  ex record;
  bad record;
  n integer := 0;
  v_date date;
  v_workout uuid;
  v_day uuid;
  v_name text;
  v_session uuid;
  v_plan_id uuid;
  plan_out jsonb := '[]';
  one jsonb;
  res jsonb;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_proposal is null or p_accept is null then
    raise exception 'Say which card, and whether to accept it.' using errcode = '22023';
  end if;

  select * into p from public.proposals where id = p_proposal and user_id = me for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', null, 'code', 'not_found',
      'message', 'This card is not in your inbox.');
  end if;
  if p.source <> 'planner' or p.kind <> 'today_change' or p.applies_to <> 'today' then
    return jsonb_build_object('ok', false, 'status', p.status, 'code', 'not_planner',
      'message', 'Only a day sent from the planner can be decided here.');
  end if;

  -- Out of date: it cannot be accepted, but it can be dismissed (design Section 5).
  if p.status = 'out_of_date' then
    if p_accept then
      return jsonb_build_object('ok', false, 'status', p.status, 'code', 'out_of_date',
        'message', 'Something this card would change was edited since it was sent. Dismiss it and send the day again.');
    end if;
    update public.proposals set status = 'rejected', decided_at = now() where id = p.id and user_id = me;
    return jsonb_build_object('ok', true, 'status', 'rejected', 'message', 'Dismissed. Nothing was changed.');
  end if;
  if p.status <> 'pending' then
    return jsonb_build_object('ok', false, 'status', p.status, 'code', 'already_decided',
      'message', case p.status when 'accepted' then 'This card was already accepted.'
                               when 'rejected' then 'This card was already dismissed.'
                               else 'This card''s day has already ended.' end);
  end if;

  -- A today card expires at the 3:00 am rollover (spec Section 10, "Proposals").
  if p.expires_at is not null and p.expires_at <= now() then
    update public.proposals set status = 'expired' where id = p.id and user_id = me;
    return jsonb_build_object('ok', false, 'status', 'expired', 'code', 'expired',
      'message', 'This card''s day ended at 3:00 am, so it has expired. Nothing was changed.');
  end if;

  if not p_accept then
    -- Dismiss is the same as declining, and changes nothing else.
    update public.proposals set status = 'rejected', decided_at = now() where id = p.id and user_id = me;
    return jsonb_build_object('ok', true, 'status', 'rejected', 'message', 'Dismissed. Nothing was changed.');
  end if;

  -- ------------------------------------------------ check the plan
  pl := p.payload;
  begin
    v_date := (pl ->> 'local_date')::date;
    v_workout := nullif(pl ->> 'workout_id', '')::uuid;
    v_day := nullif(pl ->> 'campaign_day_id', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid',
      'message', 'This card''s day, workout or campaign day is not readable.');
  end;
  if v_date is null or coalesce(pl ->> 'local_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', 'This card has no day.');
  end if;
  v_name := left(btrim(coalesce(pl ->> 'workout_name', '')), 120);
  if v_workout is not null and not exists (select 1 from public.workouts w where w.id = v_workout and w.user_id = me) then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', 'This card''s workout is not in your library.');
  end if;
  if v_day is not null and not exists (select 1 from public.campaign_days d where d.id = v_day and d.user_id = me) then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', 'This card''s campaign day is not in your campaigns.');
  end if;
  items := pl -> 'plan_items';
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', 'This card needs between 1 and 40 exercises.');
  end if;
  for it in select value from jsonb_array_elements(items) loop
    n := n + 1;
    if jsonb_typeof(it) is distinct from 'object'
       or coalesce(it ->> 'exercise_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('Exercise %s on this card is not readable.', n));
    end if;
    select e.name, e.archived_at into ex from public.exercises e where e.id = (it ->> 'exercise_id')::uuid and e.user_id = me;
    if not found then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('Exercise %s on this card is not in your library.', n));
    end if;
    if ex.archived_at is not null then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid',
        'message', format('%s is archived. Restore it in the library, or send the day without it.', ex.name));
    end if;
    if jsonb_typeof(it -> 'sets') is distinct from 'number' or (it ->> 'sets')::numeric not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12) then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('%s needs 1 to 12 sets.', ex.name));
    end if;
    if jsonb_typeof(it -> 'reps') is distinct from 'number' or (it ->> 'reps')::numeric <> trunc((it ->> 'reps')::numeric)
       or (it ->> 'reps')::numeric not between 1 and 50 then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('%s needs 1 to 50 reps.', ex.name));
    end if;
    if coalesce(jsonb_typeof(it -> 'rest_seconds'), 'null') <> 'null' and (
         jsonb_typeof(it -> 'rest_seconds') <> 'number' or (it ->> 'rest_seconds')::numeric <> trunc((it ->> 'rest_seconds')::numeric)
         or (it ->> 'rest_seconds')::numeric not between 0 and 600) then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('%s needs a rest of 0 to 600 seconds.', ex.name));
    end if;
    if coalesce(jsonb_typeof(it -> 'superset_letter'), 'null') <> 'null' and (
         jsonb_typeof(it -> 'superset_letter') <> 'string' or (it ->> 'superset_letter') !~ '^[A-Z]$') then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('%s has a superset letter that is not A to Z.', ex.name));
    end if;
    if coalesce(jsonb_typeof(it -> 'weight_lb'), 'null') <> 'null' and (
         jsonb_typeof(it -> 'weight_lb') <> 'number' or (it ->> 'weight_lb')::numeric not between 0 and 2000) then
      return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid', 'message', format('%s has a weight that is not readable.', ex.name));
    end if;
    -- Only the fields the phone reads (src/rules/today.ts planItems), nothing else.
    one := jsonb_build_object('exercise_id', it ->> 'exercise_id', 'sets', (it ->> 'sets')::numeric::integer, 'reps', (it ->> 'reps')::numeric::integer);
    if coalesce(jsonb_typeof(it -> 'rest_seconds'), 'null') <> 'null' then one := one || jsonb_build_object('rest_seconds', (it ->> 'rest_seconds')::numeric::integer); end if;
    if coalesce(jsonb_typeof(it -> 'superset_letter'), 'null') <> 'null' then one := one || jsonb_build_object('superset_letter', it ->> 'superset_letter'); end if;
    if coalesce(jsonb_typeof(it -> 'weight_lb'), 'null') <> 'null' then one := one || jsonb_build_object('weight_lb', round((it ->> 'weight_lb')::numeric, 3)); end if;
    plan_out := plan_out || jsonb_build_array(one);
  end loop;
  -- A superset has two or three exercises, each with the same sets (spec Section 10, "Supersets").
  select x.v ->> 'superset_letter' as letter, count(*) as members, count(distinct x.v ->> 'sets') as set_counts into bad
  from jsonb_array_elements(plan_out) as x(v)
  where x.v ? 'superset_letter'
  group by x.v ->> 'superset_letter'
  having count(*) not between 2 and 3 or count(distinct x.v ->> 'sets') > 1
  limit 1;
  if found then
    return jsonb_build_object('ok', false, 'status', 'pending', 'code', 'invalid',
      'message', case when bad.members not between 2 and 3
                      then format('Superset %s must have two or three exercises.', bad.letter)
                      else format('Every exercise in superset %s must have the same number of sets.', bad.letter) end);
  end if;

  -- ------------------------------------------------ apply it
  -- A workout running now is split (spec Section 10, "Proposals"): what was
  -- logged is saved as its own ad hoc workout, ended at its last step with
  -- its clocks cut back, and the sent day starts afterwards as a new one,
  -- from the phone, using the prepared plan made below.
  select s.id into v_session from public.sessions s where s.user_id = me and s.status = 'active' for update;
  if found then
    perform app.cut_back_and_finish(v_session, 'replaced');
    -- No longer the campaign's day, so that day shows as Missed if it is not done.
    update public.sessions set source_kind = 'ad_hoc', campaign_day_id = null where id = v_session and user_id = me;
  end if;

  -- Today's prepared plan, for today only. The library and the campaign are
  -- never changed (spec Section 1, rule 3).
  insert into public.today_plans (user_id, local_date, source_kind, campaign_day_id, workout_id, plan, made_by)
  values (me, v_date, case when v_day is not null then 'campaign_day' else 'workout' end, v_day, v_workout,
          jsonb_build_object('items', plan_out, 'name', nullif(v_name, '')), 'proposal:' || p.id::text)
  returning id into v_plan_id;

  res := jsonb_build_object('today_plan_id', v_plan_id, 'replaced_session_id', v_session);
  update public.proposals set status = 'accepted', decided_at = now(), result = res where id = p.id and user_id = me;
  return jsonb_build_object('ok', true, 'status', 'accepted', 'today_plan_id', v_plan_id, 'replaced_session_id', v_session,
    'message', case when v_session is null then 'Accepted. It is today''s workout.'
                    else 'Accepted. The workout you were doing is saved, and this one is ready to start from Home.' end);
end $$;

revoke all on function public.decide_planner_proposal(uuid, boolean) from public, anon;
grant execute on function public.decide_planner_proposal(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A phone still holding a replaced workout (design Section 6)
-- ---------------------------------------------------------------------------

-- The same function as in 20261119000200_swap_new_exercise_and_remove_test_page.sql,
-- with three changes, all for a session the account ended as 'replaced':
--   * 'session.put' never reopens or overwrites it. Its header, its blocks and
--     its exercises stay as the account has them; only blocks and exercises
--     the account has never seen are added (an exercise added offline), so a
--     late set on them is not lost. It answers 'replaced', and apply_changes
--     tells the phone, which then drops its copy.
--   * 'set.put' keeps a late set (the app owns the history), and an exercise
--     marked Replaced that receives one becomes Done.
--   * A workout started from a prepared plan made by accepting a card that
--     split a session names that session (sessions.split_from_session_id).
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
    -- Replaced by a day sent from the planner: never reopened or overwritten (20 Nov).
    frozen := coalesce(found and existing.finish_reason = 'replaced', false);
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

    -- Blocks: a broken-out block after the superset it came from.
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
              b.clock_started_at, coalesce(b.clock_banked_seconds, 0),
              case when frozen then null else b.clock_running_since end, b.clock_stopped_at,
              b.broken_at, b.broken_from_block_id, b.members_at_break, b.sets_done_at_break, b.sets_planned_at_break)
      on conflict (id) do update set
        position = excluded.position, superset_letter = excluded.superset_letter,
        time_budget_seconds = excluded.time_budget_seconds, clock_started_at = excluded.clock_started_at,
        clock_banked_seconds = excluded.clock_banked_seconds, clock_running_since = excluded.clock_running_since,
        clock_stopped_at = excluded.clock_stopped_at, broken_at = excluded.broken_at,
        broken_from_block_id = excluded.broken_from_block_id, members_at_break = excluded.members_at_break,
        sets_done_at_break = excluded.sets_done_at_break, sets_planned_at_break = excluded.sets_planned_at_break
      where public.session_blocks.session_id = excluded.session_id and not frozen;
    end loop;

    -- The plan snapshot. A swap changes the exercise in place, so its sets'
    -- records move with it and both exercises are worked out again.
    exercise_ids := '{}';
    for x in select * from jsonb_populate_recordset(null::public.session_exercises, coalesce(d -> 'exercises', '[]')) loop
      exercise_ids := exercise_ids || x.id;
      select exercise_id into existing from public.session_exercises where id = x.id;
      if found and not frozen and existing.exercise_id <> x.exercise_id then
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
        planned_rest_seconds = excluded.planned_rest_seconds, work_seconds = excluded.work_seconds, state = excluded.state,
        origin = excluded.origin, swapped_from_exercise_id = excluded.swapped_from_exercise_id,
        sets_before_break = excluded.sets_before_break
      where public.session_exercises.session_id = excluded.session_id and not frozen;
    end loop;

    if frozen then
      return jsonb_build_object('replaced', s.id, 'exercises', '[]'::jsonb, 'session', s.id);
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

-- The same function as in 20261117001100_saving_and_offline.sql, with one
-- addition: the answer lists the sessions the account ended as 'replaced'
-- ("replaced"), so a phone still holding one drops its copy and says so.
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

  return jsonb_build_object('done', done, 'rejected', rejected, 'conflict', conflict, 'records', records, 'replaced', replaced);
end $$;
