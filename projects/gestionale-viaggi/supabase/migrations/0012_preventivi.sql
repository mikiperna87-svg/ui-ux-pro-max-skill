-- =============================================================================
-- 0012 — Preventivi: ricerca, varianti a confronto, pagina pubblica,
--        accettazione e conversione in pratica.
--
-- Le tabelle (quotes, quote_items) esistono dalla 0003 con la loro RLS e la
-- numerazione. Qui si aggiungono la ricerca, gli oggetti derivati che
-- l'interfaccia interroga e le operazioni che devono essere transazionali.
--
-- La differenza con le pratiche è il destinatario: un preventivo si mostra a
-- qualcuno che non ha un account. Le tre funzioni della pagina pubblica sono
-- quindi `security definer` e accettano solo il token, mai un identificativo.
-- =============================================================================

-- --- Ricerca sui preventivi ---------------------------------------------------
-- La vista dipende dalla colonna generata: va tolta prima, altrimenti una
-- riesecuzione della migrazione si ferma qui.
drop view if exists public.quote_list;

alter table public.quotes
  drop column if exists search_text;
alter table public.quotes
  add column search_text text generated always as (
    app.normalize(
      coalesce(code, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(destination, '') || ' ' ||
      coalesce(notes, '')
    )
  ) stored;

create index if not exists quotes_search_idx
  on public.quotes using gin (search_text public.gin_trgm_ops);

-- --- Viste salvate anche sull'elenco preventivi -------------------------------
-- Il vincolo della 0010 elencava le sole entita' allora esistenti.
alter table public.saved_views
  drop constraint if exists saved_views_entity_check;
alter table public.saved_views
  add constraint saved_views_entity_check
  check (entity in ('pratiche', 'preventivi', 'clienti', 'passeggeri', 'fornitori'));

-- --- Quadro economico di una variante -----------------------------------------
-- Stessa aritmetica delle righe di servizio: margine = vendita - costo +
-- commissione, IVA scorporata secondo il regime della riga (art. 74-ter
-- compreso, dove si calcola sul margine).
create or replace view public.quote_variant_totals
with (security_invoker = on) as
select
  i.quote_id,
  i.agency_id,
  i.variant,
  count(*)::integer as items_count,
  coalesce(sum(i.total_price_cents), 0)::bigint as revenue_cents,
  coalesce(sum(i.total_cost_cents), 0)::bigint as cost_cents,
  coalesce(sum(i.commission_cents), 0)::bigint as commission_cents,
  coalesce(
    sum(app.line_vat_cents(i.total_price_cents, i.total_cost_cents, i.vat_bps, i.vat_regime)),
    0
  )::bigint as vat_cents,
  (
    coalesce(sum(i.total_price_cents), 0)
    - coalesce(sum(i.total_cost_cents), 0)
    + coalesce(sum(i.commission_cents), 0)
  )::bigint as margin_cents
from public.quote_items i
where i.deleted_at is null
group by i.quote_id, i.agency_id, i.variant;

comment on view public.quote_variant_totals is
  'Venduto, costo, commissioni, IVA e margine di ogni variante di un preventivo.';

-- --- Righe di una variante ----------------------------------------------------
create or replace view public.quote_item_list
with (security_invoker = on) as
select
  i.id,
  i.agency_id,
  i.quote_id,
  i.variant,
  i.service_type,
  i.supplier_id,
  s.name as supplier_name,
  i.description,
  i.details,
  i.date_from,
  i.date_to,
  i.quantity,
  i.unit_cost_cents,
  i.unit_price_cents,
  i.commission_bps,
  i.commission_override_cents,
  i.vat_bps,
  i.vat_regime,
  i.sort_order,
  i.total_cost_cents,
  i.total_price_cents,
  i.commission_cents,
  (i.total_price_cents - i.total_cost_cents + i.commission_cents)::bigint as margin_cents,
  app.line_taxable_cents(i.total_price_cents, i.total_cost_cents, i.vat_bps, i.vat_regime) as taxable_cents,
  app.line_vat_cents(i.total_price_cents, i.total_cost_cents, i.vat_bps, i.vat_regime) as vat_cents
from public.quote_items i
left join public.suppliers s on s.id = i.supplier_id
where i.deleted_at is null;

comment on view public.quote_item_list is
  'Righe di preventivo con fornitore, margine e IVA di riga gia calcolati.';

-- --- Elenco dei preventivi ----------------------------------------------------
create or replace view public.quote_list
with (security_invoker = on) as
select
  q.id,
  q.agency_id,
  q.code,
  q.year,
  q.number,
  q.title,
  q.destination,
  q.departure_date,
  q.return_date,
  q.pax_count,
  q.status,
  q.sale_type,
  q.customer_id,
  c.display_name as customer_name,
  c.email as customer_email,
  q.owner_id,
  m.full_name as owner_name,
  q.valid_until,
  q.sent_at,
  q.accepted_variant,
  q.accepted_at,
  q.accepted_by_name,
  q.rejected_at,
  q.rejection_reason,
  q.converted_booking_id,
  b.code as booking_code,
  q.public_token,
  q.created_at,
  q.created_by,
  q.search_text,
  c.search_text as customer_search,
  -- La scadenza non cambia lo stato sul database: un preventivo scaduto resta
  -- "inviato" finché qualcuno non lo rinnova. Qui si dice soltanto che il
  -- termine è passato, ed è ciò che l'elenco filtra e la pagina pubblica nega.
  -- Una bozza non è ancora un'offerta: la validità conta da quando si invia.
  (q.valid_until is not null and q.valid_until < current_date and q.status = 'inviato') as is_expired,
  coalesce(t.variants_count, 0)::integer as variants_count,
  coalesce(t.items_count, 0)::integer as items_count,
  -- Il valore mostrato in elenco è quello della variante accettata; finché non
  -- c'è, quello della variante consigliata o, in mancanza, della base.
  coalesce(scelta.revenue_cents, 0)::bigint as revenue_cents,
  coalesce(scelta.margin_cents, 0)::bigint as margin_cents,
  scelta.variant as shown_variant
from public.quotes q
left join public.customers c on c.id = q.customer_id
left join public.memberships m on m.id = q.owner_id
left join public.bookings b on b.id = q.converted_booking_id
left join lateral (
  select
    count(*)::integer as variants_count,
    coalesce(sum(v.items_count), 0)::integer as items_count
  from public.quote_variant_totals v
  where v.quote_id = q.id
) t on true
left join lateral (
  select v.variant, v.revenue_cents, v.margin_cents
  from public.quote_variant_totals v
  where v.quote_id = q.id
  order by
    (v.variant = q.accepted_variant) desc,
    (v.variant = 'consigliata') desc,
    (v.variant = 'base') desc
  limit 1
) scelta on true
where q.deleted_at is null;

comment on view public.quote_list is
  'Elenco dei preventivi con cliente, operatore, scadenza e importo della variante che conta.';

-- --- Pagina pubblica ----------------------------------------------------------
-- Chi apre il collegamento non ha una sessione: queste funzioni girano con i
-- privilegi del proprietario e accettano soltanto il token, che è un uuid
-- casuale e non compare in nessun elenco.
create or replace function public.quote_public(p_token uuid)
returns table (
  id uuid,
  code text,
  title text,
  destination text,
  departure_date date,
  return_date date,
  pax_count integer,
  status app.quote_status,
  valid_until date,
  intro_text text,
  terms_text text,
  accepted_variant app.quote_variant,
  accepted_at timestamptz,
  accepted_by_name text,
  rejected_at timestamptz,
  rejection_reason text,
  is_expired boolean,
  customer_name text,
  agency_name text,
  agency_email text,
  agency_phone text,
  agency_vat text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    q.id,
    q.code,
    q.title,
    q.destination,
    q.departure_date,
    q.return_date,
    q.pax_count,
    q.status,
    q.valid_until,
    q.intro_text,
    q.terms_text,
    q.accepted_variant,
    q.accepted_at,
    q.accepted_by_name,
    q.rejected_at,
    q.rejection_reason,
    (q.valid_until is not null and q.valid_until < current_date
      and q.status = 'inviato') as is_expired,
    c.display_name as customer_name,
    a.name as agency_name,
    a.email as agency_email,
    a.phone as agency_phone,
    a.vat_number as agency_vat
  from public.quotes q
  join public.agencies a on a.id = q.agency_id
  left join public.customers c on c.id = q.customer_id
  where q.public_token = p_token
    and q.deleted_at is null
    -- Una bozza non è ancora un'offerta: il collegamento esiste ma non apre
    -- nulla finché il preventivo non viene inviato.
    and q.status <> 'bozza';
$$;

comment on function public.quote_public is
  'Preventivo visibile a chi ha il collegamento: solo se inviato, mai una bozza.';

create or replace function public.quote_public_items(p_token uuid)
returns table (
  variant app.quote_variant,
  service_type app.service_type,
  description text,
  details text,
  date_from date,
  date_to date,
  quantity integer,
  total_price_cents bigint,
  sort_order integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    i.variant,
    i.service_type,
    i.description,
    i.details,
    i.date_from,
    i.date_to,
    i.quantity,
    i.total_price_cents,
    i.sort_order
  from public.quote_items i
  join public.quotes q on q.id = i.quote_id
  where q.public_token = p_token
    and q.deleted_at is null
    and q.status <> 'bozza'
    and i.deleted_at is null
  order by i.variant, i.sort_order, i.created_at;
$$;

comment on function public.quote_public_items is
  'Righe del preventivo per la pagina pubblica: solo cio che il cliente deve vedere, mai i costi.';

-- --- Accettazione e rifiuto ---------------------------------------------------
create or replace function public.accept_quote(
  p_token uuid,
  p_variant app.quote_variant,
  p_name text,
  p_ip inet default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote
  from public.quotes
  where public_token = p_token and deleted_at is null;

  if not found or v_quote.status = 'bozza' then
    raise exception 'Preventivo non disponibile' using errcode = 'no_data_found';
  end if;

  if v_quote.status in ('accettato', 'convertito') then
    -- Riaprire il collegamento dopo aver accettato non deve cambiare la scelta
    -- né riscrivere la data: si restituisce quello che c'è già.
    return v_quote;
  end if;

  if v_quote.status = 'rifiutato' then
    raise exception 'Questo preventivo è già stato rifiutato';
  end if;

  if v_quote.valid_until is not null and v_quote.valid_until < current_date then
    raise exception 'Questo preventivo è scaduto il %', to_char(v_quote.valid_until, 'DD/MM/YYYY');
  end if;

  if not exists (
    select 1 from public.quote_items
    where quote_id = v_quote.id and variant = p_variant and deleted_at is null
  ) then
    raise exception 'La proposta scelta non esiste in questo preventivo';
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Serve il nome di chi accetta';
  end if;

  update public.quotes
  set status = 'accettato',
      accepted_variant = p_variant,
      accepted_at = now(),
      accepted_by_name = btrim(p_name),
      accepted_ip = p_ip
  where id = v_quote.id
  returning * into v_quote;

  insert into public.activity_log (
    agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, ip_address
  )
  values (
    v_quote.agency_id, null, btrim(p_name), 'cambio_stato', 'quotes', v_quote.id, v_quote.code,
    'Preventivo ' || v_quote.code || ' accettato dal cliente (proposta ' || p_variant::text || ')',
    p_ip
  );

  return v_quote;
end;
$$;

comment on function public.accept_quote is
  'Accettazione dalla pagina pubblica: registra proposta, nome, data e indirizzo. Ripetibile senza effetti.';

create or replace function public.reject_quote(
  p_token uuid,
  p_reason text,
  p_ip inet default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote
  from public.quotes
  where public_token = p_token and deleted_at is null;

  if not found or v_quote.status = 'bozza' then
    raise exception 'Preventivo non disponibile' using errcode = 'no_data_found';
  end if;

  if v_quote.status in ('accettato', 'convertito') then
    raise exception 'Questo preventivo è già stato accettato';
  end if;

  if v_quote.status = 'rifiutato' then
    return v_quote;
  end if;

  update public.quotes
  set status = 'rifiutato',
      rejected_at = now(),
      rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_quote.id
  returning * into v_quote;

  insert into public.activity_log (
    agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, ip_address
  )
  values (
    v_quote.agency_id, null, 'Cliente', 'cambio_stato', 'quotes', v_quote.id, v_quote.code,
    'Preventivo ' || v_quote.code || ' rifiutato dal cliente' ||
      coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), ''),
    p_ip
  );

  return v_quote;
end;
$$;

comment on function public.reject_quote is
  'Rifiuto dalla pagina pubblica, con motivo facoltativo.';

-- --- Conversione in pratica ---------------------------------------------------
create or replace function public.convert_quote_to_booking(
  p_quote_id uuid,
  p_variant app.quote_variant default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_variant app.quote_variant;
  v_booking public.bookings;
  v_riga record;
  v_ordine integer := 0;
begin
  select * into v_quote
  from public.quotes
  where id = p_quote_id and deleted_at is null;

  if not found then
    raise exception 'Preventivo non trovato' using errcode = 'no_data_found';
  end if;

  if v_quote.converted_booking_id is not null then
    -- Convertire due volte creerebbe due pratiche per lo stesso viaggio, ognuna
    -- con la sua numerazione: si restituisce quella che esiste già.
    select * into v_booking from public.bookings where id = v_quote.converted_booking_id;
    return v_booking;
  end if;

  if v_quote.customer_id is null then
    raise exception 'Prima di convertire, indica il cliente intestatario';
  end if;

  v_variant := coalesce(p_variant, v_quote.accepted_variant, 'base');

  if not exists (
    select 1 from public.quote_items
    where quote_id = p_quote_id and variant = v_variant and deleted_at is null
  ) then
    raise exception 'La proposta da convertire non ha righe';
  end if;

  insert into public.bookings (
    agency_id, customer_id, owner_id, title, destination, departure_date, return_date,
    pax_count, sale_type, quote_id, notes, created_by
  )
  values (
    v_quote.agency_id, v_quote.customer_id, v_quote.owner_id, v_quote.title, v_quote.destination,
    v_quote.departure_date, v_quote.return_date, v_quote.pax_count, v_quote.sale_type,
    v_quote.id, v_quote.notes, auth.uid()
  )
  returning * into v_booking;

  for v_riga in
    select * from public.quote_items
    where quote_id = p_quote_id and variant = v_variant and deleted_at is null
    order by sort_order, created_at
  loop
    insert into public.booking_services (
      agency_id, booking_id, service_type, supplier_id, description, details,
      date_from, date_to, quantity, unit_cost_cents, unit_price_cents,
      commission_bps, commission_override_cents, vat_bps, vat_regime, sort_order, created_by
    )
    values (
      v_quote.agency_id, v_booking.id, v_riga.service_type, v_riga.supplier_id,
      v_riga.description, v_riga.details, v_riga.date_from, v_riga.date_to,
      v_riga.quantity, v_riga.unit_cost_cents, v_riga.unit_price_cents,
      v_riga.commission_bps, v_riga.commission_override_cents, v_riga.vat_bps,
      v_riga.vat_regime, v_ordine, auth.uid()
    );
    v_ordine := v_ordine + 1;
  end loop;

  update public.quotes
  set status = 'convertito',
      converted_booking_id = v_booking.id,
      accepted_variant = coalesce(accepted_variant, v_variant)
  where id = p_quote_id;

  perform public.log_activity(
    v_quote.agency_id,
    'cambio_stato',
    'quotes',
    p_quote_id,
    v_quote.code,
    'Preventivo ' || v_quote.code || ' convertito nella pratica ' || v_booking.code
  );

  return v_booking;
end;
$$;

comment on function public.convert_quote_to_booking is
  'Apre la pratica con le righe della variante scelta e collega i due documenti. Chiamata due volte restituisce la pratica gia creata.';

-- --- Permessi -----------------------------------------------------------------
-- Le funzioni della pagina pubblica sono raggiungibili anche senza sessione:
-- e' il loro scopo. Filtrano da sole su token e stato.
grant execute on function public.quote_public(uuid) to anon, authenticated;
grant execute on function public.quote_public_items(uuid) to anon, authenticated;
grant execute on function public.accept_quote(uuid, app.quote_variant, text, inet) to anon, authenticated;
grant execute on function public.reject_quote(uuid, text, inet) to anon, authenticated;
grant execute on function public.convert_quote_to_booking(uuid, app.quote_variant) to authenticated;
