-- ============================================================================
-- 0020 — Amministrazione della piattaforma
--
-- Chi vende il gestionale a più agenzie ha bisogno di vederle, sospenderle e
-- riattivarle senza aprire il database. Ha anche bisogno di *non* poter
-- leggere i dati delle agenzie: la promessa che ogni agenzia è isolata vale
-- solo se non esiste un ruolo che la scavalca, e un pannello di
-- amministrazione è il posto più naturale dove quella promessa si rompe.
--
-- Qui il confine è nello schema: l'amministratore vede una vista di soli
-- conteggi e anagrafica, e nessuna policy gli dà accesso a clienti, pratiche,
-- preventivi o fatture.
-- ============================================================================

-- --- Sospensione -------------------------------------------------------------

alter table public.agencies
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

/**
 * Vero se l'agenzia è sospesa.
 *
 * `security definer` perché la chiamano le funzioni di permesso, che girano
 * dentro le policy di `agencies`: leggere la tabella con la RLS accesa da lì
 * dentro sarebbe una ricorsione.
 */
create or replace function app.agency_suspended(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agencies a
    where a.id = p_agency_id and a.suspended_at is not null
  );
$$;

-- Una sospensione ferma la scrittura, non la lettura. Chi ha smesso di pagare
-- deve poter esportare i propri dati e riprenderli quando riprende: tenerglieli
-- in ostaggio è una leva che non serve a nessuno e che, sui dati fiscali di
-- un'azienda, è anche discutibile.
create or replace function app.can_write(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo', 'operatore')
     and not app.agency_suspended(p_agency_id);
$$;

create or replace function app.can_manage_accounting(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo')
     and not app.agency_suspended(p_agency_id);
$$;

create or replace function app.is_owner(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) = 'titolare'
     and not app.agency_suspended(p_agency_id);
$$;

-- --- Chi amministra la piattaforma -------------------------------------------

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

alter table public.platform_admins enable row level security;

/**
 * Vero se chi sta chiamando amministra la piattaforma.
 *
 * Non c'è modo di diventarlo dall'applicazione: la riga si inserisce con la
 * chiave di servizio o da SQL. È voluto — il primo amministratore di un
 * sistema non può crearselo da sé attraverso il sistema stesso.
 */
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());

-- --- Che cosa vede l'amministratore ------------------------------------------

/**
 * I conteggi di un'agenzia, senza una riga del suo contenuto.
 *
 * Deve essere `security definer`: la vista gira con i permessi di chi la
 * legge, e l'amministratore della piattaforma — giustamente — non ha accesso
 * a `customers` né a `bookings`. Senza questa funzione i conteggi tornerebbero
 * tutti zero, che è l'isolamento che funziona e un pannello che non serve.
 *
 * Il `where` in fondo è la serratura: fuori da un amministratore la funzione
 * non restituisce nessuna riga. Una funzione `security definer` senza
 * controllo è una porta di servizio lasciata aperta.
 */
create or replace function app.platform_counts(p_agency_id uuid)
returns table (
  members bigint,
  customers bigint,
  bookings bigint,
  invoices bigint,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.memberships m
      where m.agency_id = p_agency_id and m.deleted_at is null and m.is_active),
    (select count(*) from public.customers c
      where c.agency_id = p_agency_id and c.deleted_at is null),
    (select count(*) from public.bookings b
      where b.agency_id = p_agency_id and b.deleted_at is null),
    (select count(*) from public.invoices i
      where i.agency_id = p_agency_id and i.deleted_at is null),
    (select max(al.created_at) from public.activity_log al where al.agency_id = p_agency_id)
  where app.is_platform_admin();
$$;

/**
 * Le agenzie viste dalla piattaforma: anagrafica e conteggi, nient'altro.
 *
 * Nessun nome di cliente, nessun importo, nessuna destinazione. Sapere che
 * un'agenzia ha quarantasei pratiche serve a fatturarle l'abbonamento; sapere
 * di chi sono quelle pratiche non serve a niente, e il modo più sicuro di non
 * farlo trapelare è non metterlo nella vista.
 */
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
  s.last_activity
from public.agencies a
cross join lateral app.platform_counts(a.id) s
where app.is_platform_admin();

/** I membri di un'agenzia, per sapere chi contattare. Nomi ed email, non dati. */
create or replace view public.platform_members
with (security_invoker = on) as
select
  m.agency_id,
  m.id as membership_id,
  m.full_name,
  m.email,
  m.role,
  m.is_active,
  m.created_at
from public.memberships m
where app.is_platform_admin() and m.deleted_at is null;

-- La vista legge `agencies` e `memberships`, che hanno la RLS: senza queste
-- due policy l'amministratore vedrebbe una vista sempre vuota.
drop policy if exists agencies_platform_select on public.agencies;
create policy agencies_platform_select on public.agencies for select to authenticated
  using (app.is_platform_admin());

drop policy if exists memberships_platform_select on public.memberships;
create policy memberships_platform_select on public.memberships for select to authenticated
  using (app.is_platform_admin());

-- --- Le due azioni -----------------------------------------------------------

create or replace function public.suspend_agency(p_agency_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Non sei un amministratore della piattaforma';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'La sospensione va motivata';
  end if;

  update public.agencies
     set suspended_at = coalesce(suspended_at, now()),
         suspension_reason = p_reason,
         updated_at = now()
   where id = p_agency_id and deleted_at is null;

  if not found then
    raise exception 'Agenzia non trovata';
  end if;

  -- Resta scritto nel registro dell'agenzia: chi ci lavora deve poter vedere
  -- che cosa è successo e quando, non trovarsi il gestionale in sola lettura
  -- senza spiegazione.
  insert into public.activity_log (agency_id, actor_id, action, entity_type, entity_id, summary)
  values (p_agency_id, auth.uid(), 'modifica', 'agencies', p_agency_id,
          'Agenzia sospesa: ' || p_reason);
end;
$$;

create or replace function public.resume_agency(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Non sei un amministratore della piattaforma';
  end if;

  update public.agencies
     set suspended_at = null, suspension_reason = null, updated_at = now()
   where id = p_agency_id and deleted_at is null;

  if not found then
    raise exception 'Agenzia non trovata';
  end if;

  insert into public.activity_log (agency_id, actor_id, action, entity_type, entity_id, summary)
  values (p_agency_id, auth.uid(), 'modifica', 'agencies', p_agency_id, 'Agenzia riattivata');
end;
$$;

grant execute on function public.suspend_agency(uuid, text) to authenticated;
grant execute on function public.resume_agency(uuid) to authenticated;
grant select on public.platform_agencies, public.platform_members to authenticated;
grant execute on function app.platform_counts(uuid) to authenticated;
grant select on public.platform_admins to authenticated;
