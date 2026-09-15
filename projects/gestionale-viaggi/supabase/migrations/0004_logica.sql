-- =============================================================================
-- 0004 — Logica di dominio a livello di database:
--        numerazione transazionale, calcolo IVA (incluso 74-ter), totali fattura,
--        audit immutabile, viste economiche (margine e stato pagamento).
-- =============================================================================

-- --- Numerazione progressiva annuale -----------------------------------------
-- SECURITY INVOKER: l'accesso al contatore e' protetto dalla RLS di
-- document_counters, quindi un utente non puo' toccare la numerazione di
-- un'altra agenzia. L'UPSERT prende un lock di riga: due pratiche create nello
-- stesso istante ricevono numeri diversi e consecutivi, e un rollback restituisce
-- il numero (nessun buco).
create or replace function app.next_document_number(
  p_agency_id uuid,
  p_kind app.counter_kind,
  p_year integer
)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into public.document_counters as dc (agency_id, kind, year, last_number)
  values (p_agency_id, p_kind, p_year, 1)
  on conflict (agency_id, kind, year)
  do update set last_number = dc.last_number + 1, updated_at = now()
  returning dc.last_number into v_number;

  if v_number is null then
    raise exception 'Numerazione non disponibile per % (anno %)', p_kind, p_year;
  end if;
  return v_number;
end;
$$;

create or replace function app.format_document_code(p_prefix text, p_year integer, p_number integer)
returns text
language sql
immutable
as $$
  select coalesce(p_prefix, '') || p_year::text || '/' || lpad(p_number::text, 4, '0');
$$;

create or replace function app.assign_booking_code()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
begin
  if new.year is null then
    new.year := extract(year from coalesce(new.departure_date, current_date))::integer;
  end if;
  if new.number is null then
    new.number := app.next_document_number(new.agency_id, 'pratica', new.year);
  end if;
  if new.code is null then
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
  if new.year is null then
    new.year := extract(year from current_date)::integer;
  end if;
  if new.number is null then
    new.number := app.next_document_number(new.agency_id, 'preventivo', new.year);
  end if;
  if new.code is null then
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
  if new.year is null then
    new.year := extract(year from coalesce(new.issue_date, current_date))::integer;
  end if;
  if new.number is null then
    new.number := app.next_document_number(
      new.agency_id,
      case when new.kind = 'nota_credito' then 'nota_credito'::app.counter_kind else 'fattura'::app.counter_kind end,
      new.year
    );
  end if;
  if new.code is null then
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

drop trigger if exists bookings_assign_code on public.bookings;
create trigger bookings_assign_code before insert on public.bookings
  for each row execute function app.assign_booking_code();

drop trigger if exists quotes_assign_code on public.quotes;
create trigger quotes_assign_code before insert on public.quotes
  for each row execute function app.assign_quote_code();

drop trigger if exists invoices_assign_code on public.invoices;
create trigger invoices_assign_code before insert on public.invoices
  for each row execute function app.assign_invoice_code();

-- --- Calcolo IVA --------------------------------------------------------------
-- I prezzi al cliente sono LORDI. Da qui discendono due regimi:
--   * ordinaria    -> IVA scorporata dal corrispettivo
--   * art. 74-ter  -> IVA scorporata dal MARGINE (corrispettivo - costi del viaggio);
--                     margine negativo o nullo => IVA zero
--   * esente/fuori campo/reverse charge -> IVA zero
create or replace function app.line_vat_cents(
  p_gross_cents bigint,
  p_cost_cents bigint,
  p_vat_bps integer,
  p_regime app.vat_regime
)
returns bigint
language sql
immutable
as $$
  select case p_regime
    when 'ordinaria' then
      p_gross_cents - round((p_gross_cents::numeric * 10000) / (10000 + p_vat_bps))::bigint
    when 'art_74_ter' then
      case
        when p_gross_cents - p_cost_cents <= 0 then 0::bigint
        else round(((p_gross_cents - p_cost_cents)::numeric * p_vat_bps) / (10000 + p_vat_bps))::bigint
      end
    else 0::bigint
  end;
$$;

comment on function app.line_vat_cents is 'IVA di una riga: sul corrispettivo (ordinaria) o sul margine (74-ter).';

create or replace function app.line_taxable_cents(
  p_gross_cents bigint,
  p_cost_cents bigint,
  p_vat_bps integer,
  p_regime app.vat_regime
)
returns bigint
language sql
immutable
as $$
  select case p_regime
    when 'ordinaria' then p_gross_cents - app.line_vat_cents(p_gross_cents, p_cost_cents, p_vat_bps, p_regime)
    when 'art_74_ter' then
      case
        when p_gross_cents - p_cost_cents <= 0 then 0::bigint
        else (p_gross_cents - p_cost_cents) - app.line_vat_cents(p_gross_cents, p_cost_cents, p_vat_bps, p_regime)
      end
    else p_gross_cents
  end;
$$;

-- --- Totali fattura ricalcolati dalle righe -----------------------------------
create or replace function app.recalculate_invoice_totals(p_invoice_id uuid)
returns void
language sql
as $$
  update public.invoices i
  set taxable_cents = coalesce(t.taxable_cents, 0),
      vat_cents = coalesce(t.vat_cents, 0),
      total_cents = coalesce(t.total_cents, 0),
      updated_at = now()
  from (
    select
      sum(app.line_taxable_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime)) as taxable_cents,
      sum(app.line_vat_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime)) as vat_cents,
      sum(ii.gross_cents) as total_cents
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id and ii.deleted_at is null
  ) t
  where i.id = p_invoice_id;
$$;

create or replace function app.invoice_items_after_change()
returns trigger
language plpgsql
as $$
begin
  perform app.recalculate_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_recalculate on public.invoice_items;
create trigger invoice_items_recalculate
  after insert or update or delete on public.invoice_items
  for each row execute function app.invoice_items_after_change();

-- --- Audit immutabile ---------------------------------------------------------
create or replace function app.block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Il registro attivita e immutabile: operazione % non consentita', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists activity_log_immutable on public.activity_log;
create trigger activity_log_immutable
  before update or delete on public.activity_log
  for each row execute function app.block_mutation();

-- --- updated_at automatico su tutte le tabelle --------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and a.attnum > 0
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      r.table_name || '_touch_updated_at', r.table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
      r.table_name || '_touch_updated_at', r.table_name
    );
  end loop;
end;
$$;

-- --- Viste economiche ---------------------------------------------------------
-- security_invoker: la vista applica la RLS di chi interroga, non del creatore.

-- Riga di servizio arricchita con imponibile e IVA secondo il regime.
create or replace view public.booking_service_amounts
with (security_invoker = on) as
select
  s.id,
  s.agency_id,
  s.booking_id,
  s.total_price_cents,
  s.total_cost_cents,
  s.commission_cents,
  (s.total_price_cents - s.total_cost_cents + s.commission_cents) as margin_cents,
  app.line_taxable_cents(s.total_price_cents, s.total_cost_cents, s.vat_bps, s.vat_regime) as taxable_cents,
  app.line_vat_cents(s.total_price_cents, s.total_cost_cents, s.vat_bps, s.vat_regime) as vat_cents
from public.booking_services s
where s.deleted_at is null;

-- Quadro economico della pratica: e' la fonte unica di margine e stato pagamento.
create or replace view public.booking_financials
with (security_invoker = on) as
select
  b.id as booking_id,
  b.agency_id,
  coalesce(sv.revenue_cents, 0) as revenue_cents,
  coalesce(sv.cost_cents, 0) as cost_cents,
  coalesce(sv.commission_cents, 0) as commission_cents,
  coalesce(sv.vat_cents, 0) as vat_cents,
  (coalesce(sv.revenue_cents, 0) - coalesce(sv.cost_cents, 0) + coalesce(sv.commission_cents, 0)) as margin_cents,
  case
    when coalesce(sv.revenue_cents, 0) = 0 then 0
    else round(
      ((coalesce(sv.revenue_cents, 0) - coalesce(sv.cost_cents, 0) + coalesce(sv.commission_cents, 0))::numeric * 10000)
      / coalesce(sv.revenue_cents, 0)
    )::integer
  end as margin_bps,
  coalesce(pi.paid_cents, 0) as paid_cents,
  (coalesce(sv.revenue_cents, 0) - coalesce(pi.paid_cents, 0)) as balance_cents,
  coalesce(po.supplier_due_cents, 0) as supplier_due_cents,
  inst.next_due_date,
  coalesce(inst.due_so_far_cents, 0) as due_so_far_cents,
  case
    when coalesce(pi.paid_cents, 0) >= coalesce(sv.revenue_cents, 0) and coalesce(sv.revenue_cents, 0) > 0
      then 'saldata'::app.payment_state
    when coalesce(inst.due_so_far_cents, 0) > coalesce(pi.paid_cents, 0)
      then 'in_ritardo'::app.payment_state
    when inst.next_due_date is null
         and b.departure_date is not null
         and b.departure_date < current_date
         and coalesce(pi.paid_cents, 0) < coalesce(sv.revenue_cents, 0)
         and b.status <> 'annullata'
      then 'in_ritardo'::app.payment_state
    when coalesce(pi.paid_cents, 0) > 0 then 'acconto_versato'::app.payment_state
    else 'non_pagata'::app.payment_state
  end as payment_state
from public.bookings b
left join lateral (
  select
    sum(s.total_price_cents) as revenue_cents,
    sum(s.total_cost_cents) as cost_cents,
    sum(s.commission_cents) as commission_cents,
    sum(app.line_vat_cents(s.total_price_cents, s.total_cost_cents, s.vat_bps, s.vat_regime)) as vat_cents
  from public.booking_services s
  where s.booking_id = b.id and s.deleted_at is null
) sv on true
left join lateral (
  select sum(p.amount_cents) as paid_cents
  from public.payments_in p
  where p.booking_id = b.id and p.deleted_at is null
) pi on true
left join lateral (
  select sum(p.amount_cents) as supplier_due_cents
  from public.payments_out p
  where p.booking_id = b.id and p.deleted_at is null and p.status in ('da_pagare', 'programmato')
) po on true
left join lateral (
  select
    min(i.due_date) filter (where i.due_date >= current_date) as next_due_date,
    sum(i.amount_cents) filter (where i.due_date <= current_date) as due_so_far_cents
  from public.installments i
  where i.booking_id = b.id and i.deleted_at is null
) inst on true
where b.deleted_at is null;

comment on view public.booking_financials is
  'Margine = ricavi - costi + commissioni. Stato pagamento derivato da incassi e piano rateale.';
