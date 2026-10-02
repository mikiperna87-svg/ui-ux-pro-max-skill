-- =============================================================================
-- 0013 — Amministrazione: fatture, note di credito, regime art. 74-ter,
--        registro IVA delle vendite.
--
-- Le tabelle (invoices, invoice_items) esistono dalla 0003 con la loro RLS, e
-- il calcolo dell'IVA — compreso il 74-ter, che la scorpora dal margine — sta
-- nella 0004. Qui si cambia *quando* un documento riceve il numero e si
-- aggiunge ciò che rende la fatturazione un modulo fiscale e non una tabella:
--
--   * una bozza non consuma un numero: si numera all'emissione;
--   * una fattura emessa non si modifica e non si elimina: si corregge con una
--     nota di credito;
--   * il registro IVA si legge dal database, non si ricostruisce a mano.
-- =============================================================================

-- --- Il numero si assegna all'emissione ---------------------------------------
-- Prima il numero nasceva con la riga: una bozza scartata lasciava un buco
-- nella numerazione, che per le fatture non è ammesso. Numero e codice sono
-- quindi annullabili finché il documento è una bozza, e obbligatori dopo.
alter table public.invoices alter column number drop not null;
alter table public.invoices alter column code drop not null;

-- La 0010 aveva dato a queste colonne un segnaposto (0 e stringa vuota) perché
-- un inserimento da PostgREST non può omettere una colonna NOT NULL senza
-- default. Ora che sono annullabili il segnaposto è il valore nullo, che dice
-- la stessa cosa senza far finta di essere un numero.
alter table public.invoices alter column number drop default;
alter table public.invoices alter column code drop default;

alter table public.invoices drop constraint if exists invoices_numbered_when_issued;
alter table public.invoices add constraint invoices_numbered_when_issued
  check (status = 'bozza' or (number is not null and code is not null));

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

  -- Una bozza non è ancora un documento fiscale: nessun numero, nessun codice.
  -- Lo zero e la stringa vuota che un client potrebbe mandare al posto del
  -- valore nullo vengono normalizzati qui, non lasciati passare.
  if new.status = 'bozza' then
    new.number := null;
    new.code := null;
    return new;
  end if;

  if coalesce(new.number, 0) = 0 then
    -- L'anno della numerazione è quello della data di emissione, non quello in
    -- cui la bozza è stata aperta: una bozza di dicembre emessa a gennaio
    -- prende il primo numero dell'anno nuovo.
    new.year := extract(year from coalesce(new.issue_date, current_date))::integer;
    new.number := app.next_document_number(
      new.agency_id,
      case when new.kind = 'nota_credito' then 'nota_credito'::app.counter_kind
           else 'fattura'::app.counter_kind end,
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

comment on function app.assign_invoice_code is
  'Numera il documento quando smette di essere una bozza: le bozze non consumano numeri.';

drop trigger if exists invoices_assign_code on public.invoices;
create trigger invoices_assign_code before insert or update on public.invoices
  for each row execute function app.assign_invoice_code();

-- --- Una fattura emessa non si tocca più --------------------------------------
create or replace function app.invoices_guard_issued()
returns trigger
language plpgsql
as $$
begin
  -- Finché è una bozza si cambia tutto: è lì che si lavora.
  if old.status = 'bozza' then
    return new;
  end if;

  if new.code is distinct from old.code
     or new.number is distinct from old.number
     or new.year is distinct from old.year
     or new.kind is distinct from old.kind
     or new.customer_id is distinct from old.customer_id
     or new.booking_id is distinct from old.booking_id
     or new.issue_date is distinct from old.issue_date
     or new.vat_regime is distinct from old.vat_regime
     or new.taxable_cents is distinct from old.taxable_cents
     or new.vat_cents is distinct from old.vat_cents
     or new.total_cents is distinct from old.total_cents then
    raise exception
      'Il documento % è già emesso: si corregge con una nota di credito, non modificandolo',
      old.code;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    raise exception
      'Il documento % è già emesso e non si elimina: si emette una nota di credito',
      old.code;
  end if;

  if old.status = 'annullata' and new.status <> 'annullata' then
    raise exception 'Il documento % è annullato e non si riapre', old.code;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_guard_issued on public.invoices;
create trigger invoices_guard_issued before update on public.invoices
  for each row execute function app.invoices_guard_issued();

create or replace function app.invoice_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_status app.invoice_status;
  v_code text;
begin
  select i.status, i.code into v_status, v_code
  from public.invoices i
  where i.id = coalesce(new.invoice_id, old.invoice_id);

  if v_status is not null and v_status <> 'bozza' then
    raise exception
      'Le righe del documento % non si modificano: è già emesso',
      coalesce(v_code, '');
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_guard on public.invoice_items;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function app.invoice_items_guard();

-- --- L'incasso della pratica è l'incasso della sua fattura --------------------
-- Il cliente paga la pratica; la fattura è il documento di quella pratica. Se
-- il collegamento non lo tiene il database, l'elenco delle fatture mostra
-- "da incassare" su documenti già pagati, che è il modo più rapido per far
-- perdere fiducia in un gestionale.
--
-- La regola è prudente: si collega solo quando non c'è ambiguità, cioè quando
-- la pratica ha una sola fattura emessa. Con due fatture sulla stessa pratica
-- l'attribuzione la fa una persona, indicandola sull'incasso.
create or replace function app.payments_in_link_invoice()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  if new.invoice_id is not null or new.booking_id is null then
    return new;
  end if;

  select i.id into v_invoice_id
  from public.invoices i
  where i.booking_id = new.booking_id
    and i.kind = 'fattura'
    and i.status <> 'bozza'
    and i.deleted_at is null;

  -- select ... into su più righe prende la prima: qui serve invece sapere che
  -- ce n'è una sola, quindi si conta.
  if (
    select count(*) from public.invoices i
    where i.booking_id = new.booking_id
      and i.kind = 'fattura'
      and i.status <> 'bozza'
      and i.deleted_at is null
  ) = 1 then
    new.invoice_id := v_invoice_id;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_in_link_invoice on public.payments_in;
create trigger payments_in_link_invoice before insert on public.payments_in
  for each row execute function app.payments_in_link_invoice();

create or replace function app.invoices_link_payments()
returns trigger
language plpgsql
as $$
begin
  -- Solo al passaggio da bozza a documento, e solo se la pratica non ha altre
  -- fatture emesse: gli incassi già registrati trovano il loro documento.
  if old.status <> 'bozza' or new.status = 'bozza' or new.booking_id is null then
    return new;
  end if;

  if (
    select count(*) from public.invoices i
    where i.booking_id = new.booking_id
      and i.kind = 'fattura'
      and i.status <> 'bozza'
      and i.deleted_at is null
  ) <> 1 then
    return new;
  end if;

  update public.payments_in
  set invoice_id = new.id
  where booking_id = new.booking_id
    and invoice_id is null
    and deleted_at is null;

  return new;
end;
$$;

drop trigger if exists invoices_link_payments on public.invoices;
create trigger invoices_link_payments after update on public.invoices
  for each row execute function app.invoices_link_payments();

-- --- Ricerca sui documenti ----------------------------------------------------
drop view if exists public.invoice_list;

alter table public.invoices drop column if exists search_text;
alter table public.invoices add column search_text text generated always as (
  app.normalize(
    coalesce(code, '') || ' ' ||
    coalesce(notes, '') || ' ' ||
    coalesce(payment_terms, '')
  )
) stored;

create index if not exists invoices_search_idx
  on public.invoices using gin (search_text public.gin_trgm_ops);

-- --- Righe del documento ------------------------------------------------------
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
  (ii.gross_cents - ii.cost_cents)::bigint as margin_cents
from public.invoice_items ii
where ii.deleted_at is null;

comment on view public.invoice_item_list is
  'Righe di fattura con imponibile, IVA e margine gia calcolati secondo il regime della riga.';

-- --- Elenco dei documenti -----------------------------------------------------
create view public.invoice_list
with (security_invoker = on) as
select
  i.id,
  i.agency_id,
  i.kind,
  i.code,
  i.year,
  i.number,
  i.status,
  i.issue_date,
  i.due_date,
  i.vat_regime,
  i.taxable_cents,
  i.vat_cents,
  i.total_cents,
  -- Una nota di credito toglie: nei totali e nei registri entra col segno meno.
  (case when i.kind = 'nota_credito' then -i.total_cents else i.total_cents end)::bigint
    as signed_total_cents,
  i.payment_terms,
  i.notes,
  i.legal_notes,
  i.sent_at,
  i.pdf_path,
  i.customer_id,
  c.display_name as customer_name,
  c.email as customer_email,
  c.vat_number as customer_vat,
  i.booking_id,
  b.code as booking_code,
  b.destination,
  b.owner_id,
  i.credit_note_of,
  origine.code as credit_note_of_code,
  i.created_at,
  i.created_by,
  i.search_text,
  c.search_text as customer_search,
  -- Attribuito fino a concorrenza del totale: il cliente paga la pratica, e su
  -- una pratica in intermediazione ha versato il pacchetto intero mentre la
  -- fattura riguarda la sola provvigione. Oltre il totale non ha significato
  -- per il documento, e l'eccedenza si legge sulla pratica, dove sta davvero.
  least(coalesce(incassi.paid_cents, 0), i.total_cents)::bigint as paid_cents,
  greatest(i.total_cents - coalesce(incassi.paid_cents, 0), 0)::bigint as residual_cents,
  -- Quanto di questa fattura è già stato stornato da note di credito emesse.
  coalesce(storni.credited_cents, 0)::bigint as credited_cents,
  case
    when i.kind = 'nota_credito' then 'nota_credito'
    when i.status in ('bozza', 'annullata') then 'non_dovuta'
    when coalesce(incassi.paid_cents, 0) >= i.total_cents then 'pagata'
    when coalesce(incassi.paid_cents, 0) > 0 then 'parziale'
    else 'da_incassare'
  end as payment_state,
  (
    i.kind = 'fattura'
    and i.status in ('emessa', 'inviata')
    and i.due_date is not null
    and i.due_date < current_date
    and i.total_cents - coalesce(incassi.paid_cents, 0) > 0
  ) as is_overdue,
  case
    when i.due_date is null
      or i.due_date >= current_date
      or i.total_cents - coalesce(incassi.paid_cents, 0) <= 0
    then 0
    else (current_date - i.due_date)
  end as days_late
from public.invoices i
left join public.customers c on c.id = i.customer_id
left join public.bookings b on b.id = i.booking_id
left join public.invoices origine on origine.id = i.credit_note_of
left join lateral (
  select sum(p.amount_cents)::bigint as paid_cents
  from public.payments_in p
  where p.invoice_id = i.id and p.deleted_at is null
) incassi on true
left join lateral (
  select sum(n.total_cents)::bigint as credited_cents
  from public.invoices n
  where n.credit_note_of = i.id
    and n.kind = 'nota_credito'
    and n.status <> 'bozza'
    and n.deleted_at is null
) storni on true
where i.deleted_at is null;

comment on view public.invoice_list is
  'Fatture e note di credito con cliente, pratica, incassato, residuo e ritardo.';

-- --- Registro IVA delle vendite -----------------------------------------------
-- Una riga per mese, tipo di documento, regime e aliquota: è la forma in cui il
-- commercialista lo chiede, ed è anche quella in cui si controlla la
-- liquidazione. Le bozze non ci sono: non sono documenti.
create or replace view public.vat_register
with (security_invoker = on) as
select
  i.agency_id,
  extract(year from i.issue_date)::integer as year,
  extract(month from i.issue_date)::integer as month,
  i.kind,
  i.vat_regime,
  ii.vat_bps,
  count(distinct i.id)::integer as documents_count,
  sum(case when i.kind = 'nota_credito' then -1 else 1 end
      * app.line_taxable_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime))::bigint
    as taxable_cents,
  sum(case when i.kind = 'nota_credito' then -1 else 1 end
      * app.line_vat_cents(ii.gross_cents, ii.cost_cents, ii.vat_bps, ii.vat_regime))::bigint
    as vat_cents,
  sum(case when i.kind = 'nota_credito' then -1 else 1 end * ii.gross_cents)::bigint
    as total_cents,
  -- Nel 74-ter il margine è la base imponibile lorda: tenerlo in chiaro accanto
  -- all'imponibile rende leggibile lo scorporo.
  sum(case when i.kind = 'nota_credito' then -1 else 1 end * (ii.gross_cents - ii.cost_cents))::bigint
    as margin_cents
from public.invoices i
join public.invoice_items ii on ii.invoice_id = i.id and ii.deleted_at is null
where i.deleted_at is null
  and i.status in ('emessa', 'inviata', 'pagata')
group by
  i.agency_id,
  extract(year from i.issue_date),
  extract(month from i.issue_date),
  i.kind,
  i.vat_regime,
  ii.vat_bps;

comment on view public.vat_register is
  'Registro IVA delle vendite: imponibile, imposta e margine per mese, regime e aliquota.';

-- --- Fattura da una pratica ---------------------------------------------------
create or replace function public.invoice_from_booking(
  p_booking_id uuid,
  p_mode text default null
)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_invoice public.invoices;
  v_mode text;
  v_margin bigint;
  v_vat_bps integer;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and deleted_at is null;

  if not found then
    raise exception 'Pratica non trovata' using errcode = 'no_data_found';
  end if;

  -- Un'opzione non è un viaggio venduto e una pratica annullata non si
  -- fattura: si emette semmai una nota di credito su quella già emessa.
  if v_booking.status in ('opzione', 'annullata') then
    raise exception 'Si fattura una pratica confermata: questa è %', v_booking.status;
  end if;

  -- Che cosa si fattura dipende dal tipo di vendita, non da chi preme il
  -- bottone: chi organizza fattura il viaggio in 74-ter, chi intermedia
  -- fattura la propria provvigione con IVA ordinaria.
  v_mode := coalesce(
    nullif(btrim(coalesce(p_mode, '')), ''),
    case when v_booking.sale_type = 'organizzazione' then 'servizi' else 'commissione' end
  );

  if v_mode not in ('servizi', 'commissione') then
    raise exception 'Modalità di fatturazione non prevista: %', v_mode;
  end if;

  if v_booking.customer_id is null then
    raise exception 'Prima di fatturare, indica il cliente intestatario';
  end if;

  select s.default_vat_bps into v_vat_bps
  from public.agency_settings s where s.agency_id = v_booking.agency_id;

  insert into public.invoices (
    agency_id, kind, customer_id, booking_id, issue_date, status, vat_regime,
    payment_terms, notes, legal_notes, created_by
  )
  values (
    v_booking.agency_id,
    'fattura',
    v_booking.customer_id,
    v_booking.id,
    current_date,
    'bozza',
    case when v_mode = 'servizi' then 'art_74_ter'::app.vat_regime
         else 'ordinaria'::app.vat_regime end,
    'Bonifico bancario a 30 giorni data fattura.',
    'Riferimento pratica ' || v_booking.code,
    case when v_mode = 'servizi'
         then 'Operazione soggetta al regime speciale delle agenzie di viaggio, ' ||
              'art. 74-ter D.P.R. 633/72. IVA assolta sul margine.'
         else 'Provvigione di intermediazione soggetta a IVA ordinaria.' end,
    auth.uid()
  )
  returning * into v_invoice;

  if v_mode = 'servizi' then
    insert into public.invoice_items (
      agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
      vat_bps, vat_regime, sort_order, created_by
    )
    select
      v_booking.agency_id, v_invoice.id, s.description, 1,
      s.total_price_cents, s.total_cost_cents,
      s.vat_bps, s.vat_regime, s.sort_order, auth.uid()
    from public.booking_services s
    where s.booking_id = p_booking_id and s.deleted_at is null
    order by s.sort_order, s.created_at;
  else
    select coalesce(sum(s.total_price_cents - s.total_cost_cents + s.commission_cents), 0)
      into v_margin
    from public.booking_services s
    where s.booking_id = p_booking_id and s.deleted_at is null;

    insert into public.invoice_items (
      agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
      vat_bps, vat_regime, sort_order, created_by
    )
    values (
      v_booking.agency_id, v_invoice.id,
      'Commissione di intermediazione su pratica ' || v_booking.code,
      1, greatest(v_margin, 0), 0, coalesce(v_vat_bps, 2200), 'ordinaria', 0, auth.uid()
    );
  end if;

  if not exists (
    select 1 from public.invoice_items where invoice_id = v_invoice.id and deleted_at is null
  ) then
    raise exception 'La pratica % non ha righe da fatturare', v_booking.code;
  end if;

  select * into v_invoice from public.invoices where id = v_invoice.id;

  perform public.log_activity(
    v_booking.agency_id, 'creazione', 'invoices', v_invoice.id, v_booking.code,
    'Bozza di fattura aperta dalla pratica ' || v_booking.code
  );

  return v_invoice;
end;
$$;

comment on function public.invoice_from_booking is
  'Apre una bozza di fattura dalle righe della pratica: servizi in 74-ter oppure provvigione.';

-- --- Emissione ----------------------------------------------------------------
create or replace function public.issue_invoice(
  p_invoice_id uuid,
  p_issue_date date default null
)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Documento non trovato' using errcode = 'no_data_found';
  end if;

  if v_invoice.status <> 'bozza' then
    -- Emettere due volte assegnerebbe un secondo numero allo stesso documento.
    return v_invoice;
  end if;

  if not exists (
    select 1 from public.invoice_items
    where invoice_id = p_invoice_id and deleted_at is null
  ) then
    raise exception 'Prima di emettere, aggiungi almeno una riga';
  end if;

  if p_issue_date is not null and p_issue_date > current_date then
    raise exception 'La data di emissione non può essere nel futuro';
  end if;

  update public.invoices
  set status = 'emessa',
      issue_date = coalesce(p_issue_date, issue_date, current_date),
      due_date = coalesce(due_date, coalesce(p_issue_date, issue_date, current_date) + 30)
  where id = p_invoice_id
  returning * into v_invoice;

  perform public.log_activity(
    v_invoice.agency_id, 'emissione_documento', 'invoices', v_invoice.id, v_invoice.code,
    case when v_invoice.kind = 'nota_credito' then 'Nota di credito ' else 'Fattura ' end ||
      v_invoice.code || ' emessa per ' || app.euro_testo(v_invoice.total_cents)
  );

  return v_invoice;
end;
$$;

comment on function public.issue_invoice is
  'Assegna numero e codice definitivi e chiude la bozza. Chiamata due volte non rinumera.';

-- --- Invio --------------------------------------------------------------------
create or replace function public.send_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices
  where id = p_invoice_id and deleted_at is null;

  if not found then
    raise exception 'Documento non trovato' using errcode = 'no_data_found';
  end if;
  if v_invoice.status = 'bozza' then
    raise exception 'Prima di inviare, emetti il documento';
  end if;

  update public.invoices
  set status = case when status = 'emessa' then 'inviata'::app.invoice_status else status end,
      sent_at = coalesce(sent_at, now())
  where id = p_invoice_id
  returning * into v_invoice;

  perform public.log_activity(
    v_invoice.agency_id, 'cambio_stato', 'invoices', v_invoice.id, v_invoice.code,
    'Documento ' || v_invoice.code || ' inviato al cliente'
  );

  return v_invoice;
end;
$$;

-- --- Nota di credito ----------------------------------------------------------
-- Gli importi della nota restano positivi: è un documento che dice "ti tolgo
-- 500 €", non uno che contiene -500 €. Il segno lo mettono le viste e il
-- registro, dove serve davvero.
create or replace function public.credit_note_for(
  p_invoice_id uuid,
  p_reason text
)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_nota public.invoices;
begin
  select * into v_invoice from public.invoices
  where id = p_invoice_id and deleted_at is null;

  if not found then
    raise exception 'Fattura non trovata' using errcode = 'no_data_found';
  end if;
  if v_invoice.kind <> 'fattura' then
    raise exception 'Una nota di credito si emette su una fattura';
  end if;
  if v_invoice.status = 'bozza' then
    raise exception 'La fattura % è ancora una bozza: modificala, non stornarla',
      coalesce(v_invoice.code, '');
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Serve il motivo dello storno';
  end if;

  if exists (
    select 1 from public.invoices n
    where n.credit_note_of = p_invoice_id and n.status = 'bozza' and n.deleted_at is null
  ) then
    raise exception 'Esiste già una bozza di nota di credito su questa fattura';
  end if;

  insert into public.invoices (
    agency_id, kind, customer_id, booking_id, credit_note_of, issue_date, status,
    vat_regime, notes, legal_notes, created_by
  )
  values (
    v_invoice.agency_id, 'nota_credito', v_invoice.customer_id, v_invoice.booking_id,
    v_invoice.id, current_date, 'bozza', v_invoice.vat_regime,
    btrim(p_reason),
    'Nota di credito a storno della fattura ' || v_invoice.code ||
      ' ai sensi dell''art. 26 D.P.R. 633/72.',
    auth.uid()
  )
  returning * into v_nota;

  insert into public.invoice_items (
    agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
    vat_bps, vat_regime, sort_order, created_by
  )
  select
    v_invoice.agency_id, v_nota.id, ii.description, ii.quantity, ii.unit_price_cents,
    ii.cost_cents, ii.vat_bps, ii.vat_regime, ii.sort_order, auth.uid()
  from public.invoice_items ii
  where ii.invoice_id = p_invoice_id and ii.deleted_at is null
  order by ii.sort_order;

  select * into v_nota from public.invoices where id = v_nota.id;

  perform public.log_activity(
    v_invoice.agency_id, 'creazione', 'invoices', v_nota.id, coalesce(v_invoice.code, ''),
    'Bozza di nota di credito a storno della fattura ' || v_invoice.code || ': ' || btrim(p_reason)
  );

  return v_nota;
end;
$$;

comment on function public.credit_note_for is
  'Bozza di nota di credito che ricalca le righe della fattura. Gli importi restano positivi.';

-- --- Eliminazione di una bozza ------------------------------------------------
create or replace function public.void_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices
  where id = p_invoice_id and deleted_at is null;

  if not found then
    raise exception 'Documento non trovato' using errcode = 'no_data_found';
  end if;
  if v_invoice.status <> 'bozza' then
    raise exception 'Il documento % è già emesso: si storna con una nota di credito',
      v_invoice.code;
  end if;

  update public.invoice_items set deleted_at = now() where invoice_id = p_invoice_id;
  update public.invoices set deleted_at = now() where id = p_invoice_id;

  perform public.log_activity(
    v_invoice.agency_id, 'eliminazione', 'invoices', v_invoice.id, '',
    'Bozza di documento eliminata'
  );
end;
$$;

-- --- Permessi -----------------------------------------------------------------
grant execute on function public.invoice_from_booking(uuid, text) to authenticated;
grant execute on function public.issue_invoice(uuid, date) to authenticated;
grant execute on function public.send_invoice(uuid) to authenticated;
grant execute on function public.credit_note_for(uuid, text) to authenticated;
grant execute on function public.void_draft_invoice(uuid) to authenticated;
