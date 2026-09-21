-- =============================================================================
-- 0002 — Anagrafiche: agenzie, impostazioni, utenti, clienti, passeggeri, fornitori.
-- =============================================================================

-- --- Agenzie -----------------------------------------------------------------
create table if not exists public.agencies (
  id                uuid primary key default gen_random_uuid(),
  -- L'agenzia e' tenant di se stessa: la colonna esiste per uniformita' di RLS e query.
  agency_id         uuid generated always as (id) stored,
  name              text not null check (length(btrim(name)) between 2 and 120),
  legal_name        text,
  vat_number        text,
  tax_code          text,
  rea_number        text,
  address_line      text,
  postal_code       text,
  city              text,
  province          text check (province is null or length(province) = 2),
  country           text not null default 'IT',
  email             text,
  pec               text,
  phone             text,
  website           text,
  iban              text,
  logo_path         text,
  fiscal_regime     text not null default 'ordinario',
  license_number    text,
  insurance_policy  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  deleted_at        timestamptz
);

comment on table public.agencies is 'Agenzia di viaggi: radice del tenant. Ogni riga di ogni tabella appartiene a una agenzia.';

-- --- Parametri operativi dell'agenzia ----------------------------------------
create table if not exists public.agency_settings (
  id                              uuid primary key default gen_random_uuid(),
  agency_id                       uuid not null unique references public.agencies (id) on delete cascade,
  -- Scadenze generate alla conferma della pratica
  deposit_due_days                integer not null default 3 check (deposit_due_days between 0 and 90),
  balance_due_days_before_departure integer not null default 30 check (balance_due_days_before_departure between 0 and 365),
  deposit_percent_bps             integer not null default 3000 check (deposit_percent_bps between 0 and 10000),
  -- Preavvisi per gli alert (giorni)
  supplier_alert_days             integer[] not null default '{7,3,0}',
  passenger_document_alert_days   integer not null default 30 check (passenger_document_alert_days between 0 and 365),
  -- Fiscalita'
  default_vat_bps                 integer not null default 2200 check (default_vat_bps between 0 and 10000),
  default_sale_type               app.sale_type not null default 'intermediazione',
  -- Numerazioni
  booking_number_prefix           text not null default '',
  quote_number_prefix             text not null default 'P',
  invoice_number_prefix           text not null default '',
  credit_note_number_prefix       text not null default 'NC',
  quote_validity_days             integer not null default 14 check (quote_validity_days between 1 and 365),
  -- Visibilita'
  hide_margins_from_operators     boolean not null default false,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid,
  deleted_at                      timestamptz
);

comment on table public.agency_settings is 'Parametri configurabili: scadenze automatiche, aliquote, numerazioni, visibilita margini.';

-- --- Utenti dell'agenzia ------------------------------------------------------
create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         app.user_role not null default 'operatore',
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  email        text not null,
  phone        text,
  job_title    text,
  avatar_path  text,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  deleted_at   timestamptz,
  unique (agency_id, user_id)
);

comment on table public.memberships is 'Legame utente <-> agenzia con ruolo. Un utente puo appartenere a piu agenzie.';

create index if not exists memberships_user_idx on public.memberships (user_id) where deleted_at is null;
create index if not exists memberships_agency_idx on public.memberships (agency_id) where deleted_at is null;

-- --- Clienti ------------------------------------------------------------------
create table if not exists public.customers (
  id                   uuid primary key default gen_random_uuid(),
  agency_id            uuid not null references public.agencies (id) on delete cascade,
  kind                 app.customer_kind not null default 'privato',
  first_name           text,
  last_name            text,
  company_name         text,
  display_name         text generated always as (
                          btrim(coalesce(company_name, btrim(coalesce(last_name, '') || ' ' || coalesce(first_name, ''))))
                        ) stored,
  vat_number           text,
  tax_code             text,
  sdi_code             text,
  pec                  text,
  email                text,
  phone                text,
  mobile               text,
  address_line         text,
  postal_code          text,
  city                 text,
  province             text check (province is null or length(province) = 2),
  country              text not null default 'IT',
  birth_date           date,
  birth_place          text,
  notes                text,
  tags                 text[] not null default '{}',
  preferred_contact    text,
  -- GDPR: ogni consenso e' tracciato con la data in cui e' stato raccolto
  privacy_consent_at   timestamptz,
  marketing_consent    boolean not null default false,
  marketing_consent_at timestamptz,
  profiling_consent    boolean not null default false,
  anonymized_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  deleted_at           timestamptz,
  constraint customers_identity_check check (
    (kind = 'privato' and (first_name is not null or last_name is not null))
    or (kind = 'azienda' and company_name is not null)
  )
);

comment on table public.customers is 'Cliente intestatario della pratica: persona fisica o azienda.';

create index if not exists customers_agency_idx on public.customers (agency_id) where deleted_at is null;
create index if not exists customers_display_name_idx on public.customers using gin (app.searchable(display_name) gin_trgm_ops);
create index if not exists customers_email_idx on public.customers (agency_id, lower(email)) where deleted_at is null;
create index if not exists customers_tax_code_idx on public.customers (agency_id, upper(tax_code)) where deleted_at is null;
create index if not exists customers_tags_idx on public.customers using gin (tags);

-- --- Passeggeri ---------------------------------------------------------------
create table if not exists public.passengers (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies (id) on delete cascade,
  customer_id           uuid references public.customers (id) on delete set null,
  first_name            text not null check (length(btrim(first_name)) >= 1),
  last_name             text not null check (length(btrim(last_name)) >= 1),
  full_name             text generated always as (btrim(last_name || ' ' || first_name)) stored,
  birth_date            date,
  birth_place           text,
  gender                text check (gender is null or gender in ('M', 'F', 'X')),
  nationality           text not null default 'IT',
  tax_code              text,
  email                 text,
  phone                 text,
  document_type         app.id_document_type,
  document_number       text,
  document_issued_at    date,
  document_expires_at   date,
  document_issuer       text,
  dietary_needs         text,
  special_needs         text,
  frequent_flyer        text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  deleted_at            timestamptz,
  constraint passengers_document_dates_check check (
    document_issued_at is null or document_expires_at is null or document_expires_at >= document_issued_at
  )
);

comment on table public.passengers is 'Passeggero: puo non coincidere con il cliente (familiari, gruppi, minori).';

create index if not exists passengers_agency_idx on public.passengers (agency_id) where deleted_at is null;
create index if not exists passengers_customer_idx on public.passengers (customer_id) where deleted_at is null;
create index if not exists passengers_name_idx on public.passengers using gin (app.searchable(full_name) gin_trgm_ops);
-- Serve all'alert "documento in scadenza prima del rientro"
create index if not exists passengers_document_expiry_idx on public.passengers (agency_id, document_expires_at)
  where deleted_at is null and document_expires_at is not null;

-- --- Fornitori ----------------------------------------------------------------
create table if not exists public.suppliers (
  id                      uuid primary key default gen_random_uuid(),
  agency_id               uuid not null references public.agencies (id) on delete cascade,
  kind                    app.supplier_kind not null default 'tour_operator',
  name                    text not null check (length(btrim(name)) between 2 and 160),
  legal_name              text,
  vat_number              text,
  tax_code                text,
  email                   text,
  pec                     text,
  phone                   text,
  contact_name            text,
  address_line            text,
  postal_code             text,
  city                    text,
  province                text check (province is null or length(province) = 2),
  country                 text not null default 'IT',
  iban                    text,
  -- Giorni di dilazione concessi dal fornitore: guida il calcolo delle scadenze di pagamento
  payment_terms_days      integer not null default 30 check (payment_terms_days between 0 and 365),
  default_commission_bps  integer not null default 0 check (default_commission_bps between 0 and 10000),
  default_vat_regime      app.vat_regime not null default 'art_74_ter',
  booking_portal_url      text,
  notes                   text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  deleted_at              timestamptz
);

comment on table public.suppliers is 'Tour operator, compagnie, hotel, DMC, assicurazioni: chi fattura all agenzia.';

create index if not exists suppliers_agency_idx on public.suppliers (agency_id) where deleted_at is null;
create index if not exists suppliers_name_idx on public.suppliers using gin (app.searchable(name) gin_trgm_ops);
