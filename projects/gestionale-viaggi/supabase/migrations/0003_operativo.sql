-- =============================================================================
-- 0003 — Operativo: pratiche, servizi, passeggeri di pratica, preventivi,
--        piani rateali, incassi, pagamenti a fornitore, documenti, fatture, task.
--
-- Convenzione economica delle righe (booking_services / quote_items):
--   unit_price_cents = prezzo LORDO praticato al cliente (IVA inclusa)
--   unit_cost_cents  = costo NETTO fornitore
--   commission_bps   = commissione attiva riconosciuta dal fornitore sul venduto
--   margine riga     = (prezzo - costo) + commissione
-- =============================================================================

-- --- Pratiche (dossier) -------------------------------------------------------
create table if not exists public.bookings (
  id                        uuid primary key default gen_random_uuid(),
  agency_id                 uuid not null references public.agencies (id) on delete cascade,
  -- Numerazione progressiva annuale senza buchi (vedi app.next_document_number)
  year                      integer not null check (year between 2000 and 2100),
  number                    integer not null check (number > 0),
  code                      text not null,
  customer_id               uuid not null references public.customers (id) on delete restrict,
  owner_id                  uuid references public.memberships (id) on delete set null,
  quote_id                  uuid,
  title                     text not null check (length(btrim(title)) between 2 and 200),
  destination               text not null check (length(btrim(destination)) between 2 and 160),
  country                   text,
  departure_date            date,
  return_date               date,
  pax_count                 integer not null default 1 check (pax_count between 0 and 500),
  status                    app.booking_status not null default 'opzione',
  sale_type                 app.sale_type not null default 'intermediazione',
  notes                     text,
  internal_notes            text,
  confirmed_at              timestamptz,
  cancelled_at              timestamptz,
  cancellation_reason       text,
  cancellation_penalty_cents bigint not null default 0 check (cancellation_penalty_cents >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid,
  deleted_at                timestamptz,
  unique (agency_id, year, number),
  unique (agency_id, code),
  constraint bookings_dates_check check (departure_date is null or return_date is null or return_date >= departure_date),
  constraint bookings_cancellation_check check (status <> 'annullata' or cancellation_reason is not null)
);

comment on table public.bookings is 'Pratica di viaggio: contenitore di cliente, passeggeri, servizi, incassi, documenti e scadenze.';
comment on column public.bookings.code is 'Riferimento leggibile, es. 2026/0042. Univoco per agenzia.';

create index if not exists bookings_agency_status_idx on public.bookings (agency_id, status) where deleted_at is null;
create index if not exists bookings_agency_departure_idx on public.bookings (agency_id, departure_date) where deleted_at is null;
create index if not exists bookings_customer_idx on public.bookings (customer_id) where deleted_at is null;
create index if not exists bookings_owner_idx on public.bookings (owner_id) where deleted_at is null;
create index if not exists bookings_search_idx on public.bookings
  using gin ((app.searchable(code || ' ' || title || ' ' || destination)) gin_trgm_ops);

-- --- Preventivi ---------------------------------------------------------------
create table if not exists public.quotes (
  id                   uuid primary key default gen_random_uuid(),
  agency_id            uuid not null references public.agencies (id) on delete cascade,
  year                 integer not null check (year between 2000 and 2100),
  number               integer not null check (number > 0),
  code                 text not null,
  customer_id          uuid references public.customers (id) on delete set null,
  owner_id             uuid references public.memberships (id) on delete set null,
  title                text not null check (length(btrim(title)) between 2 and 200),
  destination          text not null check (length(btrim(destination)) between 2 and 160),
  departure_date       date,
  return_date          date,
  pax_count            integer not null default 1 check (pax_count between 1 and 500),
  status               app.quote_status not null default 'bozza',
  sale_type            app.sale_type not null default 'intermediazione',
  valid_until          date,
  intro_text           text,
  terms_text           text,
  notes                text,
  -- Accettazione online: token opaco usato dal link pubblico
  public_token         uuid not null default gen_random_uuid(),
  sent_at              timestamptz,
  accepted_variant     app.quote_variant,
  accepted_at          timestamptz,
  accepted_by_name     text,
  accepted_ip          inet,
  rejected_at          timestamptz,
  rejection_reason     text,
  converted_booking_id uuid references public.bookings (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  deleted_at           timestamptz,
  unique (agency_id, year, number),
  unique (agency_id, code),
  unique (public_token),
  constraint quotes_dates_check check (departure_date is null or return_date is null or return_date >= departure_date)
);

comment on table public.quotes is 'Preventivo con fino a tre varianti di prezzo confrontabili, accettabile online.';

create index if not exists quotes_agency_status_idx on public.quotes (agency_id, status) where deleted_at is null;
create index if not exists quotes_customer_idx on public.quotes (customer_id) where deleted_at is null;

alter table public.bookings
  drop constraint if exists bookings_quote_id_fkey;
alter table public.bookings
  add constraint bookings_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete set null;

-- --- Righe di preventivo ------------------------------------------------------
create table if not exists public.quote_items (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  quote_id            uuid not null references public.quotes (id) on delete cascade,
  variant             app.quote_variant not null default 'base',
  service_type        app.service_type not null default 'pacchetto',
  supplier_id         uuid references public.suppliers (id) on delete set null,
  description         text not null check (length(btrim(description)) between 2 and 300),
  details             text,
  date_from           date,
  date_to             date,
  quantity            integer not null default 1 check (quantity > 0 and quantity <= 1000),
  unit_cost_cents     bigint not null default 0 check (unit_cost_cents >= 0),
  unit_price_cents    bigint not null default 0 check (unit_price_cents >= 0),
  commission_bps      integer not null default 0 check (commission_bps between 0 and 10000),
  commission_override_cents bigint check (commission_override_cents is null or commission_override_cents >= 0),
  vat_bps             integer not null default 2200 check (vat_bps between 0 and 10000),
  vat_regime          app.vat_regime not null default 'art_74_ter',
  sort_order          integer not null default 0,
  total_cost_cents    bigint generated always as (quantity::bigint * unit_cost_cents) stored,
  total_price_cents   bigint generated always as (quantity::bigint * unit_price_cents) stored,
  commission_cents    bigint generated always as (
                        coalesce(
                          commission_override_cents,
                          round((quantity::numeric * unit_price_cents * commission_bps) / 10000)::bigint
                        )
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  deleted_at          timestamptz
);

create index if not exists quote_items_quote_idx on public.quote_items (quote_id, variant, sort_order) where deleted_at is null;

-- --- Passeggeri della pratica -------------------------------------------------
create table if not exists public.booking_passengers (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  passenger_id  uuid not null references public.passengers (id) on delete restrict,
  role          app.passenger_role not null default 'accompagnatore',
  room_label    text,
  seat_label    text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz,
  unique (booking_id, passenger_id)
);

create index if not exists booking_passengers_booking_idx on public.booking_passengers (booking_id) where deleted_at is null;
create index if not exists booking_passengers_passenger_idx on public.booking_passengers (passenger_id) where deleted_at is null;

-- --- Righe di servizio della pratica -----------------------------------------
create table if not exists public.booking_services (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  service_type        app.service_type not null default 'pacchetto',
  supplier_id         uuid references public.suppliers (id) on delete set null,
  description         text not null check (length(btrim(description)) between 2 and 300),
  details             text,
  confirmation_code   text,
  date_from           date,
  date_to             date,
  quantity            integer not null default 1 check (quantity > 0 and quantity <= 1000),
  unit_cost_cents     bigint not null default 0 check (unit_cost_cents >= 0),
  unit_price_cents    bigint not null default 0 check (unit_price_cents >= 0),
  commission_bps      integer not null default 0 check (commission_bps between 0 and 10000),
  commission_override_cents bigint check (commission_override_cents is null or commission_override_cents >= 0),
  vat_bps             integer not null default 2200 check (vat_bps between 0 and 10000),
  vat_regime          app.vat_regime not null default 'art_74_ter',
  supplier_due_date   date,
  sort_order          integer not null default 0,
  total_cost_cents    bigint generated always as (quantity::bigint * unit_cost_cents) stored,
  total_price_cents   bigint generated always as (quantity::bigint * unit_price_cents) stored,
  commission_cents    bigint generated always as (
                        coalesce(
                          commission_override_cents,
                          round((quantity::numeric * unit_price_cents * commission_bps) / 10000)::bigint
                        )
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  deleted_at          timestamptz,
  constraint booking_services_dates_check check (date_from is null or date_to is null or date_to >= date_from)
);

comment on table public.booking_services is 'Riga di servizio acquistata: costo netto fornitore, prezzo di vendita, commissione, regime IVA.';

create index if not exists booking_services_booking_idx on public.booking_services (booking_id, sort_order) where deleted_at is null;
create index if not exists booking_services_supplier_idx on public.booking_services (supplier_id) where deleted_at is null;
create index if not exists booking_services_due_idx on public.booking_services (agency_id, supplier_due_date)
  where deleted_at is null and supplier_due_date is not null;

-- --- Piano rateale ------------------------------------------------------------
create table if not exists public.installment_plans (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies (id) on delete cascade,
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  source       text not null default 'automatico' check (source in ('automatico', 'manuale')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  deleted_at   timestamptz,
  unique (booking_id)
);

create table if not exists public.installments (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  plan_id       uuid not null references public.installment_plans (id) on delete cascade,
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  kind          app.installment_kind not null default 'rata',
  due_date      date not null,
  amount_cents  bigint not null check (amount_cents >= 0),
  sort_order    integer not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz
);

create index if not exists installments_booking_idx on public.installments (booking_id, due_date) where deleted_at is null;
create index if not exists installments_due_idx on public.installments (agency_id, due_date) where deleted_at is null;

-- --- Fatture e note di credito ------------------------------------------------
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies (id) on delete cascade,
  kind              app.invoice_kind not null default 'fattura',
  year              integer not null check (year between 2000 and 2100),
  number            integer not null check (number > 0),
  code              text not null,
  customer_id       uuid not null references public.customers (id) on delete restrict,
  booking_id        uuid references public.bookings (id) on delete set null,
  credit_note_of    uuid references public.invoices (id) on delete set null,
  issue_date        date not null default current_date,
  due_date          date,
  status            app.invoice_status not null default 'bozza',
  vat_regime        app.vat_regime not null default 'art_74_ter',
  taxable_cents     bigint not null default 0,
  vat_cents         bigint not null default 0,
  total_cents       bigint not null default 0,
  payment_terms     text,
  notes             text,
  legal_notes       text,
  pdf_path          text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  deleted_at        timestamptz,
  unique (agency_id, kind, year, number),
  unique (agency_id, code)
);

comment on table public.invoices is 'Fattura o nota di credito. I totali sono ricalcolati dal trigger sulle righe.';

create index if not exists invoices_agency_status_idx on public.invoices (agency_id, status) where deleted_at is null;
create index if not exists invoices_customer_idx on public.invoices (customer_id) where deleted_at is null;
create index if not exists invoices_booking_idx on public.invoices (booking_id) where deleted_at is null;
create index if not exists invoices_issue_date_idx on public.invoices (agency_id, issue_date) where deleted_at is null;

create table if not exists public.invoice_items (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies (id) on delete cascade,
  invoice_id        uuid not null references public.invoices (id) on delete cascade,
  description       text not null check (length(btrim(description)) between 2 and 300),
  quantity          integer not null default 1 check (quantity > 0),
  unit_price_cents  bigint not null default 0,
  cost_cents        bigint not null default 0 check (cost_cents >= 0),
  vat_bps           integer not null default 2200 check (vat_bps between 0 and 10000),
  vat_regime        app.vat_regime not null default 'art_74_ter',
  sort_order        integer not null default 0,
  gross_cents       bigint generated always as (quantity::bigint * unit_price_cents) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  deleted_at        timestamptz
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id, sort_order) where deleted_at is null;

-- --- Incassi da cliente -------------------------------------------------------
create table if not exists public.payments_in (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies (id) on delete cascade,
  booking_id      uuid references public.bookings (id) on delete set null,
  invoice_id      uuid references public.invoices (id) on delete set null,
  installment_id  uuid references public.installments (id) on delete set null,
  customer_id     uuid references public.customers (id) on delete set null,
  kind            app.payment_in_kind not null default 'acconto',
  method          app.payment_method not null default 'bonifico',
  -- Negativo per i rimborsi: la somma algebrica e' sempre l'incassato netto
  amount_cents    bigint not null check (amount_cents <> 0),
  paid_at         date not null default current_date,
  reference       text,
  notes           text,
  -- Idempotenza: un secondo invio dello stesso incasso non crea un duplicato
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  deleted_at      timestamptz,
  unique (agency_id, idempotency_key)
);

create index if not exists payments_in_booking_idx on public.payments_in (booking_id) where deleted_at is null;
create index if not exists payments_in_paid_at_idx on public.payments_in (agency_id, paid_at) where deleted_at is null;
create index if not exists payments_in_invoice_idx on public.payments_in (invoice_id) where deleted_at is null;

-- --- Pagamenti a fornitore ----------------------------------------------------
create table if not exists public.payments_out (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  booking_id          uuid references public.bookings (id) on delete set null,
  booking_service_id  uuid references public.booking_services (id) on delete set null,
  supplier_id         uuid not null references public.suppliers (id) on delete restrict,
  amount_cents        bigint not null check (amount_cents <> 0),
  due_date            date not null,
  paid_at             date,
  status              app.payout_status not null default 'da_pagare',
  method              app.payment_method not null default 'bonifico',
  reference           text,
  supplier_invoice_number text,
  notes               text,
  idempotency_key     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  deleted_at          timestamptz,
  unique (agency_id, idempotency_key),
  constraint payments_out_paid_check check (status <> 'pagato' or paid_at is not null)
);

create index if not exists payments_out_due_idx on public.payments_out (agency_id, due_date, status) where deleted_at is null;
create index if not exists payments_out_supplier_idx on public.payments_out (supplier_id) where deleted_at is null;
create index if not exists payments_out_booking_idx on public.payments_out (booking_id) where deleted_at is null;

-- --- Documenti (Supabase Storage, bucket privato) -----------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  booking_id    uuid references public.bookings (id) on delete cascade,
  passenger_id  uuid references public.passengers (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete cascade,
  quote_id      uuid references public.quotes (id) on delete cascade,
  invoice_id    uuid references public.invoices (id) on delete cascade,
  kind          app.document_kind not null default 'altro',
  file_path     text not null,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz,
  constraint documents_parent_check check (
    num_nonnulls(booking_id, passenger_id, customer_id, quote_id, invoice_id) >= 1
  )
);

create index if not exists documents_booking_idx on public.documents (booking_id) where deleted_at is null;
create index if not exists documents_passenger_idx on public.documents (passenger_id) where deleted_at is null;
create index if not exists documents_agency_kind_idx on public.documents (agency_id, kind) where deleted_at is null;

-- --- Task e scadenze operative ------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 2 and 200),
  description   text,
  kind          app.task_kind not null default 'generico',
  status        app.task_status not null default 'aperto',
  priority      app.task_priority not null default 'media',
  due_at        timestamptz,
  assignee_id   uuid references public.memberships (id) on delete set null,
  booking_id    uuid references public.bookings (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete cascade,
  quote_id      uuid references public.quotes (id) on delete cascade,
  completed_at  timestamptz,
  completed_by  uuid references public.memberships (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz
);

create index if not exists tasks_agency_status_idx on public.tasks (agency_id, status, due_at) where deleted_at is null;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status) where deleted_at is null;
create index if not exists tasks_booking_idx on public.tasks (booking_id) where deleted_at is null;

-- --- Registro attivita' (audit immutabile) ------------------------------------
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  actor_id      uuid,
  actor_label   text not null default 'sistema',
  action        app.activity_action not null,
  entity_type   text not null,
  entity_id     uuid,
  entity_label  text,
  summary       text not null,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);

comment on table public.activity_log is 'Audit immutabile: nessun UPDATE o DELETE e ammesso (trigger di protezione).';

create index if not exists activity_log_agency_idx on public.activity_log (agency_id, created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);

-- --- Contatori di numerazione -------------------------------------------------
create table if not exists public.document_counters (
  agency_id   uuid not null references public.agencies (id) on delete cascade,
  kind        app.counter_kind not null,
  year        integer not null check (year between 2000 and 2100),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at  timestamptz not null default now(),
  primary key (agency_id, kind, year)
);

comment on table public.document_counters is 'Sequenza annuale per pratiche, preventivi, fatture e note di credito. Aggiornata in transazione: nessun buco, nessuna race condition.';
