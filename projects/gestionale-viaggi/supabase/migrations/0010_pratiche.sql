-- =============================================================================
-- 0010 — Pratiche: ricerca, viste di elenco, conferma e annullamento,
--        viste salvate degli elenchi.
--
-- Lo schema delle pratiche esiste dalla 0003. Qui si aggiungono solo la
-- ricerca, gli oggetti derivati che l'interfaccia interroga e le due
-- operazioni di dominio che devono essere transazionali.
-- =============================================================================

-- --- Ricerca sulle pratiche ---------------------------------------------------
-- La 0003 aveva un indice sull'espressione app.searchable(...), che ignora gli
-- accenti solo a meta': "Citta' del Capo" e "Città del Capo" non si trovavano a
-- vicenda. Si allinea alle anagrafiche con una colonna generata e app.normalize.
drop index if exists public.bookings_search_idx;

alter table public.bookings
  drop column if exists search_text;
alter table public.bookings
  add column search_text text generated always as (
    app.normalize(
      coalesce(code, '')
      || ' ' || coalesce(title, '')
      || ' ' || coalesce(destination, '')
      || ' ' || coalesce(country, '')
      || ' ' || coalesce(notes, '')
    )
  ) stored;

create index if not exists bookings_search_idx on public.bookings
  using gin (search_text gin_trgm_ops);

-- --- Numerazione: chi inserisce non deve inventare un numero ------------------
-- year, number e code sono NOT NULL e vengono assegnati da un trigger, che pero'
-- interveniva solo sul valore nullo. Chi inserisce da PostgREST non puo' omettere
-- una colonna NOT NULL senza default: si ritrovava a passare uno zero, che il
-- vincolo `number > 0` rifiutava. Con un default e un trigger che riconosce il
-- segnaposto, l'inserimento nomina solo i dati reali del documento.
alter table public.bookings alter column year set default 0;
alter table public.bookings alter column number set default 0;
alter table public.bookings alter column code set default '';
alter table public.quotes alter column year set default 0;
alter table public.quotes alter column number set default 0;
alter table public.quotes alter column code set default '';
alter table public.invoices alter column year set default 0;
alter table public.invoices alter column number set default 0;
alter table public.invoices alter column code set default '';

create or replace function app.assign_booking_code()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
begin
  if coalesce(new.year, 0) = 0 then
    new.year := extract(year from coalesce(new.departure_date, current_date))::integer;
  end if;
  if coalesce(new.number, 0) = 0 then
    new.number := app.next_document_number(new.agency_id, 'pratica', new.year);
  end if;
  if coalesce(new.code, '') = '' then
    select coalesce(s.booking_number_prefix, '') into v_prefix
    from public.agency_settings s where s.agency_id = new.agency_id;
    new.code := app.format_document_code(coalesce(v_prefix, ''), new.year, new.number);
  end if;
  return new;
end;
$$;

create or replace function app.assign_quote_code()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
begin
  if coalesce(new.year, 0) = 0 then
    new.year := extract(year from current_date)::integer;
  end if;
  if coalesce(new.number, 0) = 0 then
    new.number := app.next_document_number(new.agency_id, 'preventivo', new.year);
  end if;
  if coalesce(new.code, '') = '' then
    select coalesce(s.quote_number_prefix, 'P') into v_prefix
    from public.agency_settings s where s.agency_id = new.agency_id;
    new.code := app.format_document_code(coalesce(v_prefix, 'P'), new.year, new.number);
  end if;
  return new;
end;
$$;

create or replace function app.assign_invoice_code()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
begin
  if coalesce(new.year, 0) = 0 then
    new.year := extract(year from coalesce(new.issue_date, current_date))::integer;
  end if;
  if coalesce(new.number, 0) = 0 then
    new.number := app.next_document_number(
      new.agency_id,
      case when new.kind = 'nota_credito' then 'nota_credito'::app.counter_kind else 'fattura'::app.counter_kind end,
      new.year
    );
  end if;
  if coalesce(new.code, '') = '' then
    select case when new.kind = 'nota_credito'
                then coalesce(s.credit_note_number_prefix, 'NC')
                else coalesce(s.invoice_number_prefix, '') end
      into v_prefix
    from public.agency_settings s where s.agency_id = new.agency_id;
    new.code := app.format_document_code(coalesce(v_prefix, ''), new.year, new.number);
  end if;
  return new;
end;
$$;

-- --- Viste salvate degli elenchi ----------------------------------------------
-- I filtri vivono gia' nell'indirizzo: una vista salvata e' semplicemente un
-- nome dato a una query string. Con membership_id nullo la vista e' dell'intera
-- agenzia, altrimenti e' privata di chi l'ha creata.
create table if not exists public.saved_views (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  membership_id uuid references public.memberships (id) on delete cascade,
  entity        text not null check (entity in ('pratiche', 'clienti', 'passeggeri', 'fornitori')),
  name          text not null check (length(btrim(name)) between 2 and 60),
  query         text not null default '' check (length(query) <= 2000),
  is_default    boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz
);

comment on table public.saved_views is 'Nome dato a una combinazione di filtri e ordinamento di un elenco.';
comment on column public.saved_views.membership_id is 'Nullo = vista condivisa con tutta l''agenzia.';
comment on column public.saved_views.query is 'Query string senza il punto interrogativo iniziale.';

-- Un nome per volta, per entita' e per proprietario. Due indici invece di un
-- vincolo unico perche' in SQL i NULL non si confrontano fra loro: senza il
-- primo indice la stessa vista condivisa potrebbe esistere in dieci copie.
create unique index if not exists saved_views_condivise_idx
  on public.saved_views (agency_id, entity, lower(btrim(name)))
  where membership_id is null and deleted_at is null;

create unique index if not exists saved_views_personali_idx
  on public.saved_views (agency_id, membership_id, entity, lower(btrim(name)))
  where membership_id is not null and deleted_at is null;

create index if not exists saved_views_lookup_idx
  on public.saved_views (agency_id, entity, sort_order)
  where deleted_at is null;

drop trigger if exists saved_views_touch on public.saved_views;
create trigger saved_views_touch before update on public.saved_views
  for each row execute function app.touch_updated_at();

alter table public.saved_views enable row level security;

-- Si vedono le viste condivise dell'agenzia e le proprie.
drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (
      membership_id is null
      or membership_id = app.current_membership_id(agency_id)
    )
  );

-- Chiunque possa scrivere crea viste proprie; le condivise le crea il titolare.
drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    agency_id in (select app.current_agency_ids())
    and app.can_write(agency_id)
    and (
      membership_id = app.current_membership_id(agency_id)
      or (membership_id is null and app.current_role(agency_id) = 'titolare')
    )
  );

drop policy if exists saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views for update to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (
      membership_id = app.current_membership_id(agency_id)
      or (membership_id is null and app.current_role(agency_id) = 'titolare')
    )
  )
  with check (agency_id in (select app.current_agency_ids()));

drop policy if exists saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (
    agency_id in (select app.current_agency_ids())
    and (
      membership_id = app.current_membership_id(agency_id)
      or (membership_id is null and app.current_role(agency_id) = 'titolare')
    )
  );

grant select, insert, update, delete on public.saved_views to authenticated;

-- --- Viste di elenco e di dettaglio -------------------------------------------

-- Elenco delle pratiche: una sola interrogazione porta cliente, operatore e
-- tutto il quadro economico, comprese le colonne su cui si ordina.
create or replace view public.booking_list
with (security_invoker = on) as
select
  b.id,
  b.agency_id,
  b.code,
  b.year,
  b.number,
  b.title,
  b.destination,
  b.country,
  b.departure_date,
  b.return_date,
  b.pax_count,
  b.status,
  b.sale_type,
  b.customer_id,
  c.display_name as customer_name,
  b.owner_id,
  m.full_name as owner_name,
  b.quote_id,
  b.confirmed_at,
  b.cancelled_at,
  b.created_at,
  b.created_by,
  b.search_text,
  -- Il nome del cliente non può stare nella colonna generata della pratica (è
  -- su un'altra tabella), ma chi cerca una pratica la cerca anche per cognome.
  -- Qui arriva dalla colonna indicizzata di customers, così la ricerca resta
  -- una sola interrogazione.
  c.search_text as customer_search,
  f.revenue_cents,
  f.cost_cents,
  f.commission_cents,
  f.margin_cents,
  f.margin_bps,
  f.paid_cents,
  f.balance_cents,
  f.supplier_due_cents,
  f.next_due_date,
  f.payment_state,
  coalesce(sv.services_count, 0)::integer as services_count,
  coalesce(px.passengers_count, 0)::integer as passengers_count,
  coalesce(dx.documents_count, 0)::integer as documents_count
from public.bookings b
join public.customers c on c.id = b.customer_id
left join public.memberships m on m.id = b.owner_id
join public.booking_financials f on f.booking_id = b.id
left join lateral (
  select count(*) as services_count
  from public.booking_services s
  where s.booking_id = b.id and s.deleted_at is null
) sv on true
left join lateral (
  select count(*) as passengers_count
  from public.booking_passengers bp
  where bp.booking_id = b.id and bp.deleted_at is null
) px on true
left join lateral (
  select count(*) as documents_count
  from public.documents d
  where d.booking_id = b.id and d.deleted_at is null
) dx on true
where b.deleted_at is null;

comment on view public.booking_list is 'Elenco delle pratiche con il quadro economico già calcolato.';

-- Righe di servizio con il nome del fornitore e gli importi di riga.
create or replace view public.booking_service_list
with (security_invoker = on) as
select
  s.id,
  s.agency_id,
  s.booking_id,
  s.service_type,
  s.supplier_id,
  sup.name as supplier_name,
  s.description,
  s.details,
  s.confirmation_code,
  s.date_from,
  s.date_to,
  s.quantity,
  s.unit_cost_cents,
  s.unit_price_cents,
  s.commission_bps,
  s.commission_override_cents,
  s.vat_bps,
  s.vat_regime,
  s.supplier_due_date,
  s.sort_order,
  s.total_cost_cents,
  s.total_price_cents,
  s.commission_cents,
  (s.total_price_cents - s.total_cost_cents + s.commission_cents)::bigint as margin_cents,
  app.line_taxable_cents(s.total_price_cents, s.total_cost_cents, s.vat_bps, s.vat_regime) as taxable_cents,
  app.line_vat_cents(s.total_price_cents, s.total_cost_cents, s.vat_bps, s.vat_regime) as vat_cents
from public.booking_services s
left join public.suppliers sup on sup.id = s.supplier_id
where s.deleted_at is null;

-- Passeggeri della pratica con lo stato del documento rispetto al rientro.
create or replace view public.booking_passenger_list
with (security_invoker = on) as
select
  bp.id,
  bp.agency_id,
  bp.booking_id,
  bp.passenger_id,
  bp.role,
  bp.room_label,
  bp.seat_label,
  bp.notes,
  p.first_name,
  p.last_name,
  (p.last_name || ' ' || p.first_name) as full_name,
  p.birth_date,
  p.nationality,
  p.email,
  p.phone,
  p.document_type,
  p.document_number,
  p.document_expires_at,
  case
    when p.document_number is null then 'assente'
    when p.document_expires_at is null then 'senza_scadenza'
    when p.document_expires_at < current_date then 'scaduto'
    when b.return_date is not null and p.document_expires_at < b.return_date then 'scade_prima_del_rientro'
    else 'valido'
  end as document_state
from public.booking_passengers bp
join public.passengers p on p.id = bp.passenger_id
join public.bookings b on b.id = bp.booking_id
where bp.deleted_at is null and p.deleted_at is null;

-- --- Conferma della pratica ---------------------------------------------------
-- Regola 3: alla conferma nascono la scadenza dell'acconto, quella del saldo e
-- il controllo dei documenti dei passeggeri. Tutto in una transazione e
-- ripetibile: riconfermare una pratica non duplica nulla.
create or replace function public.confirm_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_settings public.agency_settings;
  v_revenue bigint;
  v_plan_id uuid;
  v_deposit bigint;
  v_deposit_due date;
  v_balance_due date;
begin
  select * into v_booking from public.bookings where id = p_booking_id and deleted_at is null;
  if not found then
    raise exception 'Pratica non trovata' using errcode = 'no_data_found';
  end if;
  if v_booking.status = 'annullata' then
    raise exception 'Una pratica annullata non si puo'' confermare';
  end if;

  select * into v_settings from public.agency_settings where agency_id = v_booking.agency_id;

  select coalesce(f.revenue_cents, 0) into v_revenue
  from public.booking_financials f where f.booking_id = p_booking_id;

  if coalesce(v_revenue, 0) <= 0 then
    raise exception 'Prima di confermare inserisci almeno una riga di servizio con un prezzo';
  end if;

  -- Riconfermare una pratica gia' partita serve a rigenerare le scadenze, non a
  -- farla tornare indietro: lo stato avanza, non retrocede.
  update public.bookings
  set status = case when status = 'opzione' then 'confermata'::app.booking_status else status end,
      confirmed_at = coalesce(confirmed_at, now())
  where id = p_booking_id
  returning * into v_booking;

  -- Piano rateale: uno per pratica, creato solo la prima volta.
  select id into v_plan_id from public.installment_plans
  where booking_id = p_booking_id and deleted_at is null;

  if v_plan_id is null then
    insert into public.installment_plans (agency_id, booking_id, source, created_by)
    values (v_booking.agency_id, p_booking_id, 'automatico', auth.uid())
    returning id into v_plan_id;
  end if;

  v_deposit := app.round_cents((v_revenue::numeric * coalesce(v_settings.deposit_percent_bps, 3000)) / 10000);
  v_deposit_due := current_date + coalesce(v_settings.deposit_due_days, 3);
  v_balance_due := case
    when v_booking.departure_date is null then null
    else v_booking.departure_date - coalesce(v_settings.balance_due_days_before_departure, 30)
  end;

  -- Le rate generate si riconoscono dal tipo: se esistono gia' si aggiornano,
  -- cosi' una riconferma dopo un cambio di prezzo allinea gli importi invece
  -- di affiancare una seconda scadenza.
  if not exists (
    select 1 from public.installments
    where booking_id = p_booking_id and kind = 'acconto' and deleted_at is null
  ) then
    insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents, sort_order, created_by)
    values (v_booking.agency_id, v_plan_id, p_booking_id, 'acconto', v_deposit_due, v_deposit, 0, auth.uid());
  else
    update public.installments
    set amount_cents = v_deposit
    where booking_id = p_booking_id and kind = 'acconto' and deleted_at is null;
  end if;

  if v_balance_due is not null then
    if not exists (
      select 1 from public.installments
      where booking_id = p_booking_id and kind = 'saldo' and deleted_at is null
    ) then
      insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents, sort_order, created_by)
      values (v_booking.agency_id, v_plan_id, p_booking_id, 'saldo', v_balance_due, v_revenue - v_deposit, 1, auth.uid());
    else
      update public.installments
      set amount_cents = v_revenue - v_deposit,
          due_date = v_balance_due
      where booking_id = p_booking_id and kind = 'saldo' and deleted_at is null;
    end if;
  end if;

  -- Controllo dei documenti: un solo task aperto per pratica.
  if not exists (
    select 1 from public.tasks
    where booking_id = p_booking_id
      and kind = 'verifica_documenti'
      and status in ('aperto', 'in_corso')
      and deleted_at is null
  ) then
    insert into public.tasks (agency_id, title, description, kind, priority, due_at, booking_id, created_by)
    values (
      v_booking.agency_id,
      'Verifica i documenti di viaggio — ' || v_booking.code,
      'Controlla che ogni passeggero abbia un documento valido oltre la data di rientro.',
      'verifica_documenti',
      'alta',
      coalesce(v_booking.departure_date - 14, current_date + 7)::timestamptz,
      p_booking_id,
      auth.uid()
    );
  end if;

  return v_booking;
end;
$$;

comment on function public.confirm_booking is 'Conferma la pratica e genera acconto, saldo e controllo documenti. Ripetibile.';

-- --- Annullamento della pratica -----------------------------------------------
-- Regola 6: serve un motivo, si calcola la penale, non si cancella nulla.
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text,
  p_penalty_cents bigint default 0
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'Indica il motivo dell''annullamento';
  end if;
  if coalesce(p_penalty_cents, 0) < 0 then
    raise exception 'La penale non puo'' essere negativa';
  end if;

  update public.bookings
  set status = 'annullata',
      cancelled_at = coalesce(cancelled_at, now()),
      cancellation_reason = btrim(p_reason),
      cancellation_penalty_cents = coalesce(p_penalty_cents, 0)
  where id = p_booking_id and deleted_at is null
  returning * into v_booking;

  if not found then
    raise exception 'Pratica non trovata' using errcode = 'no_data_found';
  end if;

  -- Le scadenze future non hanno piu' ragione di esistere; quelle gia' scadute
  -- restano, perche' raccontano che cosa era dovuto prima dell'annullamento.
  update public.installments
  set deleted_at = now()
  where booking_id = p_booking_id and deleted_at is null and due_date > current_date;

  update public.tasks
  set status = 'annullato'
  where booking_id = p_booking_id and status in ('aperto', 'in_corso') and deleted_at is null;

  return v_booking;
end;
$$;

comment on function public.cancel_booking is 'Annulla la pratica con motivo e penale, senza cancellare dati.';

grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text, bigint) to authenticated;
