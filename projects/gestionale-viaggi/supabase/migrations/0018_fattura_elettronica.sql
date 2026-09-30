-- ============================================================================
-- 0018 — Fattura elettronica: i campi che al tracciato SdI servono
--
-- Lo schema delle fatture era gia' quasi pronto: imponibile, imposta e totale
-- in centesimi, l'aliquota per riga, il regime IVA, il legame nota di credito
-- → fattura, la numerazione univoca per agenzia e anno. Mancano i pezzi che il
-- tracciato FatturaPA pretende come codici e non come testo libero, piu' lo
-- stato della trasmissione.
--
-- I codici restano `text` con un vincolo di forma invece che enum: le tabelle
-- dell'Agenzia delle Entrate cambiano (N2 e N6 si sono spezzati in
-- sottocodici nel 2021), e un enum va migrato a ogni ritocco mentre un check
-- si riscrive in una riga.
-- ============================================================================

-- --- Chi emette --------------------------------------------------------------

alter table public.agencies
  -- RegimeFiscale: obbligatorio nel tracciato. RF01 e' l'ordinario, RF19 il
  -- forfettario. Il default e' quello giusto per la quasi totalita' delle
  -- agenzie di viaggio, che in 74-ter stanno in regime ordinario.
  add column if not exists sdi_regime text not null default 'RF01',
  -- IscrizioneREA: il blocco e' facoltativo, ma se c'e' vuole ufficio, numero
  -- e stato di liquidazione insieme. `rea_number` esiste dalla 0002.
  add column if not exists rea_office text,
  add column if not exists share_capital_cents bigint,
  add column if not exists sole_shareholder boolean not null default false,
  add column if not exists in_liquidation boolean not null default false;

do $$ begin
  alter table public.agencies
    add constraint agencies_sdi_regime_check
    check (sdi_regime ~ '^RF(0[1-9]|1[0-9])$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.agencies
    add constraint agencies_rea_office_check
    check (rea_office is null or rea_office ~ '^[A-Z]{2}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.agencies
    add constraint agencies_share_capital_check
    check (share_capital_cents is null or share_capital_cents >= 0);
exception when duplicate_object then null; end $$;

-- `fiscal_regime` era testo libero e non lo leggeva nessuno: resta dov'e' per
-- non rompere niente, ma da qui in poi il regime che conta e' `sdi_regime`.
comment on column public.agencies.fiscal_regime is
  'Legacy: testo descrittivo. Il regime usato per la fattura elettronica e'' sdi_regime.';

-- --- Stato della trasmissione ------------------------------------------------

do $$ begin
  create type app.sdi_status as enum (
    'non_inviata',   -- il file non e' ancora stato prodotto
    'generata',      -- XML prodotto, non ancora consegnato all'intermediario
    'inviata',       -- consegnato all'intermediario, in attesa di esito
    'consegnata',    -- SdI ha consegnato al destinatario
    'mancata_consegna', -- SdI ha accettato ma non ha potuto consegnare
    'scartata'       -- SdI ha rifiutato: il documento va corretto e rifatto
  );
exception when duplicate_object then null; end $$;

alter table public.invoices
  -- ModalitaPagamento (MP01 contanti, MP05 bonifico...) e CondizioniPagamento
  -- (TP01 a rate, TP02 completo, TP03 anticipo).
  add column if not exists payment_method text not null default 'MP05',
  add column if not exists payment_condition text not null default 'TP02',
  -- DatiBollo: due euro sui documenti senza IVA sopra 77,47 euro. Se si applica
  -- lo decide chi tiene la contabilita', non un valore calcolato di nascosto.
  add column if not exists stamp_duty_cents bigint not null default 0,
  -- Trasmissione
  add column if not exists sdi_status app.sdi_status not null default 'non_inviata',
  add column if not exists sdi_progressivo text,
  add column if not exists sdi_filename text,
  add column if not exists sdi_sent_at timestamptz,
  add column if not exists sdi_message text;

do $$ begin
  alter table public.invoices
    add constraint invoices_payment_method_check
    check (payment_method ~ '^MP(0[1-9]|1[0-9]|2[0-3])$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.invoices
    add constraint invoices_payment_condition_check
    check (payment_condition in ('TP01', 'TP02', 'TP03'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.invoices
    add constraint invoices_stamp_duty_check
    check (stamp_duty_cents >= 0);
exception when duplicate_object then null; end $$;

-- Il progressivo di invio identifica il file presso SdI e non si ripete mai
-- per lo stesso trasmittente: unico per agenzia, e solo quando c'e'.
create unique index if not exists invoices_sdi_progressivo_key
  on public.invoices (agency_id, sdi_progressivo)
  where sdi_progressivo is not null;

-- --- Natura IVA per riga -----------------------------------------------------

alter table public.invoice_items
  -- Natura si scrive solo quando l'aliquota e' zero, e nella quasi totalita'
  -- dei casi si ricava dal regime della riga (74-ter → N5, esente → N4). Qui
  -- si conserva solo la deroga: null vuol dire «usa quella derivata».
  add column if not exists vat_nature text;

do $$ begin
  alter table public.invoice_items
    add constraint invoice_items_vat_nature_check
    check (vat_nature is null or vat_nature ~ '^N[1-7](\.[1-9])?$');
exception when duplicate_object then null; end $$;

-- --- Progressivo di invio ----------------------------------------------------

-- Un contatore per agenzia. Vive in una tabella sua e non su `agencies`
-- perche' l'incremento prende un lock sulla riga, e bloccare l'anagrafica
-- dell'agenzia a ogni fattura significherebbe fermare anche chi sta salvando
-- le impostazioni.
create table if not exists public.sdi_counters (
  agency_id   uuid primary key references public.agencies (id) on delete cascade,
  last_value  bigint not null default 0 check (last_value >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.sdi_counters enable row level security;

drop policy if exists sdi_counters_select on public.sdi_counters;
create policy sdi_counters_select on public.sdi_counters for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

/**
 * Il prossimo progressivo di invio per l'agenzia, in base 36 maiuscola.
 *
 * Vive in `public` e non in `app` perche' la chiama il client attraverso
 * PostgREST, come `create_agency_with_owner`: `app` non e' esposto.
 *
 * Il tracciato lo vuole alfanumerico e lungo al massimo dieci caratteri: la
 * base 36 ci fa stare piu' di tre miliardi di invii in sei cifre, e nessuna
 * agenzia ci arrivera'. La funzione scrive, quindi non e' `stable`.
 */
create or replace function public.next_sdi_progressivo(p_agency_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
  v_resto bigint;
  v_cifre constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_out text := '';
begin
  if not exists (select 1 from public.memberships m
                 join public.agencies a on a.id = m.agency_id
                 where m.agency_id = p_agency_id
                   and m.user_id = auth.uid()
                   and m.is_active
                   and m.deleted_at is null
                   and a.deleted_at is null) then
    raise exception 'Non appartieni a questa agenzia';
  end if;

  insert into public.sdi_counters (agency_id, last_value)
  values (p_agency_id, 1)
  on conflict (agency_id) do update
    set last_value = public.sdi_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  -- Base 36, almeno cinque caratteri: un progressivo lungo uguale si legge
  -- meglio in un elenco di file.
  while v_value > 0 loop
    v_resto := v_value % 36;
    v_out := substr(v_cifre, (v_resto + 1)::int, 1) || v_out;
    v_value := v_value / 36;
  end loop;

  return lpad(coalesce(nullif(v_out, ''), '0'), 5, '0');
end;
$$;

grant execute on function public.next_sdi_progressivo(uuid) to authenticated;
grant select on public.sdi_counters to authenticated, service_role;

-- --- La vista delle righe porta anche la Natura ------------------------------
--
-- Definita nella 0013: qui si riscrive per intero con la colonna in piu',
-- perche' `create or replace view` non permette di aggiungerne una in coda
-- senza ripetere il resto.

create or replace view public.invoice_item_list
with (security_invoker = on) as
select
  ii.id,
  ii.agency_id,
  ii.invoice_id,
  ii.description,
  ii.quantity,
  ii.unit_price_cents,
  ii.cost_cents,
  ii.gross_cents,
  ii.vat_bps,
  ii.vat_regime,
  ii.sort_order,
  app.line_taxable_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime) as taxable_cents,
  app.line_vat_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime) as vat_cents,
  -- Nel 74-ter l'imponibile È il margine: mostrarlo accanto alla riga è
  -- l'unico modo perché chi fattura veda da dove esce l'IVA.
  (ii.gross_cents - ii.cost_cents)::bigint as margin_cents,
  -- In coda e non accanto a `vat_regime`: `create or replace view` sa
  -- aggiungere colonne solo in fondo, e rinominarne una in mezzo sarebbe un
  -- errore silenzioso in attesa di succedere.
  ii.vat_nature
from public.invoice_items ii
where ii.deleted_at is null;
