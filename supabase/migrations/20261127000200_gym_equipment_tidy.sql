-- Chalk and Iron, Phase 4, follow-up to 20261127000100 (27 November 2026),
-- from the fresh Opus 5.5 check of the gym equipment change.
--
-- Plain-language summary for Nate: two small tidy-ups to the step that
-- applies a coach's profile and gym card. A card that does not touch a gym's
-- equipment (for example one that only renames the gym, changes its notes or
-- makes it the default) now leaves the equipment list exactly as it is,
-- instead of re-sorting it. And the helper that works out a gym's new list is
-- closed to direct calls, like every other helper of its kind; it is still
-- used by Accept. Nothing is deleted or reshaped. Safe to run more than once,
-- before or after the pull request is merged.

-- A profile card: the coach profile and its intake answers (only the fields
-- given; an empty answer clears a choice), and or one gym, new or edited. A
-- gym's equipment may be changed by add_equipment and remove_equipment,
-- applied to the list as it is at Accept (a whole "equipment" list on an older
-- card still replaces the list); a card with none of these leaves the list as
-- it is. The rest is as in stage 4D.
create or replace function app.accept_profile(me uuid, pl jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  f jsonb := pl -> 'profile';
  g jsonb := pl -> 'gym';
  v_gym uuid;
  gy public.gyms;
  made boolean := false;
  touches_list boolean;
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
    touches_list := g ? 'equipment' or g ? 'add_equipment' or g ? 'remove_equipment';
    v_gym := nullif(g ->> 'gym_id', '')::uuid;
    if v_gym is null then
      if coalesce(btrim(g ->> 'name'), '') = '' then
        raise exception 'A new gym on this card has no name.' using errcode = 'CI001';
      end if;
      insert into public.gyms (user_id, name, equipment, notes)
      values (me, left(btrim(g ->> 'name'), 80),
              case when touches_list then app.gym_equipment_after(
                case when g ? 'equipment' then coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}') else '{}'::text[] end,
                g -> 'add_equipment', g -> 'remove_equipment') else '{}'::text[] end,
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
      -- when the card was made, so an item added since is never lost. A card
      -- that does not touch the list leaves it exactly as it is.
      update public.gyms x set
        name = case when g ? 'name' then left(btrim(g ->> 'name'), 80) else x.name end,
        equipment = case when not touches_list then x.equipment else app.gym_equipment_after(
          case when g ? 'equipment' then coalesce(array(select jsonb_array_elements_text(g -> 'equipment')), '{}') else coalesce(x.equipment, '{}') end,
          g -> 'add_equipment', g -> 'remove_equipment') end,
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

-- Who may call what: like every other Accept helper (stage 4D, section 7),
-- only the database's own steps call these; a person or a coach cannot.
revoke all on function app.gym_equipment_after(text[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function app.accept_profile(uuid, jsonb) from public, anon, authenticated;
