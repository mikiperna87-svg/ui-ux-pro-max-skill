-- =============================================================================
-- 0001 — Fondamenta: estensioni, enum di dominio, funzioni di supporto.
-- Convenzioni del progetto:
--   * importi  -> bigint in CENTESIMI (mai numeric/float)
--   * istanti  -> timestamptz in UTC
--   * date pure (partenza, scadenza documento) -> date
--   * ogni tabella: id uuid, agency_id uuid, created_at, updated_at,
--     created_by, deleted_at (cancellazione logica)
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists app;
comment on schema app is 'Funzioni di dominio e sicurezza del gestionale.';

-- --- Enum di dominio ---------------------------------------------------------

do $$ begin
  create type app.user_role as enum ('titolare', 'amministrativo', 'operatore', 'sola_lettura');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.customer_kind as enum ('privato', 'azienda');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.id_document_type as enum ('carta_identita', 'passaporto', 'patente', 'permesso_soggiorno');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.passenger_role as enum ('titolare', 'accompagnatore', 'minore');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.supplier_kind as enum (
    'tour_operator', 'compagnia_aerea', 'compagnia_ferroviaria', 'compagnia_marittima',
    'hotel', 'dmc', 'assicurazione', 'noleggio', 'altro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.booking_status as enum ('opzione', 'confermata', 'partita', 'rientrata', 'annullata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.sale_type as enum ('intermediazione', 'organizzazione');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.service_type as enum (
    'volo', 'hotel', 'transfer', 'assicurazione', 'escursione', 'biglietteria',
    'noleggio', 'visto', 'pacchetto', 'altro'
  );
exception when duplicate_object then null; end $$;

-- Regime IVA applicato alla singola riga: 74-ter = IVA sul margine (organizzazione),
-- ordinaria = IVA sul corrispettivo, art. 10 = esente (es. intermediazione assicurativa).
do $$ begin
  create type app.vat_regime as enum ('ordinaria', 'art_74_ter', 'esente_art_10', 'fuori_campo', 'reverse_charge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.quote_status as enum ('bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto', 'convertito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.quote_variant as enum ('base', 'consigliata', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.payment_method as enum ('contanti', 'pos', 'bonifico', 'assegno', 'link_pagamento', 'compensazione');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.payment_in_kind as enum ('acconto', 'saldo', 'extra', 'rimborso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.payout_status as enum ('da_pagare', 'programmato', 'pagato', 'stornato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.installment_kind as enum ('acconto', 'saldo', 'rata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.invoice_kind as enum ('fattura', 'nota_credito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.invoice_status as enum ('bozza', 'emessa', 'inviata', 'pagata', 'annullata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.task_status as enum ('aperto', 'in_corso', 'completato', 'annullato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.task_priority as enum ('bassa', 'media', 'alta', 'urgente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.task_kind as enum (
    'verifica_documenti', 'scadenza_acconto', 'scadenza_saldo', 'pagamento_fornitore',
    'richiamo_cliente', 'generico'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.document_kind as enum (
    'voucher', 'contratto', 'documento_identita', 'assicurazione', 'fattura_fornitore',
    'preventivo', 'fattura', 'altro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.counter_kind as enum ('pratica', 'preventivo', 'fattura', 'nota_credito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.activity_action as enum (
    'creazione', 'modifica', 'eliminazione', 'cambio_stato', 'incasso', 'pagamento',
    'emissione_documento', 'annullamento'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.payment_state as enum ('non_pagata', 'acconto_versato', 'saldata', 'in_ritardo');
exception when duplicate_object then null; end $$;

-- --- Funzioni di supporto ----------------------------------------------------
-- Le funzioni che interrogano memberships (identita' e ruoli) vivono in 0005,
-- insieme alle policy che le usano: qui le tabelle non esistono ancora.

-- Aggiorna updated_at a ogni UPDATE. Applicata a tutte le tabelle.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalizza il testo per la ricerca full-text (accenti rimossi, minuscolo).
create or replace function app.searchable(p_text text)
returns text
language sql
immutable
as $$
  select lower(coalesce(p_text, ''));
$$;

-- Arrotondamento commerciale su centesimi interi (half-up), usato dalle colonne generate.
create or replace function app.round_cents(p_value numeric)
returns bigint
language sql
immutable
as $$
  select round(p_value)::bigint;
$$;
