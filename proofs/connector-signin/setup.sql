-- Chalk and Iron sign-in proof. Run once in the throwaway Supabase project's
-- SQL editor. It lets the proof show what the DATABASE sees for a pass, which
-- tests the design's claim that row-level security can tell a coach pass from
-- an app sign-in (Technical design, Section 10C).

-- 1. Who does the database think is calling?
create or replace function public.proof_whoami()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'user_id',      auth.uid(),
    'role',         auth.role(),
    'client_id',    auth.jwt() ->> 'client_id',
    'is_coach_pass', (auth.jwt() ->> 'client_id') is not null
  );
$$;

revoke all on function public.proof_whoami() from public, anon;
grant execute on function public.proof_whoami() to authenticated;

-- 2. A sample of the real rule, for reading only (no tool writes to it in this proof):
--    a user reads their own rows; only an app sign-in, never a coach pass, may write.
create table if not exists public.proof_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);
alter table public.proof_notes enable row level security;

drop policy if exists "read own notes" on public.proof_notes;
create policy "read own notes" on public.proof_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "app sign-in writes own notes" on public.proof_notes;
create policy "app sign-in writes own notes" on public.proof_notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null);
