-- =============================================================================
-- 0005 — Row Level Security.
--
-- Principio: nessuna riga e' leggibile o scrivibile fuori dalla propria agenzia,
-- e il ruolo decide che cosa si puo' fare dentro l'agenzia.
--
--   titolare        -> tutto, incluse impostazioni, utenti e margini
--   amministrativo  -> operativo + contabilita' (fatture, incassi, pagamenti)
--   operatore       -> solo le proprie pratiche, i propri preventivi e i relativi clienti
--   sola_lettura    -> lettura di tutta l'agenzia, nessuna scrittura
-- =============================================================================

-- --- Funzioni di visibilita' --------------------------------------------------

-- Agenzie a cui appartiene l'utente autenticato.
-- SECURITY DEFINER: deve poter leggere memberships ignorando la RLS di memberships,
-- altrimenti la policy su memberships richiamerebbe se stessa (ricorsione infinita).
create or replace function app.current_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.agency_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.is_active
    and m.deleted_at is null;
$$;

-- Ruolo dell'utente autenticato nell'agenzia indicata (null se non appartiene).
create or replace function app.current_role(p_agency_id uuid)
returns app.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.user_id = auth.uid()
    and m.agency_id = p_agency_id
    and m.is_active
    and m.deleted_at is null
  limit 1;
$$;

-- Vero se l'utente ha uno dei ruoli indicati nell'agenzia.
create or replace function app.has_role(p_agency_id uuid, variadic p_roles app.user_role[])
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) = any(p_roles);
$$;

-- Vero se l'utente puo' scrivere dati operativi (tutti tranne sola lettura).
create or replace function app.can_write(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo', 'operatore');
$$;

-- Vero se l'utente puo' scrivere dati amministrativi (fatture, incassi, pagamenti).
create or replace function app.can_manage_accounting(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo');
$$;

-- Vero se l'utente e' titolare dell'agenzia (impostazioni, utenti, margini).
create or replace function app.is_owner(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) = 'titolare';
$$;

-- Membership dell'utente corrente nell'agenzia (usata per "solo le mie pratiche").
create or replace function app.current_membership_id(p_agency_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.agency_id = p_agency_id
    and m.is_active
    and m.deleted_at is null
  limit 1;
$$;


-- Vero se l'utente vede una pratica con quel titolare-pratica.
create or replace function app.can_view_all_bookings(p_agency_id uuid)
returns boolean
language sql
stable
as $$
  select app.current_role(p_agency_id) in ('titolare', 'amministrativo', 'sola_lettura');
$$;

-- Accesso a una pratica per id (usata dalle tabelle figlie).
create or replace function app.can_access_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.agency_id in (select app.current_agency_ids())
      and (
        app.can_view_all_bookings(b.agency_id)
        or b.owner_id is not distinct from app.current_membership_id(b.agency_id)
      )
  );
$$;

-- Accesso a un preventivo per id (stessa regola della pratica).
create or replace function app.can_access_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quotes q
    where q.id = p_quote_id
      and q.agency_id in (select app.current_agency_ids())
      and (
        app.can_view_all_bookings(q.agency_id)
        or q.owner_id is not distinct from app.current_membership_id(q.agency_id)
      )
  );
$$;

-- Un operatore vede un cliente se lo ha creato o se ha una pratica/preventivo suo.
create or replace function app.can_access_customer(p_customer_id uuid, p_agency_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_agency_id in (select app.current_agency_ids())
    and (
      app.can_view_all_bookings(p_agency_id)
      or p_created_by = auth.uid()
      or exists (
        select 1 from public.bookings b
        where b.customer_id = p_customer_id
          and b.owner_id = app.current_membership_id(p_agency_id)
      )
      or exists (
        select 1 from public.quotes q
        where q.customer_id = p_customer_id
          and q.owner_id = app.current_membership_id(p_agency_id)
      )
    );
$$;

-- --- Attivazione RLS su ogni tabella ------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
  end loop;
end;
$$;

-- --- agencies -----------------------------------------------------------------
drop policy if exists agencies_select on public.agencies;
create policy agencies_select on public.agencies for select to authenticated
  using (id in (select app.current_agency_ids()));

drop policy if exists agencies_update on public.agencies;
create policy agencies_update on public.agencies for update to authenticated
  using (app.is_owner(id)) with check (app.is_owner(id));

-- Nessuna policy di INSERT/DELETE: la creazione passa dalla RPC
-- public.create_agency_with_owner, la cancellazione non e' prevista.

-- --- agency_settings ----------------------------------------------------------
drop policy if exists agency_settings_select on public.agency_settings;
create policy agency_settings_select on public.agency_settings for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists agency_settings_write on public.agency_settings;
create policy agency_settings_write on public.agency_settings for update to authenticated
  using (app.is_owner(agency_id)) with check (app.is_owner(agency_id));

drop policy if exists agency_settings_insert on public.agency_settings;
create policy agency_settings_insert on public.agency_settings for insert to authenticated
  with check (app.is_owner(agency_id));

-- --- memberships --------------------------------------------------------------
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or agency_id in (select app.current_agency_ids()));

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (app.is_owner(agency_id));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (app.is_owner(agency_id) or user_id = auth.uid())
  with check (app.is_owner(agency_id) or user_id = auth.uid());

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (app.is_owner(agency_id));

-- --- customers ----------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (app.can_access_customer(id, agency_id, created_by));

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (agency_id in (select app.current_agency_ids()) and app.can_write(agency_id));

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (app.can_write(agency_id) and app.can_access_customer(id, agency_id, created_by))
  with check (app.can_write(agency_id) and agency_id in (select app.current_agency_ids()));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (app.has_role(agency_id, 'titolare', 'amministrativo'));

-- --- passengers, suppliers: anagrafiche condivise nell'agenzia -----------------
drop policy if exists passengers_select on public.passengers;
create policy passengers_select on public.passengers for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists passengers_write on public.passengers;
create policy passengers_write on public.passengers for all to authenticated
  using (app.can_write(agency_id)) with check (app.can_write(agency_id));

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using (app.can_write(agency_id)) with check (app.can_write(agency_id));

-- --- bookings -----------------------------------------------------------------
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (app.can_view_all_bookings(agency_id) or owner_id is not distinct from app.current_membership_id(agency_id))
  );

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings for insert to authenticated
  with check (agency_id in (select app.current_agency_ids()) and app.can_write(agency_id));

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update to authenticated
  using (
    app.can_write(agency_id)
    and (app.can_view_all_bookings(agency_id) or owner_id is not distinct from app.current_membership_id(agency_id))
  )
  with check (app.can_write(agency_id) and agency_id in (select app.current_agency_ids()));

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings for delete to authenticated
  using (app.is_owner(agency_id));

-- --- tabelle figlie della pratica ---------------------------------------------
drop policy if exists booking_passengers_select on public.booking_passengers;
create policy booking_passengers_select on public.booking_passengers for select to authenticated
  using (app.can_access_booking(booking_id));

drop policy if exists booking_passengers_write on public.booking_passengers;
create policy booking_passengers_write on public.booking_passengers for all to authenticated
  using (app.can_write(agency_id) and app.can_access_booking(booking_id))
  with check (app.can_write(agency_id) and app.can_access_booking(booking_id));

drop policy if exists booking_services_select on public.booking_services;
create policy booking_services_select on public.booking_services for select to authenticated
  using (app.can_access_booking(booking_id));

drop policy if exists booking_services_write on public.booking_services;
create policy booking_services_write on public.booking_services for all to authenticated
  using (app.can_write(agency_id) and app.can_access_booking(booking_id))
  with check (app.can_write(agency_id) and app.can_access_booking(booking_id));

drop policy if exists installment_plans_select on public.installment_plans;
create policy installment_plans_select on public.installment_plans for select to authenticated
  using (app.can_access_booking(booking_id));

drop policy if exists installment_plans_write on public.installment_plans;
create policy installment_plans_write on public.installment_plans for all to authenticated
  using (app.can_write(agency_id) and app.can_access_booking(booking_id))
  with check (app.can_write(agency_id) and app.can_access_booking(booking_id));

drop policy if exists installments_select on public.installments;
create policy installments_select on public.installments for select to authenticated
  using (app.can_access_booking(booking_id));

drop policy if exists installments_write on public.installments;
create policy installments_write on public.installments for all to authenticated
  using (app.can_write(agency_id) and app.can_access_booking(booking_id))
  with check (app.can_write(agency_id) and app.can_access_booking(booking_id));

-- --- quotes -------------------------------------------------------------------
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (app.can_view_all_bookings(agency_id) or owner_id is not distinct from app.current_membership_id(agency_id))
  );

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (agency_id in (select app.current_agency_ids()) and app.can_write(agency_id));

drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (
    app.can_write(agency_id)
    and (app.can_view_all_bookings(agency_id) or owner_id is not distinct from app.current_membership_id(agency_id))
  )
  with check (app.can_write(agency_id) and agency_id in (select app.current_agency_ids()));

drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes for delete to authenticated
  using (app.has_role(agency_id, 'titolare', 'amministrativo'));

drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items for select to authenticated
  using (app.can_access_quote(quote_id));

drop policy if exists quote_items_write on public.quote_items;
create policy quote_items_write on public.quote_items for all to authenticated
  using (app.can_write(agency_id) and app.can_access_quote(quote_id))
  with check (app.can_write(agency_id) and app.can_access_quote(quote_id));

-- --- contabilita': scrittura riservata a titolare e amministrativo -------------
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (booking_id is null or app.can_access_booking(booking_id))
  );

drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices for all to authenticated
  using (app.can_manage_accounting(agency_id)) with check (app.can_manage_accounting(agency_id));

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists invoice_items_write on public.invoice_items;
create policy invoice_items_write on public.invoice_items for all to authenticated
  using (app.can_manage_accounting(agency_id)) with check (app.can_manage_accounting(agency_id));

drop policy if exists payments_in_select on public.payments_in;
create policy payments_in_select on public.payments_in for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (booking_id is null or app.can_access_booking(booking_id))
  );

drop policy if exists payments_in_write on public.payments_in;
create policy payments_in_write on public.payments_in for all to authenticated
  using (app.can_manage_accounting(agency_id)) with check (app.can_manage_accounting(agency_id));

drop policy if exists payments_out_select on public.payments_out;
create policy payments_out_select on public.payments_out for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (booking_id is null or app.can_access_booking(booking_id))
  );

drop policy if exists payments_out_write on public.payments_out;
create policy payments_out_write on public.payments_out for all to authenticated
  using (app.can_manage_accounting(agency_id)) with check (app.can_manage_accounting(agency_id));

-- --- documenti ----------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (booking_id is null or app.can_access_booking(booking_id))
  );

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all to authenticated
  using (app.can_write(agency_id) and (booking_id is null or app.can_access_booking(booking_id)))
  with check (app.can_write(agency_id) and (booking_id is null or app.can_access_booking(booking_id)));

-- --- task ---------------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (booking_id is null or app.can_access_booking(booking_id))
  );

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all to authenticated
  using (app.can_write(agency_id)) with check (app.can_write(agency_id));

-- --- registro attivita': append-only ------------------------------------------
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert to authenticated
  with check (agency_id in (select app.current_agency_ids()));

-- --- contatori di numerazione -------------------------------------------------
drop policy if exists document_counters_select on public.document_counters;
create policy document_counters_select on public.document_counters for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists document_counters_write on public.document_counters;
create policy document_counters_write on public.document_counters for all to authenticated
  using (app.can_write(agency_id)) with check (app.can_write(agency_id));
