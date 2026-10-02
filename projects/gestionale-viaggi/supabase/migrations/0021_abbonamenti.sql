-- ============================================================================
-- 0021 — Abbonamenti: piani, limiti, scadenza
--
-- I limiti si applicano dove si applicano tutti gli altri permessi di questo
-- schema: dentro `can_write`, che e' la porta da cui passa ogni policy di
-- scrittura. Metterli nell'applicazione vorrebbe dire fidarsi del fatto che
-- nessuno scriva mai una query nuova senza ricordarsene.
-- ============================================================================

do $$ begin
  create type app.subscription_status as enum (
    'prova',      -- periodo di prova in corso
    'attivo',     -- abbonamento pagato e corrente
    'scaduto',    -- periodo finito: sola lettura
    'annullato'   -- disdetto: sola lettura
  );
exception when duplicate_object then null; end $$;

-- --- I piani -----------------------------------------------------------------

create table if not exists public.plans (
  code            text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name            text not null check (length(btrim(name)) between 2 and 60),
  description     text,
  -- Il prezzo e' una decisione commerciale, non tecnica: nasce nullo e lo
  -- scrive chi vende. Un prezzo inventato nel codice e' peggio di nessun
  -- prezzo, perche' sembra una scelta.
  price_cents     bigint check (price_cents is null or price_cents >= 0),
  -- null = nessun limite.
  max_users       integer check (max_users is null or max_users > 0),
  max_bookings    integer check (max_bookings is null or max_bookings > 0),
  trial_days      integer not null default 0 check (trial_days >= 0),
  sort_order      integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.plans enable row level security;

-- I piani non sono un segreto: chiunque sia dentro il gestionale puo' leggerli,
-- e servono alla scheda «Abbonamento» di ogni agenzia.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated using (true);

insert into public.plans (code, name, description, max_users, max_bookings, trial_days, sort_order)
values
  ('prova', 'Prova', 'Trenta giorni per capire se fa al caso vostro. Nessun limite.', null, null, 30, 0),
  ('base', 'Base', 'Per un''agenzia con un paio di operatori.', 3, 500, 0, 1),
  ('completo', 'Completo', 'Nessun limite di utenti né di pratiche.', null, null, 0, 2)
on conflict (code) do nothing;

-- --- L'abbonamento dell'agenzia ----------------------------------------------

create table if not exists public.subscriptions (
  agency_id           uuid primary key references public.agencies (id) on delete cascade,
  plan_code           text not null references public.plans (code) on delete restrict,
  status              app.subscription_status not null default 'prova',
  -- Fino a quando l'agenzia puo' scrivere. Null vuol dire «senza scadenza»,
  -- che serve a chi il gestionale se l'e' comprato e non lo affitta.
  valid_until         date,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

alter table public.subscriptions enable row level security;

-- L'agenzia legge il proprio abbonamento: deve poter sapere quando scade senza
-- doverlo chiedere. Scriverlo, no.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (agency_id in (select app.current_agency_ids()) or app.is_platform_admin());

/**
 * L'abbonamento di un'agenzia, con il piano gia' risolto.
 *
 * `security definer` per lo stesso motivo di `agency_suspended`: la chiamano
 * le funzioni di permesso, che girano dentro le policy.
 */
create or replace function app.subscription_of(p_agency_id uuid)
returns table (
  plan_code text,
  status app.subscription_status,
  valid_until date,
  max_users integer,
  max_bookings integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.plan_code, s.status, s.valid_until, p.max_users, p.max_bookings
  from public.subscriptions s
  join public.plans p on p.code = s.plan_code
  where s.agency_id = p_agency_id;
$$;

/**
 * Vero se l'abbonamento impedisce di scrivere.
 *
 * Un'agenzia senza riga di abbonamento scrive: il gestionale installato per
 * una sola agenzia non ha abbonamenti, e non deve smettere di funzionare
 * perche' una tabella e' vuota.
 */
create or replace function app.subscription_blocks(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.agency_id = p_agency_id
      and (
        s.status in ('scaduto', 'annullato')
        or (s.valid_until is not null and s.valid_until < current_date)
      )
  );
$$;

-- --- I limiti del piano ------------------------------------------------------

/**
 * Il limite di utenti e quello di pratiche, applicati dove si applica tutto il
 * resto: in un trigger sul database.
 *
 * Nell'applicazione sarebbe piu' facile da scrivere e piu' facile da
 * dimenticare: basterebbe una query nuova, un'importazione, uno script di
 * manutenzione. Qui il limite vale per chiunque scriva, comunque scriva.
 */
create or replace function app.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_attuali integer;
begin
  if tg_table_name = 'memberships' then
    select max_users into v_limite from app.subscription_of(new.agency_id);
    if v_limite is null then return new; end if;
    select count(*) into v_attuali
      from public.memberships m
     where m.agency_id = new.agency_id and m.deleted_at is null and m.is_active;
    if v_attuali >= v_limite then
      raise exception 'Il piano dell''agenzia prevede al massimo % utenti attivi', v_limite
        using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'bookings' then
    select max_bookings into v_limite from app.subscription_of(new.agency_id);
    if v_limite is null then return new; end if;
    select count(*) into v_attuali
      from public.bookings b
     where b.agency_id = new.agency_id
       and b.deleted_at is null
       and date_part('year', b.created_at) = date_part('year', now());
    if v_attuali >= v_limite then
      raise exception 'Il piano dell''agenzia prevede al massimo % pratiche all''anno', v_limite
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_plan_limit on public.memberships;
create trigger memberships_plan_limit
  before insert on public.memberships
  for each row execute function app.enforce_plan_limits();

drop trigger if exists bookings_plan_limit on public.bookings;
create trigger bookings_plan_limit
  before insert on public.bookings
  for each row execute function app.enforce_plan_limits();

-- --- La scadenza ferma la scrittura, come la sospensione ---------------------

create or replace function app.can_write(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo', 'operatore')
     and not app.agency_suspended(p_agency_id)
     and not app.subscription_blocks(p_agency_id);
$$;

create or replace function app.can_manage_accounting(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo')
     and not app.agency_suspended(p_agency_id)
     and not app.subscription_blocks(p_agency_id);
$$;

create or replace function app.is_owner(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) = 'titolare'
     and not app.agency_suspended(p_agency_id)
     and not app.subscription_blocks(p_agency_id);
$$;

-- --- L'azione di chi amministra ----------------------------------------------

/**
 * La scrittura vera dell'abbonamento, senza controlli su chi chiama.
 *
 * Non è esposta: la chiamano le due funzioni sotto, che i controlli li fanno.
 * Sta a parte perché il corpo è lo stesso — e due copie della stessa scrittura
 * divergono il giorno in cui una sola delle due viene corretta.
 */
create or replace function app.write_subscription(
  p_agency_id uuid,
  p_plan_code text,
  p_status app.subscription_status,
  p_valid_until date,
  p_note text,
  p_actor uuid,
  p_origine text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where code = p_plan_code and active) then
    raise exception 'Piano non valido';
  end if;
  if not exists (select 1 from public.agencies where id = p_agency_id and deleted_at is null) then
    raise exception 'Agenzia non trovata';
  end if;

  insert into public.subscriptions (agency_id, plan_code, status, valid_until, note, updated_by)
  values (p_agency_id, p_plan_code, p_status, p_valid_until, p_note, p_actor)
  on conflict (agency_id) do update
    set plan_code = excluded.plan_code,
        status = excluded.status,
        valid_until = excluded.valid_until,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.activity_log (agency_id, actor_id, action, entity_type, entity_id, summary)
  values (p_agency_id, p_actor, 'modifica', 'agencies', p_agency_id,
          'Abbonamento aggiornato' || p_origine || ': piano ' || p_plan_code ||
          ', stato ' || p_status::text ||
          coalesce(', valido fino al ' || to_char(p_valid_until, 'DD/MM/YYYY'), ', senza scadenza'));
end;
$$;

create or replace function public.set_subscription(
  p_agency_id uuid,
  p_plan_code text,
  p_status app.subscription_status,
  p_valid_until date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Non sei un amministratore della piattaforma';
  end if;
  perform app.write_subscription(
    p_agency_id, p_plan_code, p_status, p_valid_until, p_note, auth.uid(), ''
  );
end;
$$;

/**
 * La stessa scrittura, per il webhook del fornitore di pagamenti.
 *
 * Il webhook non ha un utente: si autentica con la firma HMAC del corpo e poi
 * parla al database con la chiave di servizio. Questa funzione è l'unica cosa
 * che quella chiave può fare sugli abbonamenti, ed è revocata a tutti gli
 * altri ruoli — `authenticated` compreso, che altrimenti avrebbe trovato qui
 * un modo per regalarsi un piano.
 */
create or replace function public.set_subscription_as_service(
  p_agency_id uuid,
  p_plan_code text,
  p_status app.subscription_status,
  p_valid_until date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.write_subscription(
    p_agency_id, p_plan_code, p_status, p_valid_until, p_note, null,
    ' dal fornitore di pagamenti'
  );
end;
$$;

grant execute on function public.set_subscription(uuid, text, app.subscription_status, date, text) to authenticated;
revoke all on function public.set_subscription_as_service(uuid, text, app.subscription_status, date, text)
  from public, anon, authenticated;
grant execute on function public.set_subscription_as_service(uuid, text, app.subscription_status, date, text)
  to service_role;
grant execute on function app.subscription_of(uuid) to authenticated;
grant select on public.plans, public.subscriptions to authenticated;

-- La vista della piattaforma porta anche l'abbonamento.
create or replace view public.platform_agencies
with (security_invoker = on) as
select
  a.id,
  a.name,
  a.vat_number,
  a.city,
  a.province,
  a.created_at,
  a.suspended_at,
  a.suspension_reason,
  a.deleted_at,
  s.members,
  s.customers,
  s.bookings,
  s.invoices,
  s.last_activity,
  sub.plan_code,
  sub.status as subscription_status,
  sub.valid_until
from public.agencies a
cross join lateral app.platform_counts(a.id) s
left join public.subscriptions sub on sub.agency_id = a.id
where app.is_platform_admin();
