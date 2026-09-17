-- =============================================================================
-- Shim per lo sviluppo e i test su un Postgres locale.
-- Su Supabase queste entita' esistono gia': questo file NON e' una migrazione e
-- non viene mai applicato all'ambiente reale (vive fuori da supabase/migrations).
-- =============================================================================

create schema if not exists auth;

-- Le colonne riproducono quelle usate dal seed su Supabase, cosi' lo stesso
-- seed.sql funziona sia in locale sia sul progetto reale.
create table if not exists auth.users (
  instance_id             uuid,
  id                      uuid primary key default gen_random_uuid(),
  aud                     text default 'authenticated',
  role                    text default 'authenticated',
  email                   text unique,
  encrypted_password      text,
  email_confirmed_at      timestamptz,
  raw_app_meta_data       jsonb not null default '{}'::jsonb,
  raw_user_meta_data      jsonb not null default '{}'::jsonb,
  confirmation_token      text default '',
  recovery_token          text default '',
  email_change            text default '',
  email_change_token_new  text default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Riproduce il comportamento di Supabase: l'identita' arriva dai claim JWT
-- impostati sulla connessione (set_config('request.jwt.claims', ...)).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    'anon'
  );
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select u.email from auth.users u where u.id = auth.uid();
$$;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
