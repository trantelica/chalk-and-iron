-- Chalk and Iron, Phase 4, stage 4E follow-up (27 November 2026): the coach
-- changes a gym's equipment by adding and removing single items.
--
-- Plain-language summary for Nate: a coach's card for a gym can now say "add
-- these items" and "remove these items" instead of sending the whole list.
-- When you press Accept, the app applies that to the gym's list as it is at
-- that moment, so nothing you added since the card was made is lost. The list
-- stays tidy (A to Z, no repeats ignoring capitals, items up to 60
-- characters, up to 500 items), and if any item is not allowed or the list
-- would go over 500, the whole card is refused and nothing changes. A card
-- that only adds or removes equipment is not marked out of date when you edit
-- the gym yourself. Old cards that carry a whole list still work. Nothing is
-- deleted or reshaped; two functions are added or replaced. Safe to run more
-- than once.

create or replace function app.gym_equipment_after(cur text[], adds jsonb, removes jsonb) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare
  it text;
  t text;
  k text;
  seen text[] := '{}';
  outl text[] := '{}';
  drop_keys text[] := '{}';
  res text[];
begin
  if adds is not null and jsonb_typeof(adds) <> 'array' then
    raise exception 'The equipment to add on this card is not a list.' using errcode = 'CI001';
  end if;
  if removes is not null and jsonb_typeof(removes) <> 'array' then
    raise exception 'The equipment to remove on this card is not a list.' using errcode = 'CI001';
  end if;
  -- Items to remove, matched ignoring capitals and extra spaces.
  for it in select jsonb_array_elements_text(coalesce(removes, '[]')) loop
    drop_keys := drop_keys || lower(btrim(regexp_replace(it, '\s+', ' ', 'g')));
  end loop;
  -- The list as it is now (tidied, repeats dropped), then the added items; a removed item goes whichever list it is in.
  for it in select unnest(coalesce(cur, '{}')) loop
    t := btrim(regexp_replace(it, '\s+', ' ', 'g'));
    k := lower(t);
    if t = '' or k = any(seen) or k = any(drop_keys) then continue; end if;
    seen := seen || k;
    outl := outl || t;
  end loop;
  for it in select jsonb_array_elements_text(coalesce(adds, '[]')) loop
    t := btrim(regexp_replace(it, '\s+', ' ', 'g'));
    if t = '' then
      raise exception 'An equipment item on this card is empty.' using errcode = 'CI001';
    end if;
    if char_length(t) > 60 then
      raise exception '"%" is longer than 60 characters.', left(t, 30) || '...' using errcode = 'CI001';
    end if;
    k := lower(t);
    if k = any(seen) or k = any(drop_keys) then continue; end if;
    seen := seen || k;
    outl := outl || t;
  end loop;
  if coalesce(array_length(outl, 1), 0) > 500 then
    raise exception 'This card would make the gym hold more than 500 items.' using errcode = 'CI001';
  end if;
  select coalesce(array_agg(x order by lower(x) collate "C", x collate "C"), '{}') into res from unnest(outl) as x;
  return res;
end $$;

-- A profile card: the coach profile and its intake answers (only the fields
-- given; an empty answer clears a choice), and or one gym, new or edited. A
-- gym's equipment may be changed by add_equipment and remove_equipment,
-- applied to the list as it is at Accept (a whole "equipment" list on an older
-- card still replaces the list). The rest is as in stage 4D.
create or replace function app.accept_profile(me uuid, pl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  f jsonb := pl -> 'profile';
  g jsonb := pl -> 'gym';
  v_gym uuid;
  gy public.gyms;
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
              app.gym_equipment_after(
                case when g ? 'equipment' then coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}') else '{}'::text[] end,
                g -> 'add_equipment', g -> 'remove_equipment'),
              coalesce(g ->> 'notes', ''))
      returning id into v_gym;
      made := true;
    else
      select * into gy from public.gyms x where x.id = v_gym and x.user_id = me for update;
      if not found then
        raise exception 'The gym this card edits is not in your gyms.' using errcode = 'CI001';
      end if;
      if gy.archived_at is not null then
        raise exception 'The gym this card edits has been removed.' using errcode = 'CI001';
      end if;
      -- Adds and removes are applied to the list as it is now, not as it was
      -- when the card was made, so an item added since is never lost.
      update public.gyms x set
        name = case when g ? 'name' then left(btrim(g ->> 'name'), 80) else x.name end,
        equipment = app.gym_equipment_after(
          case when g ? 'equipment' then coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}') else coalesce(x.equipment, '{}') end,
          g -> 'add_equipment', g -> 'remove_equipment'),
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
