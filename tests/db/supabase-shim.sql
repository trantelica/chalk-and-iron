-- A stand-in for the parts of Supabase the migrations rely on, so the
-- database tests run on a local in-memory Postgres (PGlite) with no account.
-- Mirrors Supabase: auth.users, auth.sessions, auth.uid(), auth.jwt(), and the
-- roles anon, authenticated and service_role (which skips row-level security).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
