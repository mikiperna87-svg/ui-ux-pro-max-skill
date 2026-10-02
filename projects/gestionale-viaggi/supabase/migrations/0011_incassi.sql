-- =============================================================================
-- 0011 — Incassi e scadenze.
--
-- Le tabelle (installments, installment_plans, payments_in, payments_out)
-- esistono dalla 0003 con la loro RLS. Qui si aggiungono gli oggetti derivati
-- che lo scadenzario interroga e le operazioni di dominio che devono essere
-- transazionali: registrare un incasso, allineare i pagamenti ai fornitori,
-- cambiare lo stato di un pagamento.
--
-- Regola di attribuzione: gli incassi coprono le scadenze in ordine di data.
-- È quello che farebbe chiunque riconciliando a mano, e sta scritta una volta
-- sola, qui dentro: la scheda della pratica e lo scadenzario leggono entrambi
-- installment_list, quindi non possono contraddirsi sulla stessa rata.
-- =============================================================================

-- --- Importi scritti come li legge un italiano -------------------------------
-- to_char lavora con la locale del database (qui C: virgola per le migliaia,
-- punto per i decimali). I due separatori si scambiano, così il registro dice
-- "1.234,56" e non "1,234.56" a chi lo legge.
create or replace function app.euro_testo(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(p_cents / 100.0, 'FM999G999G999G990D00'), ',.', '.,')
$$;

comment on function app.euro_testo is 'Importo in centesimi scritto all italiana, per i messaggi del registro attivita.';

-- --- Indici mancanti ----------------------------------------------------------
-- sync_booking_payouts cerca il pagamento che nasce da una riga di servizio.
create index if not exists payments_out_service_idx
  on public.payments_out (booking_service_id)
  where deleted_at is null;

-- --- Vista delle scadenze verso il cliente ------------------------------------
-- Il tipo di una colonna non si cambia con "create or replace": la vista si
-- ricrea, così una riesecuzione della migrazione resta possibile.
drop view if exists public.installment_list;

create view public.installment_list
with (security_invoker = on) as
select
  i.id,
  i.agency_id,
  i.plan_id,
  i.booking_id,
  i.kind,
  i.due_date,
  i.amount_cents,
  i.sort_order,
  i.notes,
  i.created_at,
  b.code as booking_code,
  b.title as booking_title,
  b.destination,
  b.departure_date,
  b.status as booking_status,
  b.owner_id,
  b.customer_id,
  c.display_name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  -- Cercare una scadenza significa cercare la pratica o il cliente: le due
  -- colonne indicizzate arrivano qui accanto, così la ricerca resta una sola
  -- interrogazione invece di un giro sul client.
  b.search_text as booking_search,
  c.search_text as customer_search,
  -- sum() su bigint restituisce numeric, e numeric arriva al client come
  -- stringa: senza questi cast un importo finirebbe concatenato invece che
  -- sommato. Stessa conversione di booking_financials.
  coperta.covered_cents::bigint as covered_cents,
  (i.amount_cents - coperta.covered_cents)::bigint as residual_cents,
  -- Precedenza: saldata, parziale, scaduta, attesa. Una rata coperta a metà si
  -- legge "parziale" anche se la data è passata; per il ritardo c'è is_late,
  -- che è la colonna su cui filtra lo scadenzario.
  case
    when coperta.covered_cents >= i.amount_cents and i.amount_cents > 0 then 'saldata'
    when coperta.covered_cents > 0 then 'parziale'
    when i.due_date < current_date then 'scaduta'
    else 'attesa'
  end as state,
  (i.amount_cents - coperta.covered_cents) > 0 and i.due_date < current_date as is_late,
  (current_date - i.due_date)::int as days_late
from public.installments i
join public.bookings b on b.id = i.booking_id
join public.customers c on c.id = b.customer_id
left join lateral (
  select
    greatest(
      0,
      least(
        i.amount_cents,
        coalesce(pay.paid_cents, 0) - coalesce(prima.amount_cents, 0)
      )
    ) as covered_cents
  from (
    select coalesce(sum(p.amount_cents), 0) as paid_cents
    from public.payments_in p
    where p.booking_id = i.booking_id and p.deleted_at is null
  ) pay
  left join lateral (
    select coalesce(sum(x.amount_cents), 0) as amount_cents
    from public.installments x
    where x.booking_id = i.booking_id
      and x.deleted_at is null
      and (x.due_date, x.sort_order, x.id) < (i.due_date, i.sort_order, i.id)
  ) prima on true
) coperta on true
where i.deleted_at is null and b.deleted_at is null;

comment on view public.installment_list is
  'Scadenze del cliente con l incasso gia attribuito in ordine di data, residuo e stato. Filtrare il ritardo su is_late.';

-- --- Vista degli incassi ------------------------------------------------------
create or replace view public.payment_in_list
with (security_invoker = on) as
select
  p.id,
  p.agency_id,
  p.booking_id,
  p.installment_id,
  p.invoice_id,
  p.customer_id,
  p.kind,
  p.method,
  p.amount_cents,
  p.paid_at,
  p.reference,
  p.notes,
  p.created_at,
  p.created_by,
  b.code as booking_code,
  b.title as booking_title,
  b.destination,
  b.status as booking_status,
  b.owner_id,
  c.display_name as customer_name,
  i.kind as installment_kind,
  i.due_date as installment_due_date,
  b.search_text as booking_search,
  c.search_text as customer_search
from public.payments_in p
left join public.bookings b on b.id = p.booking_id
left join public.customers c on c.id = coalesce(p.customer_id, b.customer_id)
left join public.installments i on i.id = p.installment_id
where p.deleted_at is null;

comment on view public.payment_in_list is
  'Incassi con la pratica, il cliente e la scadenza a cui sono stati attribuiti.';

-- --- Vista dei pagamenti ai fornitori -----------------------------------------
drop view if exists public.payout_list;

create view public.payout_list
with (security_invoker = on) as
select
  p.id,
  p.agency_id,
  p.booking_id,
  p.booking_service_id,
  p.supplier_id,
  p.amount_cents,
  p.due_date,
  p.paid_at,
  p.status,
  p.method,
  p.reference,
  p.supplier_invoice_number,
  p.notes,
  p.created_at,
  s.name as supplier_name,
  s.iban as supplier_iban,
  b.code as booking_code,
  b.title as booking_title,
  b.destination,
  b.departure_date,
  b.status as booking_status,
  b.owner_id,
  sv.description as service_description,
  sv.service_type,
  p.status in ('da_pagare', 'programmato') and p.due_date < current_date as is_late,
  (current_date - p.due_date)::int as days_late,
  b.search_text as booking_search,
  s.search_text as supplier_search
from public.payments_out p
join public.suppliers s on s.id = p.supplier_id
left join public.bookings b on b.id = p.booking_id
left join public.booking_services sv on sv.id = p.booking_service_id
where p.deleted_at is null;

comment on view public.payout_list is
  'Pagamenti ai fornitori con la pratica, la riga di servizio di origine e il ritardo.';

-- --- Registrazione di un incasso ---------------------------------------------
create or replace function public.record_payment_in(
  p_booking_id uuid,
  p_amount_cents bigint,
  p_paid_at date,
  p_kind app.payment_in_kind,
  p_method app.payment_method,
  p_installment_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.payments_in
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment public.payments_in;
  v_esistente public.payments_in;
  v_totale bigint;
  v_rata public.installments;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and deleted_at is null;

  if not found then
    raise exception 'Pratica non trovata' using errcode = 'no_data_found';
  end if;

  if v_booking.status = 'annullata' then
    raise exception 'La pratica e'' annullata: non si registrano incassi';
  end if;

  -- Un rimborso è l uscita di denaro gia' incassato, e si scrive in negativo.
  -- Ogni altro tipo di movimento in negativo sarebbe un rimborso mascherato.
  if p_kind = 'rimborso' then
    if p_amount_cents >= 0 then
      raise exception 'Un rimborso si registra con un importo negativo';
    end if;
  elsif p_amount_cents <= 0 then
    raise exception 'L importo dell incasso deve essere maggiore di zero';
  end if;

  if p_paid_at > current_date then
    raise exception 'La data dell incasso non puo'' essere nel futuro';
  end if;

  -- Il doppio invio di un modulo non deve diventare un doppio incasso.
  if p_idempotency_key is not null then
    select * into v_esistente
    from public.payments_in
    where agency_id = v_booking.agency_id and idempotency_key = p_idempotency_key;

    if found then
      return v_esistente;
    end if;
  end if;

  if p_installment_id is not null then
    select * into v_rata
    from public.installments
    where id = p_installment_id and booking_id = p_booking_id and deleted_at is null;

    if not found then
      raise exception 'La scadenza indicata non appartiene a questa pratica';
    end if;
  end if;

  insert into public.payments_in (
    agency_id, booking_id, installment_id, customer_id, kind, method,
    amount_cents, paid_at, reference, notes, idempotency_key, created_by
  )
  values (
    v_booking.agency_id, p_booking_id, p_installment_id, v_booking.customer_id, p_kind, p_method,
    p_amount_cents, p_paid_at, nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_idempotency_key, '')), ''), auth.uid()
  )
  returning * into v_payment;

  -- Chiudere i promemoria delle scadenze ormai coperte: un task che resta
  -- aperto accanto a una rata saldata insegna a ignorare i task.
  select coalesce(sum(amount_cents), 0) into v_totale
  from public.payments_in
  where booking_id = p_booking_id and deleted_at is null;

  -- completed_by punta alla membership, non all utente: auth.uid() qui
  -- violerebbe la chiave esterna.
  update public.tasks t
  set status = 'completato',
      completed_at = now(),
      completed_by = app.current_membership_id(v_booking.agency_id)
  where t.booking_id = p_booking_id
    and t.deleted_at is null
    and t.status in ('aperto', 'in_corso')
    and t.kind in ('scadenza_acconto', 'scadenza_saldo')
    and exists (
      select 1
      from public.installments i
      left join lateral (
        select coalesce(sum(x.amount_cents), 0) as prima_cents
        from public.installments x
        where x.booking_id = i.booking_id
          and x.deleted_at is null
          and (x.due_date, x.sort_order, x.id) < (i.due_date, i.sort_order, i.id)
      ) prima on true
      where i.booking_id = p_booking_id
        and i.deleted_at is null
        and i.kind::text = replace(t.kind::text, 'scadenza_', '')
        and v_totale - prima.prima_cents >= i.amount_cents
    );

  perform public.log_activity(
    v_booking.agency_id,
    'incasso',
    'payments_in',
    v_payment.id,
    v_booking.code,
    'Incasso di ' || app.euro_testo(p_amount_cents) || ' euro sulla pratica ' || v_booking.code,
    null,
    to_jsonb(v_payment)
  );

  return v_payment;
end;
$$;

comment on function public.record_payment_in is
  'Registra un incasso, lo attribuisce alla scadenza, chiude i promemoria coperti e scrive il registro. Ripetibile con la stessa chiave di idempotenza.';

-- --- Storno di un incasso -----------------------------------------------------
create or replace function public.void_payment_in(p_payment_id uuid, p_reason text)
returns public.payments_in
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments_in;
  v_booking public.bookings;
begin
  select * into v_payment
  from public.payments_in
  where id = p_payment_id and deleted_at is null;

  if not found then
    raise exception 'Incasso non trovato' using errcode = 'no_data_found';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Serve un motivo per stornare un incasso';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id;

  update public.payments_in
  set deleted_at = now(),
      notes = btrim(coalesce(notes || ' · ', '') || 'Stornato: ' || btrim(p_reason))
  where id = p_payment_id
  returning * into v_payment;

  perform public.log_activity(
    v_payment.agency_id,
    'incasso',
    'payments_in',
    v_payment.id,
    coalesce(v_booking.code, ''),
    'Storno di un incasso di ' || app.euro_testo(v_payment.amount_cents) || ' euro: ' || btrim(p_reason),
    null,
    to_jsonb(v_payment)
  );

  return v_payment;
end;
$$;

comment on function public.void_payment_in is
  'Storna un incasso con motivo obbligatorio. Non cancella la riga: la marca e la lascia nel registro.';

-- --- Allineamento dei pagamenti ai fornitori ----------------------------------
create or replace function public.sync_booking_payouts(p_booking_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_riga record;
  v_esistente public.payments_out;
  v_scadenza date;
  v_toccati integer := 0;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and deleted_at is null;

  if not found then
    raise exception 'Pratica non trovata' using errcode = 'no_data_found';
  end if;

  for v_riga in
    select s.*
    from public.booking_services s
    where s.booking_id = p_booking_id
      and s.deleted_at is null
      and s.supplier_id is not null
      and s.total_cost_cents > 0
    order by s.sort_order, s.created_at
  loop
    -- Senza scadenza dichiarata sulla riga si paga una settimana prima della
    -- partenza: è la regola che le agenzie usano quando il fornitore non ne
    -- impone una, e resta modificabile a mano.
    v_scadenza := coalesce(
      v_riga.supplier_due_date,
      v_booking.departure_date - 7,
      current_date + 7
    );

    select * into v_esistente
    from public.payments_out
    where booking_service_id = v_riga.id and deleted_at is null
    limit 1;

    if not found then
      insert into public.payments_out (
        agency_id, booking_id, booking_service_id, supplier_id,
        amount_cents, due_date, status, created_by
      )
      values (
        v_booking.agency_id, p_booking_id, v_riga.id, v_riga.supplier_id,
        v_riga.total_cost_cents, v_scadenza, 'da_pagare', auth.uid()
      );
      v_toccati := v_toccati + 1;

    elsif v_esistente.status in ('da_pagare', 'programmato') then
      -- Un pagamento gia' eseguito non si riallinea: il denaro è uscito per
      -- quell importo, e cambiarlo qui falsificherebbe la cassa.
      if v_esistente.amount_cents <> v_riga.total_cost_cents
         or v_esistente.due_date <> v_scadenza
         or v_esistente.supplier_id <> v_riga.supplier_id then
        update public.payments_out
        set amount_cents = v_riga.total_cost_cents,
            due_date = v_scadenza,
            supplier_id = v_riga.supplier_id
        where id = v_esistente.id;
        v_toccati := v_toccati + 1;
      end if;
    end if;
  end loop;

  -- Righe di servizio sparite: il pagamento non ancora eseguito sparisce con
  -- loro, quello eseguito resta e va stornato a mano.
  update public.payments_out o
  set deleted_at = now()
  where o.booking_id = p_booking_id
    and o.deleted_at is null
    and o.status in ('da_pagare', 'programmato')
    and o.booking_service_id is not null
    and not exists (
      select 1 from public.booking_services s
      where s.id = o.booking_service_id and s.deleted_at is null and s.supplier_id is not null
        and s.total_cost_cents > 0
    );

  if v_toccati > 0 then
    perform public.log_activity(
      v_booking.agency_id,
      'pagamento',
      'bookings',
      p_booking_id,
      v_booking.code,
      'Allineati ' || v_toccati || ' pagamenti ai fornitori della pratica ' || v_booking.code
    );
  end if;

  return v_toccati;
end;
$$;

comment on function public.sync_booking_payouts is
  'Allinea i pagamenti ai fornitori alle righe di servizio della pratica. Ripetibile: non tocca cio che è gia stato pagato.';

-- --- Stato di un pagamento al fornitore ---------------------------------------
create or replace function public.set_payout_status(
  p_payout_id uuid,
  p_status app.payout_status,
  p_paid_at date default null,
  p_method app.payment_method default null,
  p_reference text default null,
  p_supplier_invoice_number text default null
)
returns public.payments_out
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payout public.payments_out;
  v_booking public.bookings;
  v_fornitore text;
begin
  select * into v_payout
  from public.payments_out
  where id = p_payout_id and deleted_at is null;

  if not found then
    raise exception 'Pagamento non trovato' using errcode = 'no_data_found';
  end if;

  if p_status = 'pagato' and coalesce(p_paid_at, current_date) > current_date then
    raise exception 'La data del pagamento non puo'' essere nel futuro';
  end if;

  update public.payments_out
  set status = p_status,
      paid_at = case when p_status = 'pagato' then coalesce(p_paid_at, current_date) else null end,
      method = coalesce(p_method, method),
      reference = coalesce(nullif(btrim(coalesce(p_reference, '')), ''), reference),
      supplier_invoice_number = coalesce(
        nullif(btrim(coalesce(p_supplier_invoice_number, '')), ''),
        supplier_invoice_number
      )
  where id = p_payout_id
  returning * into v_payout;

  select * into v_booking from public.bookings where id = v_payout.booking_id;
  select name into v_fornitore from public.suppliers where id = v_payout.supplier_id;

  perform public.log_activity(
    v_payout.agency_id,
    'pagamento',
    'payments_out',
    v_payout.id,
    coalesce(v_booking.code, coalesce(v_fornitore, '')),
    'Pagamento di ' || app.euro_testo(v_payout.amount_cents) || ' euro a ' ||
      coalesce(v_fornitore, 'fornitore') || ': ' || p_status::text,
    null,
    to_jsonb(v_payout)
  );

  return v_payout;
end;
$$;

comment on function public.set_payout_status is
  'Cambia lo stato di un pagamento al fornitore e ne scrive il registro. La data di pagamento esiste solo per lo stato pagato.';

-- --- Permessi -----------------------------------------------------------------
grant execute on function public.record_payment_in(uuid, bigint, date, app.payment_in_kind, app.payment_method, uuid, text, text, text) to authenticated;
grant execute on function public.void_payment_in(uuid, text) to authenticated;
grant execute on function public.sync_booking_payouts(uuid) to authenticated;
grant execute on function public.set_payout_status(uuid, app.payout_status, date, app.payment_method, text, text) to authenticated;
