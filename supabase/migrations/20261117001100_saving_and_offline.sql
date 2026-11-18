-- Chalk and Iron, Phase 2: saving workouts to the account, sending changes
-- made offline, records worked out by the database, and the real rest alerts.
-- Follows docs/TECHNICAL_DESIGN.md Section 2 (History), 5 (Session),
-- 6 (Offline and sync) and 7 (Timers and notifications).
--
-- Plain-language summary for Nathan:
--   * The phone keeps the running workout and sends each change to the
--     account when it can. Each change carries its own id, and the database
--     remembers every id it has taken, so a change sent twice counts once.
--   * The phone talks to the database with your own sign-in. Row-level
--     security still fences every row off to its owner.
--   * Records are worked out by the database from the sets you logged, and
--     worked out again whenever a set is changed or deleted.
--   * A deleted set stays as a marker, so a late copy can never bring it back.
--   * Only one workout can run at a time. Starting a second one on another
--     phone is refused with a plain answer, and the phone offers a choice.
--   * A workout with nothing done for 30 minutes finishes itself, ending at
--     its last logged step.
--   * When rest starts the phone tells the database when it ends, so the
--     app's server can send "Rest over" to a phone that is in the background.
--   * No table is removed and no data is deleted by this file.

-- ---------------------------------------------------------------------------
-- 1. Small additions to the session tables
-- ---------------------------------------------------------------------------

-- Clocks to the thousandth of a second, as the phone keeps them.
alter table public.sessions alter column clock_banked_seconds type numeric(12, 3);
alter table public.session_blocks alter column clock_banked_seconds type numeric(12, 3);

-- What "Undo break" restores, while it is still allowed (question 41).
alter table public.sessions add column if not exists break_undo jsonb;

-- A superset that was broken apart keeps who was in it, and how many of its
-- sets were done and planned at the break, which efficiency counts.
alter table public.session_blocks
  add column if not exists members_at_break uuid[],
  add column if not exists sets_done_at_break integer check (sets_done_at_break >= 0),
  add column if not exists sets_planned_at_break integer check (sets_planned_at_break >= 0);

-- ---------------------------------------------------------------------------
-- 2. Changes received from phones (design Section 6)
-- ---------------------------------------------------------------------------

-- A change id is unique per person, not across everyone, so no one can block
-- another person's change by guessing its id.
alter table public.received_changes drop constraint if exists received_changes_pkey;
alter table public.received_changes add primary key (user_id, change_id);
alter table public.received_changes
  add column if not exists kind text not null default '',
  add column if not exists outcome text not null default 'applied' check (outcome in ('applied', 'rejected')),
  add column if not exists reason text;

create policy own_rows_read on public.received_changes for select to authenticated
  using (user_id = (select app.current_uid()));
create policy own_rows_insert on public.received_changes for insert to authenticated
  with check (user_id = (select app.can_write_uid()));
grant select, insert on public.received_changes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rest alerts (design Section 7)
-- ---------------------------------------------------------------------------

alter table public.rest_alerts
  add column if not exists handed_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists result text;
create index if not exists rest_alerts_due on public.rest_alerts (fire_at) where status = 'scheduled';

-- The phone may schedule and cancel its own alerts. Only the server marks one sent.
create policy own_rows_read on public.rest_alerts for select to authenticated
  using (user_id = (select app.current_uid()));
create policy own_rows_insert on public.rest_alerts for insert to authenticated
  with check (user_id = (select app.can_write_uid()) and status = 'scheduled');
create policy own_rows_update on public.rest_alerts for update to authenticated
  using (user_id = (select app.can_write_uid()))
  with check (user_id = (select app.can_write_uid()) and status in ('scheduled', 'cancelled'));
grant select on public.rest_alerts to authenticated;
grant insert (user_id, session_id, fire_at) on public.rest_alerts to authenticated;
grant update (status) on public.rest_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Records, worked out from the sets (spec Section 3, design Section 2)
-- ---------------------------------------------------------------------------

-- Works out every set's records for one exercise, in the order they were
-- done, exactly as src/rules/workout.ts recordsEarned does on the phone:
--   * warm-ups never count, and no record is awarded in the first-ever session;
--   * a record must strictly beat the best before it (less assistance on an
--     assisted machine), so a tie is not a record;
--   * a bodyweight exercise has one record, most reps.
-- Run whenever a set of the exercise is added, edited or deleted. The
-- database's answer wins over the phone's (design Section 6).
create or replace function app.recalc_records(p_exercise uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  ex record;
  s record;
  first_day date := null;
  best numeric[] := array[null, null, null, null]::numeric[]; -- 1+, 6+, 10+, 20+
  limits integer[] := array[1, 6, 10, 20];
  names text[] := array['heaviest', '6_plus', '10_plus', '20_plus'];
  best_reps integer := 0;
  earned text[];
  i integer;
  beats boolean;
begin
  select e.default_unit, e.assisted into ex from public.exercises e where e.id = p_exercise;
  if not found then
    return;
  end if;
  for s in
    select l.id, l.weight_lb, l.reps, l.set_type, l.record_types, x.local_date
    from public.set_logs l
    join public.session_exercises se on se.id = l.session_exercise_id
    join public.sessions x on x.id = se.session_id
    where se.exercise_id = p_exercise and l.deleted_at is null
    order by x.local_date, x.started_at, x.id, l.set_number
  loop
    earned := '{}';
    if s.set_type <> 'warm_up' and first_day is not null and first_day < s.local_date then
      if ex.default_unit = 'bw' then
        if s.reps > best_reps then
          earned := array['most_reps'];
        end if;
      elsif s.weight_lb is not null and s.weight_lb > 0 then
        for i in 1..4 loop
          if s.reps >= limits[i] then
            if best[i] is null then
              beats := true;
            elsif ex.assisted then
              beats := s.weight_lb < best[i];
            else
              beats := s.weight_lb > best[i];
            end if;
            if beats then
              earned := earned || names[i];
            end if;
          end if;
        end loop;
      end if;
    end if;
    if s.record_types is distinct from earned then
      update public.set_logs set record_types = earned where id = s.id;
    end if;
    -- This set now counts as "before" for the ones after it.
    if first_day is null then
      first_day := s.local_date;
    end if;
    if s.set_type <> 'warm_up' then
      best_reps := greatest(best_reps, s.reps);
      if s.weight_lb is not null then
        for i in 1..4 loop
          if s.reps >= limits[i] then
            if best[i] is null then
              best[i] := s.weight_lb;
            elsif ex.assisted then
              best[i] := least(best[i], s.weight_lb);
            else
              best[i] := greatest(best[i], s.weight_lb);
            end if;
          end if;
        end loop;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Finishing a session, cut back to its last logged step
-- ---------------------------------------------------------------------------

-- Ends an active session at its last logged step, with every clock cut back
-- to that moment (spec Section 10: the end time is the last logged entry).
-- Sets left undone are Skipped; an exercise with no sets is Skipped.
-- Used by the 30-minute auto-finish and by "finish the other workout".
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

-- The 30-minute auto-finish, run by the scheduler every minute (migration
-- ...1200). The phone does the same on its next open (design Section 7).
create or replace function app.auto_finish_idle_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.sessions where status = 'active' and last_activity_at < now() - interval '30 minutes' loop
    if app.cut_back_and_finish(r.id, 'auto') then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Applying one change from a phone
-- ---------------------------------------------------------------------------

-- Each kind of change, and what it does. Runs with the person's own sign-in,
-- so row-level security applies to every row it touches. Returns the
-- exercises whose records need working out again, or a conflict.
create or replace function app.apply_one_change(p_me uuid, p_kind text, d jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  s public.sessions;
  b public.session_blocks;
  x public.session_exercises;
  l public.set_logs;
  other record;
  existing record;
  block_ids uuid[];
  exercise_ids uuid[];
  touched uuid[] := '{}';
  cur uuid;
  fire timestamptz;
begin
  if p_kind = 'session.put' then
    -- The whole session as the phone has it: header, blocks and the plan
    -- snapshot. Sets travel separately (set.put), so they are never overwritten here.
    s := jsonb_populate_record(null::public.sessions, d -> 'session');
    if s.id is null then
      raise exception 'A session needs an id.';
    end if;
    if s.status = 'active' then
      -- Only one active session per person (decided 17 Nov, question 30).
      select id, workout_name, started_at, last_activity_at into other
      from public.sessions where user_id = p_me and status = 'active' and id <> s.id;
      if found then
        return jsonb_build_object('conflict', jsonb_build_object(
          'code', 'other_active', 'session_id', other.id, 'workout_name', other.workout_name,
          'started_at', other.started_at, 'last_activity_at', other.last_activity_at));
      end if;
    end if;
    select status, ended_at into existing from public.sessions where id = s.id;
    if found and existing.status = 'finished' and s.status = 'active' and existing.ended_at < now() - interval '48 hours' then
      raise exception 'A finished workout can be reopened only within 48 hours of finishing.';
    end if;
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
              b.clock_started_at, coalesce(b.clock_banked_seconds, 0), b.clock_running_since, b.clock_stopped_at,
              b.broken_at, b.broken_from_block_id, b.members_at_break, b.sets_done_at_break, b.sets_planned_at_break)
      on conflict (id) do update set
        position = excluded.position, superset_letter = excluded.superset_letter,
        time_budget_seconds = excluded.time_budget_seconds, clock_started_at = excluded.clock_started_at,
        clock_banked_seconds = excluded.clock_banked_seconds, clock_running_since = excluded.clock_running_since,
        clock_stopped_at = excluded.clock_stopped_at, broken_at = excluded.broken_at,
        broken_from_block_id = excluded.broken_from_block_id, members_at_break = excluded.members_at_break,
        sets_done_at_break = excluded.sets_done_at_break, sets_planned_at_break = excluded.sets_planned_at_break
      where public.session_blocks.session_id = excluded.session_id;
    end loop;

    -- The plan snapshot. A swap changes the exercise in place, so its sets'
    -- records move with it and both exercises are worked out again.
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
              coalesce(x.state, 'open'), coalesce(x.origin, 'plan'), x.swapped_from_exercise_id, x.sets_before_break)
      on conflict (id) do update set
        block_id = excluded.block_id, exercise_id = excluded.exercise_id, exercise_name_then = excluded.exercise_name_then,
        position_in_block = excluded.position_in_block, planned_set_types = excluded.planned_set_types,
        planned_reps = excluded.planned_reps, planned_weight_lb = excluded.planned_weight_lb,
        planned_weight_entered_value = excluded.planned_weight_entered_value,
        planned_weight_entered_unit = excluded.planned_weight_entered_unit, seed_weights_lb = excluded.seed_weights_lb,
        planned_rest_seconds = excluded.planned_rest_seconds, work_seconds = excluded.work_seconds, state = excluded.state,
        origin = excluded.origin, swapped_from_exercise_id = excluded.swapped_from_exercise_id,
        sets_before_break = excluded.sets_before_break
      where public.session_exercises.session_id = excluded.session_id;
    end loop;

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
  end if;
  raise exception 'Unknown kind of change: %', p_kind;
end $$;

-- ---------------------------------------------------------------------------
-- 7. The one door phones send changes through
-- ---------------------------------------------------------------------------

-- Takes changes in the order the phone made them. A change whose id was
-- already received is not applied again; it just answers "done". A change
-- the database refuses (for example a number out of range) is answered
-- "rejected" with the reason, and also remembered, so it is not sent
-- forever. A conflict (another workout already running) stops the list
-- there, applying nothing from that change on, so the phone can ask.
-- Returns which ids are done, which were rejected, any conflict, and the
-- records the database worked out for the sets of the sessions touched.
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

  return jsonb_build_object('done', done, 'rejected', rejected, 'conflict', conflict, 'records', records);
end $$;

-- ---------------------------------------------------------------------------
-- 8. What the phone needs to know about past sessions
-- ---------------------------------------------------------------------------

-- For "Last time", the seeded weights, the graph and record checks on the
-- phone, from the account's real history (finished and current sessions):
--   * every set of the last 6 sessions of each exercise ("recent");
--   * and each record-holding set and the best estimated one-rep max set,
--     however old, so the phone can check a new set against the true best.
-- p_exclude leaves out the session running on the asking phone, which the
-- phone counts itself.
create or replace function public.exercise_memory(p_exclude uuid default null)
returns table (exercise_id uuid, session_id uuid, local_date date, started_at timestamptz, set_number integer,
               weight_lb numeric, entered_value numeric, entered_unit text, reps integer, set_type text, recent boolean)
language sql stable security invoker set search_path = '' as $$
  with sets as (
    select se.exercise_id, x.id as session_id, x.local_date, x.started_at, l.id as set_id, l.set_number, l.weight_lb,
           l.entered_value, l.entered_unit, l.reps, l.set_type, ex.default_unit, ex.assisted
    from public.set_logs l
    join public.session_exercises se on se.id = l.session_exercise_id
    join public.sessions x on x.id = se.session_id
    join public.exercises ex on ex.id = se.exercise_id
    where l.deleted_at is null and (p_exclude is null or x.id <> p_exclude)
  ),
  ranked_sessions as (
    select s.exercise_id, s.session_id,
           dense_rank() over (partition by s.exercise_id order by s.started_at desc, s.session_id desc) as rk
    from (select distinct exercise_id, session_id, started_at from sets) s
  ),
  recent as (
    select s.set_id from sets s
    join ranked_sessions r on r.exercise_id = s.exercise_id and r.session_id = s.session_id
    where r.rk <= 6
  ),
  limits as (select unnest(array[1, 6, 10, 20]) as t),
  weighted_best as (
    select set_id from (
      select s.set_id, row_number() over (
        partition by s.exercise_id, lim.t
        order by case when s.assisted then s.weight_lb end asc nulls last,
                 case when not s.assisted then s.weight_lb end desc nulls last,
                 s.local_date desc, s.started_at desc, s.set_number desc) as rn
      from sets s cross join limits lim
      where s.default_unit <> 'bw' and s.set_type <> 'warm_up' and s.weight_lb is not null and s.reps >= lim.t
    ) z where rn = 1
  ),
  bw_best as (
    select set_id from (
      select s.set_id, row_number() over (partition by s.exercise_id order by s.reps desc, s.local_date desc, s.started_at desc, s.set_number desc) as rn
      from sets s where s.default_unit = 'bw' and s.set_type <> 'warm_up'
    ) z where rn = 1
  ),
  e1rm_best as (
    select set_id from (
      select s.set_id, row_number() over (partition by s.exercise_id order by s.weight_lb * (1 + s.reps / 30.0) desc) as rn
      from sets s where s.default_unit <> 'bw' and not s.assisted and s.set_type <> 'warm_up' and s.weight_lb is not null
    ) z where rn = 1
  )
  select s.exercise_id, s.session_id, s.local_date, s.started_at, s.set_number, s.weight_lb, s.entered_value,
         s.entered_unit, s.reps, s.set_type, s.set_id in (select set_id from recent)
  from sets s
  where s.set_id in (select set_id from recent union select set_id from weighted_best
                     union select set_id from bw_best union select set_id from e1rm_best)
  order by s.exercise_id, s.local_date, s.started_at, s.set_number
$$;

-- ---------------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.apply_changes(jsonb), public.exercise_memory(uuid) from public, anon;
grant execute on function public.apply_changes(jsonb), public.exercise_memory(uuid) to authenticated;
revoke all on function app.apply_one_change(uuid, text, jsonb), app.recalc_records(uuid),
  app.cut_back_and_finish(uuid, text), app.auto_finish_idle_sessions() from public, anon, authenticated;
-- These run with the caller's own sign-in, so row-level security still applies.
grant execute on function app.apply_one_change(uuid, text, jsonb), app.recalc_records(uuid),
  app.cut_back_and_finish(uuid, text) to authenticated;
grant execute on function app.apply_one_change(uuid, text, jsonb), app.recalc_records(uuid),
  app.cut_back_and_finish(uuid, text), app.auto_finish_idle_sessions() to service_role;
