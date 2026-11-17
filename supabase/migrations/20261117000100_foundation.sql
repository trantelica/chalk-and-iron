-- Chalk and Iron, Phase 1 foundation schema.
-- Follows docs/TECHNICAL_DESIGN.md Section 2 (tables), Section 3 (what a coach
-- may write) and Section 4 (keeping one user's data from another's).
--
-- Plain-language summary for Nathan:
--   * Every table has an owner column (user_id). The database itself only
--     hands a signed-in person their own rows ("row-level security").
--   * Links between records always include the owner, so one person's
--     workout can never point at another person's exercise.
--   * A coach sign-in can read, and can add proposals. Nothing else.
--   * Admin actions run through a few guarded functions that touch account
--     details only, never training data.
--
-- Written for Supabase (Postgres 15 or later). It relies on Supabase's own
-- auth schema: auth.users, auth.uid() and auth.jwt(), and the roles anon,
-- authenticated and service_role.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------

-- True when the caller's sign-in is a coach pass (an OAuth token issued to
-- ChatGPT, Claude or another coach app) rather than the app's own sign-in.
-- Supabase's OAuth server puts the client's id in the token's client_id claim.
-- This is the single place that decides it, so if the sign-in proof finds a
-- different claim, only this function changes.
create or replace function app.is_coach() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(auth.jwt() ->> 'client_id', ''), null) is not null
$$;

-- ---------------------------------------------------------------------------
-- Account and profile
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null check (length(display_name) between 1 and 80),
  totals_unit text not null default 'lb' check (totals_unit in ('lb', 'kg')),
  time_zone text not null default 'America/Denver',
  skin text not null default 'chalk' check (skin in ('chalk', 'arcade', 'liquid')),
  accent text check (accent in ('ember', 'purple', 'pink', 'crimson', 'blue', 'yellow', 'green')),
  background text not null default 'flat' check (background in ('flat', 'steel', 'board')),
  skins_available text[] not null default array['chalk', 'arcade', 'liquid'],
  coach_link text check (coach_link is null or coach_link ~ '^https://'),
  is_admin boolean not null default false,
  account_status text not null default 'active' check (account_status in ('active', 'inactive')),
  setup_done text[] not null default '{}',
  delete_requested_at timestamptz,
  delete_requested_by uuid,
  reset_notice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skin_is_available check (skin = any (skins_available))
);
create unique index profiles_email_key on public.profiles (lower(email));

-- The caller's user id, but only while their account is active. Every
-- row-level rule below uses this, so a deactivated account (and its coach
-- connection) sees nothing at all.
create or replace function app.current_uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active'
$$;

-- The caller may change data: an active account using the app's own sign-in.
create or replace function app.can_write_uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app.is_coach() then null else app.current_uid() end
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p
                   where p.id = app.can_write_uid()), false)
$$;

grant execute on function app.is_coach(), app.current_uid(), app.can_write_uid(), app.is_admin()
  to authenticated, service_role;

create table public.coach_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  goals text not null default '',
  injuries_and_limits text not null default '',
  weekly_schedule text not null default '',
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  equipment text[] not null default '{}',
  notes text not null default '',
  is_default boolean not null default false,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index gyms_one_default on public.gyms (user_id) where is_default;

-- Single-use links: invites for new people, and resets for locked-out people.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  purpose text not null check (purpose in ('invite', 'reset')),
  for_user uuid references public.profiles (id) on delete cascade,
  label text not null default '',
  grants_admin boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  check ((purpose = 'reset') = (for_user is not null))
);

-- Passkeys (Face ID or Touch ID) are kept by Supabase's own sign-in service
-- (its native passkey support), not in a table of ours. See
-- proofs/connector-signin/README.md.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  device_label text not null default '',
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

create table public.vocabulary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('muscle_group', 'focus', 'equipment')),
  name text not null check (length(name) between 1 and 60),
  parent_id uuid,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.vocabulary_terms (id, user_id) on delete cascade,
  check ((kind = 'focus') = (parent_id is not null))
);
-- Focus values are unique within their muscle group; the others per kind.
create unique index vocabulary_unique_name on public.vocabulary_terms
  (user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  muscle_group_id uuid,
  focus_id uuid,
  equipment_id uuid,
  default_unit text not null check (default_unit in ('lb', 'kg', 'bw')),
  work_seconds integer not null default 45 check (work_seconds between 5 and 600),
  rest_seconds integer not null default 120 check (rest_seconds between 0 and 600),
  note text not null default '',
  created_via text not null check (created_via in ('starter', 'planner', 'swap', 'proposal')),
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (muscle_group_id, user_id) references public.vocabulary_terms (id, user_id),
  foreign key (focus_id, user_id) references public.vocabulary_terms (id, user_id),
  foreign key (equipment_id, user_id) references public.vocabulary_terms (id, user_id),
  -- Only an exercise made by a swap may lack a muscle group or equipment.
  check (created_via = 'swap' or (muscle_group_id is not null and equipment_id is not null))
);
create unique index exercises_live_name on public.exercises (user_id, lower(name)) where archived_at is null;

create table public.exercise_display_units (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null,
  unit text not null check (unit in ('lb', 'kg')),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

create table public.exercise_alternates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null,
  tier text not null check (tier in ('bodyweight', 'basic_gym', 'full_gym')),
  name text not null check (length(name) between 1 and 120),
  alternate_exercise_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, tier),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade,
  foreign key (alternate_exercise_id, user_id) references public.exercises (id, user_id)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.workout_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid not null,
  position integer not null check (position >= 0),
  exercise_id uuid not null,
  sets integer not null check (sets between 1 and 12),
  reps integer not null check (reps between 1 and 50),
  rest_seconds integer check (rest_seconds between 0 and 600),
  superset_letter text check (superset_letter ~ '^[A-Z]$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, workout_id),
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id)
);
create index workout_items_by_workout on public.workout_items (workout_id, position);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  start_date date not null,
  week_count integer not null check (week_count between 1 and 6),
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index campaigns_one_active on public.campaigns (user_id) where status = 'active';

create table public.campaign_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null,
  blank_week_starts_on date not null check (extract(isodow from blank_week_starts_on) = 1),
  made_by text not null check (made_by = 'user' or made_by ~ '^proposal:'),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, user_id) references public.campaigns (id, user_id) on delete cascade
);

create table public.campaign_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null,
  week integer not null check (week between 1 and 6),
  weekday integer not null check (weekday between 1 and 7),
  workout_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, workout_id),
  unique (campaign_id, week, weekday),
  foreign key (campaign_id, user_id) references public.campaigns (id, user_id) on delete cascade,
  foreign key (workout_id, user_id) references public.workouts (id, user_id)
);

create table public.campaign_day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_day_id uuid not null,
  workout_id uuid not null,
  workout_item_id uuid not null,
  exercise_id uuid,
  sets integer check (sets between 1 and 12),
  reps integer check (reps between 1 and 50),
  weight_lb numeric(10, 3) check (weight_lb >= 0),
  weight_entered_value numeric(10, 3) check (weight_entered_value >= 0),
  weight_entered_unit text check (weight_entered_unit in ('lb', 'kg')),
  rest_seconds integer check (rest_seconds between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_day_id, workout_item_id),
  foreign key (campaign_day_id, user_id) references public.campaign_days (id, user_id) on delete cascade,
  -- The override's item must belong to the workout that day uses: both links
  -- carry the same workout_id, so a mismatch is refused by the database.
  foreign key (campaign_day_id, workout_id) references public.campaign_days (id, workout_id) on delete cascade on update cascade,
  foreign key (workout_item_id, workout_id) references public.workout_items (id, workout_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id),
  check ((weight_lb is null) = (weight_entered_value is null) and (weight_lb is null) = (weight_entered_unit is null))
);

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------

create table public.today_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  source_kind text not null check (source_kind in ('campaign_day', 'workout')),
  campaign_day_id uuid,
  workout_id uuid,
  plan jsonb not null,
  made_by text not null check (made_by = 'user' or made_by ~ '^proposal:'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (campaign_day_id, user_id) references public.campaign_days (id, user_id) on delete set null (campaign_day_id),
  foreign key (workout_id, user_id) references public.workouts (id, user_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  source_kind text not null check (source_kind in ('campaign_day', 'ad_hoc')),
  campaign_day_id uuid,
  workout_id uuid,
  workout_name text not null,
  gym_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'finished')),
  finish_reason text check (finish_reason in ('user', 'auto', 'replaced')),
  clock_banked_seconds integer not null default 0 check (clock_banked_seconds >= 0),
  clock_running_since timestamptz,
  rest_ends_at timestamptz,
  rest_total_seconds integer check (rest_total_seconds >= 0),
  current_session_exercise_id uuid,
  last_activity_at timestamptz not null default now(),
  split_from_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (campaign_day_id, user_id) references public.campaign_days (id, user_id) on delete set null (campaign_day_id),
  foreign key (workout_id, user_id) references public.workouts (id, user_id),
  foreign key (gym_id, user_id) references public.gyms (id, user_id),
  foreign key (split_from_session_id, user_id) references public.sessions (id, user_id),
  check ((status = 'finished') = (ended_at is not null)),
  check ((status = 'finished') = (finish_reason is not null))
);
create unique index sessions_one_active on public.sessions (user_id) where status = 'active';
create index sessions_by_date on public.sessions (user_id, local_date);

create table public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  position integer not null check (position >= 0),
  superset_letter text check (superset_letter ~ '^[A-Z]$'),
  time_budget_seconds integer not null check (time_budget_seconds >= 0),
  clock_started_at timestamptz,
  clock_banked_seconds integer not null default 0 check (clock_banked_seconds >= 0),
  clock_running_since timestamptz,
  clock_stopped_at timestamptz,
  broken_at timestamptz,
  broken_from_block_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (broken_from_block_id, user_id) references public.session_blocks (id, user_id)
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  block_id uuid not null,
  exercise_id uuid not null,
  exercise_name_then text not null,
  position_in_block integer not null default 0 check (position_in_block >= 0),
  planned_set_types text[] not null check (cardinality(planned_set_types) between 1 and 24
    and planned_set_types <@ array['warm_up', 'working', 'drop']),
  planned_reps integer not null check (planned_reps between 1 and 50),
  planned_weight_lb numeric(10, 3) check (planned_weight_lb >= 0),
  planned_weight_entered_value numeric(10, 3),
  planned_weight_entered_unit text check (planned_weight_entered_unit in ('lb', 'kg')),
  seed_weights_lb numeric(10, 3)[],
  planned_rest_seconds integer not null check (planned_rest_seconds between 0 and 600),
  work_seconds integer not null check (work_seconds between 5 and 600),
  state text not null default 'open' check (state in ('open', 'done', 'skipped', 'replaced')),
  origin text not null default 'plan' check (origin in ('plan', 'added', 'swap', 'proposal')),
  swapped_from_exercise_id uuid,
  sets_before_break integer check (sets_before_break >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (block_id, user_id) references public.session_blocks (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id),
  foreign key (swapped_from_exercise_id, user_id) references public.exercises (id, user_id)
);

alter table public.sessions
  add foreign key (current_session_exercise_id, user_id)
  references public.session_exercises (id, user_id) on delete set null (current_session_exercise_id)
  deferrable initially deferred;

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_exercise_id uuid not null,
  set_number integer not null check (set_number between 1 and 24),
  weight_lb numeric(10, 3) check (weight_lb >= 0),
  entered_value numeric(10, 3) not null check (entered_value >= 0),
  entered_unit text not null check (entered_unit in ('lb', 'kg', 'bw')),
  reps integer not null check (reps between 1 and 500),
  set_type text not null default 'working' check (set_type in ('warm_up', 'working', 'drop')),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  logged_at timestamptz not null,
  record_types text[] not null default '{}' check (record_types <@ array['heaviest', '6_plus', '10_plus', '20_plus', 'most_reps']),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_exercise_id, user_id) references public.session_exercises (id, user_id) on delete cascade,
  -- A bodyweight set is 1 BW and has no pounds value. Any other set has one.
  check ((entered_unit = 'bw') = (weight_lb is null)),
  check (entered_unit <> 'bw' or entered_value = 1),
  -- A warm-up set never holds a record.
  check (set_type <> 'warm_up' or record_types = '{}')
);
create unique index set_logs_one_per_number on public.set_logs (session_exercise_id, set_number) where deleted_at is null;

create table public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  type text not null check (length(type) between 1 and 60),
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  distance numeric(10, 3) check (distance >= 0),
  distance_unit text check (distance_unit in ('mi', 'km', 'm')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((distance is null) = (distance_unit is null))
);

-- ---------------------------------------------------------------------------
-- Coach
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (length(source) between 1 and 80),
  kind text not null check (kind in ('exercise', 'workout', 'campaign', 'today_change', 'profile_update')),
  applies_to text not null check (applies_to in ('today', 'library', 'campaign', 'profile')),
  summary_lines text[] not null check (cardinality(summary_lines) between 1 and 20),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'out_of_date', 'expired')),
  expires_at timestamptz,
  request_hash text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  result jsonb,
  unique (id, user_id),
  check ((status = 'pending') = (decided_at is null) or status in ('out_of_date', 'expired'))
);
create index proposals_by_user on public.proposals (user_id, created_at desc);

create table public.proposal_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  proposal_id uuid not null,
  record_kind text not null check (record_kind in ('exercises', 'workouts', 'campaigns', 'coach_profiles', 'gyms', 'sessions', 'today_plans')),
  record_id uuid not null,
  version_seen integer,
  foreign key (proposal_id, user_id) references public.proposals (id, user_id) on delete cascade
);
create index proposal_targets_by_record on public.proposal_targets (record_kind, record_id);

create table public.connector_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_name text not null default '',
  tool text not null,
  ok boolean not null,
  called_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_user uuid references public.profiles (id) on delete set null,
  target_label text not null default '',
  invite_id uuid references public.invites (id) on delete set null,
  at timestamptz not null default now()
);

create table public.rest_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  fire_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);

create table public.received_changes (
  change_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rules kept by the database
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Library and profile records count their edits. An edit also makes any
-- pending proposal that targets the record out of date (design Section 5).
create or replace function app.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create or replace function app.mark_proposals_out_of_date(p_kind text, p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.proposals p set status = 'out_of_date'
  where p.status = 'pending'
    and p.user_id = coalesce(auth.uid(), p.user_id)
    and p.id in (select t.proposal_id from public.proposal_targets t
                 where t.record_kind = p_kind and t.record_id = p_id)
$$;

create or replace function app.after_versioned_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform app.mark_proposals_out_of_date(tg_table_name::text,
    case when tg_table_name = 'coach_profiles' then new.user_id else new.id end);
  return null;
end $$;

-- Changing a workout's rows, or a campaign's days and overrides, is an edit
-- to the workout or campaign.
create or replace function app.touch_parent_version() returns trigger
language plpgsql set search_path = '' as $$
declare
  r record := coalesce(new, old);
begin
  if tg_table_name = 'workout_items' then
    update public.workouts set version = version where id = r.workout_id;
  elsif tg_table_name = 'campaign_days' or tg_table_name = 'campaign_shifts' then
    update public.campaigns set version = version where id = r.campaign_id;
  elsif tg_table_name = 'campaign_day_overrides' then
    update public.campaigns set version = version
    where id = (select d.campaign_id from public.campaign_days d where d.id = r.campaign_day_id);
  elsif tg_table_name = 'exercise_alternates' then
    update public.exercises set version = version where id = r.exercise_id;
  end if;
  return null;
end $$;

-- A superset has two or three members, and every member has the same sets.
create or replace function app.check_workout_supersets(p_workout uuid) returns void
language plpgsql set search_path = '' as $$
declare
  bad record;
begin
  select superset_letter, count(*) as n, count(distinct sets) as set_counts into bad
  from public.workout_items
  where workout_id = p_workout and superset_letter is not null
  group by superset_letter
  having count(*) not between 2 and 3 or count(distinct sets) > 1
  limit 1;
  if found then
    raise exception 'Superset % must have two or three exercises with the same number of sets', bad.superset_letter
      using errcode = 'check_violation';
  end if;
end $$;

-- The same rule for one campaign day, with that day's set overrides applied.
create or replace function app.check_day_supersets(p_day uuid) returns void
language plpgsql set search_path = '' as $$
declare
  bad record;
begin
  select i.superset_letter into bad
  from public.campaign_days d
  join public.workout_items i on i.workout_id = d.workout_id
  left join public.campaign_day_overrides o on o.campaign_day_id = d.id and o.workout_item_id = i.id
  where d.id = p_day and i.superset_letter is not null
  group by i.superset_letter
  having count(distinct coalesce(o.sets, i.sets)) > 1
  limit 1;
  if found then
    raise exception 'Superset % on this day must keep the same number of sets for every exercise', bad.superset_letter
      using errcode = 'check_violation';
  end if;
end $$;

create or replace function app.workout_items_superset_trigger() returns trigger
language plpgsql set search_path = '' as $$
declare
  d record;
begin
  perform app.check_workout_supersets(coalesce(new.workout_id, old.workout_id));
  for d in select id from public.campaign_days where workout_id = coalesce(new.workout_id, old.workout_id) loop
    perform app.check_day_supersets(d.id);
  end loop;
  return null;
end $$;

create or replace function app.overrides_superset_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.campaign_days where id = coalesce(new.campaign_day_id, old.campaign_day_id)) then
    perform app.check_day_supersets(coalesce(new.campaign_day_id, old.campaign_day_id));
  end if;
  return null;
end $$;

-- A day may not sit in a week past the campaign's length.
create or replace function app.check_day_week() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.week > (select c.week_count from public.campaigns c where c.id = new.campaign_id) then
    raise exception 'Week % is past the end of this campaign', new.week using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Changing a day's workout removes that day's overrides, as the prototype does.
-- The override rows follow the day's workout_id by cascade, so they are
-- removed first, before the cascade could point them at the new workout.
create or replace function app.clear_overrides_on_workout_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workout_id is distinct from old.workout_id then
    delete from public.campaign_day_overrides where campaign_day_id = old.id;
  end if;
  return new;
end $$;

-- Exercises point at vocabulary terms of the right kind; a focus value must
-- belong to the exercise's muscle group.
create or replace function app.check_exercise_vocabulary() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.muscle_group_id is not null and not exists (
       select 1 from public.vocabulary_terms where id = new.muscle_group_id and kind = 'muscle_group') then
    raise exception 'Muscle group must be a muscle group term' using errcode = 'check_violation';
  end if;
  if new.equipment_id is not null and not exists (
       select 1 from public.vocabulary_terms where id = new.equipment_id and kind = 'equipment') then
    raise exception 'Equipment must be an equipment term' using errcode = 'check_violation';
  end if;
  if new.focus_id is not null and not exists (
       select 1 from public.vocabulary_terms
       where id = new.focus_id and kind = 'focus' and parent_id is not distinct from new.muscle_group_id) then
    raise exception 'Focus must be a focus value of the exercise''s muscle group' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A vocabulary term in use is archived, never deleted (spec Section 10).
create or replace function app.block_delete_of_used_term() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A deeper trigger level means this delete is a knock-on effect of removing
  -- a whole account (or a muscle group whose focus values go with it, which is
  -- itself checked one level up), so it is allowed.
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.exercises e
             where e.muscle_group_id = old.id or e.focus_id = old.id or e.equipment_id = old.id) then
    raise exception 'This value is used by an exercise. Archive it instead of deleting it.'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

-- Updated-at stamps.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'vocabulary_terms', 'exercise_alternates', 'workout_items', 'campaign_days',
                           'campaign_day_overrides', 'sessions', 'session_blocks', 'session_exercises',
                           'set_logs', 'cardio_logs', 'exercise_display_units'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['coach_profiles', 'gyms', 'exercises', 'workouts', 'campaigns'] loop
    execute format('create trigger bump_version before update on public.%I for each row execute function app.bump_version()', t);
    execute format('create trigger after_versioned_edit after update on public.%I for each row execute function app.after_versioned_edit()', t);
  end loop;
  foreach t in array array['workout_items', 'campaign_days', 'campaign_shifts', 'campaign_day_overrides', 'exercise_alternates'] loop
    execute format('create trigger touch_parent_version after insert or update or delete on public.%I for each row execute function app.touch_parent_version()', t);
  end loop;
end $$;

create constraint trigger workout_items_supersets
  after insert or update or delete on public.workout_items
  deferrable initially deferred
  for each row execute function app.workout_items_superset_trigger();

create constraint trigger overrides_supersets
  after insert or update or delete on public.campaign_day_overrides
  deferrable initially deferred
  for each row execute function app.overrides_superset_trigger();

create trigger check_day_week before insert or update on public.campaign_days
  for each row execute function app.check_day_week();

create trigger clear_overrides_on_workout_change before update of workout_id on public.campaign_days
  for each row execute function app.clear_overrides_on_workout_change();

create trigger check_exercise_vocabulary before insert or update on public.exercises
  for each row execute function app.check_exercise_vocabulary();

create trigger block_delete_of_used_term before delete on public.vocabulary_terms
  for each row execute function app.block_delete_of_used_term();

-- ---------------------------------------------------------------------------
-- Row-level security: each person sees and changes only their own rows
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;

alter table public.profiles enable row level security;
create policy own_profile_read on public.profiles for select to authenticated
  using (id = (select app.current_uid()));
create policy own_profile_edit on public.profiles for update to authenticated
  using (id = (select app.can_write_uid())) with check (id = (select app.can_write_uid()));
grant select on public.profiles to authenticated;
-- Only these profile fields are the person's own to change. Admin status,
-- account status, the skin gate and deletion go through guarded functions.
grant update (display_name, totals_unit, time_zone, skin, accent, background, coach_link, setup_done)
  on public.profiles to authenticated;

-- Tables a person owns outright: read their own, change their own, and a
-- coach sign-in may only read.
do $$
declare
  t text;
  can_delete boolean;
begin
  foreach t in array array['coach_profiles', 'gyms', 'push_subscriptions', 'vocabulary_terms', 'exercises',
                           'exercise_display_units', 'exercise_alternates', 'workouts', 'workout_items',
                           'campaigns', 'campaign_shifts', 'campaign_days', 'campaign_day_overrides',
                           'today_plans', 'sessions', 'session_blocks', 'session_exercises', 'set_logs',
                           'cardio_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows_read on public.%I for select to authenticated using (user_id = (select app.current_uid()))', t);
    execute format('create policy own_rows_insert on public.%I for insert to authenticated with check (user_id = (select app.can_write_uid()))', t);
    execute format('create policy own_rows_update on public.%I for update to authenticated using (user_id = (select app.can_write_uid())) with check (user_id = (select app.can_write_uid()))', t);
    -- Exercises and workouts are archived, never deleted. Set logs are
    -- deleted by marking them (deleted_at), so a late copy cannot revive one.
    can_delete := t not in ('exercises', 'workouts', 'set_logs', 'coach_profiles');
    if can_delete then
      execute format('create policy own_rows_delete on public.%I for delete to authenticated using (user_id = (select app.can_write_uid()))', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- Proposals: a coach may add one, as pending, and nothing else. The person
-- decides it later through the app (Phase 4 adds the guarded Accept step).
alter table public.proposals enable row level security;
create policy own_proposals_read on public.proposals for select to authenticated
  using (user_id = (select app.current_uid()));
create policy add_pending_proposal on public.proposals for insert to authenticated
  with check (user_id = (select app.current_uid()) and status = 'pending'
              and decided_at is null and result is null);
grant select, insert (user_id, source, kind, applies_to, summary_lines, payload, expires_at, request_hash)
  on public.proposals to authenticated;

alter table public.proposal_targets enable row level security;
create policy own_targets_read on public.proposal_targets for select to authenticated
  using (user_id = (select app.current_uid()));
create policy add_targets_to_pending on public.proposal_targets for insert to authenticated
  with check (user_id = (select app.current_uid())
              and exists (select 1 from public.proposals p
                          where p.id = proposal_id and p.user_id = (select app.current_uid())
                            and p.status = 'pending'));
grant select, insert on public.proposal_targets to authenticated;

-- The connector notes each call it answers (no content), for "last used".
alter table public.connector_calls enable row level security;
create policy own_calls_read on public.connector_calls for select to authenticated
  using (user_id = (select app.current_uid()));
create policy add_own_call on public.connector_calls for insert to authenticated
  with check (user_id = (select app.current_uid()));
grant select, insert on public.connector_calls to authenticated;

-- Server-only tables: no access for signed-in people at all. Admins reach
-- invites and admin_actions only through the functions below.
alter table public.invites enable row level security;
alter table public.admin_actions enable row level security;
alter table public.rest_alerts enable row level security;
alter table public.received_changes enable row level security;

grant all on all tables in schema public to service_role;
grant all on all tables in schema app to service_role;
