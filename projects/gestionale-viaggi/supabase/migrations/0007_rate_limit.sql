-- =============================================================================
-- 0007 — Limitazione delle richieste sulle rotte pubbliche (login, magic link,
--        recupero password, accettazione preventivo).
--
-- Il contatore vive sul database e non in memoria: su Vercel ogni richiesta puo'
-- essere servita da un'istanza diversa, quindi un limitatore in memoria non
-- limiterebbe nulla.
--
-- Questa e' l'unica tabella senza agency_id: nasce per essere interrogata PRIMA
-- che esista un'identita' e quindi un tenant.
-- =============================================================================

create table if not exists public.rate_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table public.rate_limits is 'Finestra scorrevole per il rate limiting delle rotte pubbliche.';

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- Nessuna policy: si accede solo tramite la funzione security definer qui sotto.

-- Ritorna true se la richiesta e' ammessa, false se la soglia e' stata superata.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit integer default 10,
  p_window_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'Parametri di rate limiting non validi';
  end if;

  insert into public.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case
                 when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
                 else rl.hits + 1
               end,
        window_start = case
                         when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
                         else rl.window_start
                       end,
        updated_at = now()
  returning rl.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

comment on function public.check_rate_limit is
  'Finestra scorrevole per chiave (es. "accesso:1.2.3.4"): true se la richiesta puo procedere.';

-- Pulizia delle finestre esaurite, da richiamare da un cron o manualmente.
create or replace function public.purge_rate_limits(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(hours => p_older_than_hours);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated;
grant execute on function public.purge_rate_limits(integer) to service_role;
