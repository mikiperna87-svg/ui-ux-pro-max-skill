-- =============================================================================
-- 0009 — Ricerca sulle anagrafiche, quadri di sintesi e adempimenti GDPR.
-- =============================================================================

-- --- Normalizzazione per la ricerca ------------------------------------------
-- unaccent() e' dichiarata STABLE perche' in teoria il dizionario potrebbe
-- cambiare; indicandolo in modo esplicito la chiamata e' di fatto
-- deterministica. Serve pero' plpgsql e non sql: una funzione sql di una sola
-- istruzione viene incorporata nell'espressione chiamante, e a quel punto
-- Postgres valuterebbe la volatilita' di unaccent invece della nostra.
--
-- Contropartita accettata: se il dizionario unaccent venisse sostituito, le
-- colonne search_text gia' calcolate non si aggiornerebbero da sole. Il
-- dizionario e' statico, e in quel caso basterebbe ricalcolare le colonne.
create or replace function app.normalize(p_text text)
returns text
language plpgsql
immutable
as $$
begin
  return lower(public.unaccent('public.unaccent'::regdictionary, coalesce(p_text, '')));
end;
$$;

comment on function app.normalize is 'Minuscolo e senza accenti: forma canonica usata dalla ricerca.';

-- --- Carattere di controllo del codice fiscale --------------------------------
-- Serve al seed per produrre codici fiscali dimostrativi che superino gli
-- stessi controlli applicati dall'interfaccia: dati di prova non validi
-- renderebbero impossibile modificare una scheda senza prima correggerla.
create or replace function app.tax_code_with_checksum(p_first15 text)
returns text
language plpgsql
immutable
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_odd integer[] := array[
    1, 0, 5, 7, 9, 13, 15, 17, 19, 21,
    1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23
  ];
  v_value text := upper(p_first15);
  v_sum integer := 0;
  v_index integer;
  v_position integer;
begin
  if v_value !~ '^[A-Z0-9]{15}$' then
    raise exception 'Il codice fiscale parziale deve avere 15 caratteri alfanumerici: %', p_first15;
  end if;

  for v_index in 1..15 loop
    v_position := strpos(v_alphabet, substr(v_value, v_index, 1));
    if v_index % 2 = 1 then
      v_sum := v_sum + v_odd[v_position];
    else
      -- Nelle posizioni pari il peso e' il valore ordinale: le cifre valgono
      -- se stesse, le lettere partono da zero (A=0 ... Z=25). Le due serie
      -- vanno trattate separatamente, non con un modulo sull'alfabeto unico.
      v_sum := v_sum + case
        when v_position <= 10 then v_position - 1
        else v_position - 11
      end;
    end if;
  end loop;

  return v_value || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (v_sum % 26) + 1, 1);
end;
$$;

-- Cifra di controllo della partita IVA (Luhn sulle posizioni pari).
-- Serve al seed per la stessa ragione della funzione qui sopra: i dati
-- dimostrativi devono superare i controlli che l'applicazione applica
-- all'inserimento, altrimenti la prima modifica di un cliente di prova
-- fallirebbe su un dato che il progetto stesso ha scritto.
create or replace function app.vat_number_with_checksum(p_first10 text)
returns text
language plpgsql
immutable
as $$
declare
  v_value text := p_first10;
  v_sum integer := 0;
  v_digit integer;
  v_index integer;
begin
  if v_value !~ '^[0-9]{10}$' then
    raise exception 'La partita IVA parziale deve avere 10 cifre: %', p_first10;
  end if;

  for v_index in 1..10 loop
    v_digit := substr(v_value, v_index, 1)::integer;
    if v_index % 2 = 0 then
      v_digit := v_digit * 2;
      if v_digit > 9 then
        v_digit := v_digit - 9;
      end if;
    end if;
    v_sum := v_sum + v_digit;
  end loop;

  return v_value || ((10 - (v_sum % 10)) % 10)::text;
end;
$$;

-- --- Testo di ricerca sulle anagrafiche --------------------------------------
-- Una colonna generata per tabella: PostgREST puo' filtrarla con ilike, e
-- l'indice trigram rende la ricerca "contiene" veloce anche su molte righe.
--
-- La concatenazione e' scritta con || e non con concat_ws: quest'ultima e'
-- dichiarata STABLE (dipende dalle funzioni di output dei tipi) e non sarebbe
-- ammessa in una colonna generata.
alter table public.customers
  drop column if exists search_text;
alter table public.customers
  add column search_text text generated always as (
    app.normalize(
      coalesce(company_name, '')
      || ' ' || coalesce(last_name, '')
      || ' ' || coalesce(first_name, '')
      || ' ' || coalesce(email, '')
      || ' ' || coalesce(phone, '')
      || ' ' || coalesce(mobile, '')
      || ' ' || coalesce(tax_code, '')
      || ' ' || coalesce(vat_number, '')
      || ' ' || coalesce(city, '')
    )
  ) stored;

create index if not exists customers_search_idx
  on public.customers using gin (search_text gin_trgm_ops);

alter table public.passengers
  drop column if exists search_text;
alter table public.passengers
  add column search_text text generated always as (
    app.normalize(
      coalesce(last_name, '')
      || ' ' || coalesce(first_name, '')
      || ' ' || coalesce(email, '')
      || ' ' || coalesce(phone, '')
      || ' ' || coalesce(tax_code, '')
      || ' ' || coalesce(document_number, '')
      || ' ' || coalesce(birth_place, '')
    )
  ) stored;

create index if not exists passengers_search_idx
  on public.passengers using gin (search_text gin_trgm_ops);

alter table public.suppliers
  drop column if exists search_text;
alter table public.suppliers
  add column search_text text generated always as (
    app.normalize(
      coalesce(name, '')
      || ' ' || coalesce(legal_name, '')
      || ' ' || coalesce(email, '')
      || ' ' || coalesce(phone, '')
      || ' ' || coalesce(contact_name, '')
      || ' ' || coalesce(vat_number, '')
      || ' ' || coalesce(city, '')
    )
  ) stored;

create index if not exists suppliers_search_idx
  on public.suppliers using gin (search_text gin_trgm_ops);

-- --- Quadro di sintesi del cliente -------------------------------------------
create or replace view public.customer_stats
with (security_invoker = on) as
select
  c.id as customer_id,
  c.agency_id,
  coalesce(b.bookings_count, 0)::integer as bookings_count,
  coalesce(b.active_count, 0)::integer as active_count,
  coalesce(b.cancelled_count, 0)::integer as cancelled_count,
  coalesce(b.lifetime_value_cents, 0)::bigint as lifetime_value_cents,
  coalesce(b.lifetime_margin_cents, 0)::bigint as lifetime_margin_cents,
  coalesce(b.open_balance_cents, 0)::bigint as open_balance_cents,
  b.first_departure,
  b.last_departure,
  b.next_departure,
  coalesce(p.passengers_count, 0)::integer as passengers_count
from public.customers c
left join lateral (
  select
    count(*) as bookings_count,
    count(*) filter (where bk.status in ('confermata', 'partita')) as active_count,
    count(*) filter (where bk.status = 'annullata') as cancelled_count,
    sum(f.revenue_cents) filter (where bk.status <> 'annullata')::bigint as lifetime_value_cents,
    sum(f.margin_cents) filter (where bk.status <> 'annullata')::bigint as lifetime_margin_cents,
    sum(f.balance_cents) filter (where bk.status <> 'annullata' and f.balance_cents > 0)::bigint as open_balance_cents,
    min(bk.departure_date) as first_departure,
    max(bk.departure_date) filter (where bk.departure_date <= current_date) as last_departure,
    min(bk.departure_date) filter (where bk.departure_date > current_date) as next_departure
  from public.bookings bk
  join public.booking_financials f on f.booking_id = bk.id
  where bk.customer_id = c.id and bk.deleted_at is null
) b on true
left join lateral (
  select count(*) as passengers_count
  from public.passengers pg
  where pg.customer_id = c.id and pg.deleted_at is null
) p on true
where c.deleted_at is null;

comment on view public.customer_stats is 'Storico e valore generato dal cliente: le pratiche annullate non contano nel valore.';

-- --- Quadro di sintesi del fornitore -----------------------------------------
create or replace view public.supplier_stats
with (security_invoker = on) as
select
  s.id as supplier_id,
  s.agency_id,
  coalesce(sv.services_count, 0)::integer as services_count,
  coalesce(sv.bookings_count, 0)::integer as bookings_count,
  coalesce(sv.cost_cents, 0)::bigint as cost_cents,
  coalesce(sv.revenue_cents, 0)::bigint as revenue_cents,
  coalesce(sv.margin_cents, 0)::bigint as margin_cents,
  case
    when coalesce(sv.revenue_cents, 0) = 0 then 0
    else round((coalesce(sv.margin_cents, 0)::numeric * 10000) / sv.revenue_cents)::integer
  end as margin_bps,
  coalesce(po.open_cents, 0)::bigint as open_payable_cents,
  coalesce(po.overdue_cents, 0)::bigint as overdue_payable_cents,
  po.next_due_date,
  sv.last_service_date
from public.suppliers s
left join lateral (
  select
    count(*) as services_count,
    count(distinct bs.booking_id) as bookings_count,
    sum(bs.total_cost_cents)::bigint as cost_cents,
    sum(bs.total_price_cents)::bigint as revenue_cents,
    sum(bs.total_price_cents - bs.total_cost_cents + bs.commission_cents)::bigint as margin_cents,
    max(bs.date_from) as last_service_date
  from public.booking_services bs
  join public.bookings bk on bk.id = bs.booking_id and bk.deleted_at is null and bk.status <> 'annullata'
  where bs.supplier_id = s.id and bs.deleted_at is null
) sv on true
left join lateral (
  select
    sum(p.amount_cents)::bigint as open_cents,
    sum(p.amount_cents) filter (where p.due_date < current_date)::bigint as overdue_cents,
    min(p.due_date) filter (where p.due_date >= current_date) as next_due_date
  from public.payments_out p
  where p.supplier_id = s.id and p.deleted_at is null and p.status in ('da_pagare', 'programmato')
) po on true
where s.deleted_at is null;

comment on view public.supplier_stats is 'Volumi, marginalità e scadenzario per fornitore.';

-- --- Stato dei documenti dei passeggeri ---------------------------------------
create or replace view public.passenger_documents
with (security_invoker = on) as
select
  p.id as passenger_id,
  p.agency_id,
  p.document_expires_at,
  t.next_return_date,
  (p.document_expires_at - current_date)::integer as days_to_expiry,
  case
    when p.document_expires_at is null then 'assente'
    when p.document_expires_at < current_date then 'scaduto'
    -- Il documento deve essere valido almeno fino al rientro dal viaggio.
    when t.next_return_date is not null and p.document_expires_at < t.next_return_date then 'insufficiente'
    when p.document_expires_at <= current_date + coalesce(st.passenger_document_alert_days, 30) then 'in_scadenza'
    else 'valido'
  end as document_state
from public.passengers p
left join public.agency_settings st on st.agency_id = p.agency_id
left join lateral (
  select min(bk.return_date) as next_return_date
  from public.booking_passengers bp
  join public.bookings bk on bk.id = bp.booking_id
  where bp.passenger_id = p.id
    and bp.deleted_at is null
    and bk.deleted_at is null
    and bk.status in ('opzione', 'confermata', 'partita')
    and bk.return_date >= current_date
) t on true
where p.deleted_at is null;

comment on view public.passenger_documents is
  'Stato del documento rispetto a oggi e al rientro dal prossimo viaggio.';

-- --- GDPR: esportazione dei dati del cliente ----------------------------------
create or replace function public.export_customer_data(p_customer_id uuid)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'esportato_il', now(),
    'cliente', to_jsonb(c) - 'search_text',
    'passeggeri', coalesce((
      select jsonb_agg(to_jsonb(p) - 'search_text' order by p.last_name, p.first_name)
      from public.passengers p
      where p.customer_id = c.id and p.deleted_at is null
    ), '[]'::jsonb),
    'pratiche', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'riferimento', b.code,
          'titolo', b.title,
          'destinazione', b.destination,
          'partenza', b.departure_date,
          'rientro', b.return_date,
          'stato', b.status,
          'passeggeri', b.pax_count,
          'totale_centesimi', f.revenue_cents,
          'incassato_centesimi', f.paid_cents
        ) order by b.departure_date desc
      )
      from public.bookings b
      join public.booking_financials f on f.booking_id = b.id
      where b.customer_id = c.id and b.deleted_at is null
    ), '[]'::jsonb),
    'incassi', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'data', pi.paid_at,
          'tipo', pi.kind,
          'metodo', pi.method,
          'importo_centesimi', pi.amount_cents,
          'riferimento', pi.reference
        ) order by pi.paid_at desc
      )
      from public.payments_in pi
      where pi.customer_id = c.id and pi.deleted_at is null
    ), '[]'::jsonb),
    'fatture', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'numero', i.code,
          'tipo', i.kind,
          'data', i.issue_date,
          'totale_centesimi', i.total_cents,
          'stato', i.status
        ) order by i.issue_date desc
      )
      from public.invoices i
      where i.customer_id = c.id and i.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.customers c
  where c.id = p_customer_id and c.deleted_at is null;
$$;

comment on function public.export_customer_data is
  'Esportazione completa dei dati di un cliente, per l''esercizio del diritto di accesso.';

-- --- GDPR: anonimizzazione ----------------------------------------------------
-- Cancella i dati personali e di contatto ma conserva cio' che la legge impone
-- di tenere: importi, date, riferimenti dei documenti fiscali.
create or replace function public.anonymize_customer(p_customer_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_agency_id uuid;
  v_label text;
begin
  select agency_id, display_name into v_agency_id, v_label
  from public.customers where id = p_customer_id;

  if v_agency_id is null then
    raise exception 'Cliente inesistente o non accessibile';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.customer_id = p_customer_id
      and i.deleted_at is null
      and i.issue_date > current_date - interval '10 years'
      and i.status <> 'annullata'
  ) then
    -- Le fatture vanno conservate dieci anni: si anonimizza il contatto,
    -- non l'intestazione fiscale dei documenti gia' emessi.
    update public.customers
    set first_name = case when kind = 'privato' then 'Anonimizzato' else first_name end,
        last_name = case when kind = 'privato' then 'Anonimizzato' else last_name end,
        email = null, phone = null, mobile = null,
        birth_place = null, notes = null, tags = '{}',
        marketing_consent = false, marketing_consent_at = null,
        profiling_consent = false,
        anonymized_at = now()
    where id = p_customer_id;
  else
    update public.customers
    set first_name = case when kind = 'privato' then 'Anonimizzato' else null end,
        last_name = case when kind = 'privato' then 'Anonimizzato' else null end,
        company_name = case when kind = 'azienda' then 'Anonimizzato' else null end,
        vat_number = null, tax_code = null, sdi_code = null, pec = null,
        email = null, phone = null, mobile = null,
        address_line = null, postal_code = null, city = null, province = null,
        birth_date = null, birth_place = null, notes = null, tags = '{}',
        marketing_consent = false, marketing_consent_at = null,
        profiling_consent = false,
        anonymized_at = now()
    where id = p_customer_id;
  end if;

  update public.passengers
  set first_name = 'Anonimizzato', last_name = 'Anonimizzato',
      email = null, phone = null, tax_code = null,
      document_number = null, document_issuer = null, birth_place = null,
      dietary_needs = null, special_needs = null, notes = null
  where customer_id = p_customer_id;

  perform public.log_activity(
    v_agency_id, 'modifica', 'customers', p_customer_id, v_label,
    'Anonimizzazione su richiesta dell''interessato (GDPR art. 17)', null, null
  );
end;
$$;

grant execute on function public.export_customer_data(uuid) to authenticated;
grant execute on function public.anonymize_customer(uuid) to authenticated;

-- --- Viste di elenco ----------------------------------------------------------
-- Una sola vista per modulo: così la griglia può ordinare e filtrare su
-- qualunque colonna mostrata, comprese quelle calcolate, con una sola
-- interrogazione e senza N+1.

create or replace view public.customer_list
with (security_invoker = on) as
select
  c.id,
  c.agency_id,
  c.kind,
  c.display_name,
  c.first_name,
  c.last_name,
  c.company_name,
  c.email,
  c.phone,
  c.mobile,
  c.city,
  c.province,
  c.vat_number,
  c.tax_code,
  c.tags,
  c.marketing_consent,
  c.privacy_consent_at,
  c.anonymized_at,
  c.created_at,
  c.created_by,
  c.search_text,
  s.bookings_count,
  s.active_count,
  s.lifetime_value_cents,
  s.lifetime_margin_cents,
  s.open_balance_cents,
  s.last_departure,
  s.next_departure,
  s.passengers_count
from public.customers c
join public.customer_stats s on s.customer_id = c.id
where c.deleted_at is null;

create or replace view public.passenger_list
with (security_invoker = on) as
select
  p.id,
  p.agency_id,
  p.customer_id,
  c.display_name as customer_name,
  p.first_name,
  p.last_name,
  p.full_name,
  p.birth_date,
  p.nationality,
  p.email,
  p.phone,
  p.document_type,
  p.document_number,
  p.document_expires_at,
  p.dietary_needs,
  p.special_needs,
  p.created_at,
  p.search_text,
  d.document_state,
  d.days_to_expiry,
  d.next_return_date,
  coalesce(bp.bookings_count, 0)::integer as bookings_count
from public.passengers p
left join public.customers c on c.id = p.customer_id and c.deleted_at is null
join public.passenger_documents d on d.passenger_id = p.id
left join lateral (
  select count(*) as bookings_count
  from public.booking_passengers bp2
  join public.bookings b on b.id = bp2.booking_id and b.deleted_at is null
  where bp2.passenger_id = p.id and bp2.deleted_at is null
) bp on true
where p.deleted_at is null;

create or replace view public.supplier_list
with (security_invoker = on) as
select
  s.id,
  s.agency_id,
  s.kind,
  s.name,
  s.legal_name,
  s.email,
  s.phone,
  s.contact_name,
  s.city,
  s.province,
  s.vat_number,
  s.iban,
  s.payment_terms_days,
  s.default_commission_bps,
  s.default_vat_regime,
  s.is_active,
  s.created_at,
  s.search_text,
  st.services_count,
  st.bookings_count,
  st.cost_cents,
  st.revenue_cents,
  st.margin_cents,
  st.margin_bps,
  st.open_payable_cents,
  st.overdue_payable_cents,
  st.next_due_date,
  st.last_service_date
from public.suppliers s
join public.supplier_stats st on st.supplier_id = s.id
where s.deleted_at is null;
