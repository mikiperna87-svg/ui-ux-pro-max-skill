-- =============================================================================
-- 0014 — Report direzionali: per operatore, per destinazione, per fornitore.
--
-- Nessuna tabella nuova: un report è una lettura, e le letture aggregate si
-- fanno dove stanno i dati. Portare diecimila righe di servizio nel browser
-- per sommarle sarebbe lento e, con la RLS attiva, anche inutile.
--
-- Tre scelte valgono per tutte le funzioni di questo file:
--
--   * sono SECURITY INVOKER, quindi vedono esattamente ciò che vede chi
--     chiama: un operatore ottiene un report delle sole pratiche sue senza che
--     l'applicazione debba ricordarsi di filtrare;
--   * l'asse temporale è la data di partenza della pratica, la stessa della
--     panoramica: è il momento in cui il viaggio diventa fatturato, ed è
--     l'unico modo perché due sezioni diverse dicano lo stesso numero;
--   * le pratiche annullate non entrano nel venduto né nel margine. Non
--     spariscono: hanno una colonna propria, perché un operatore con molte
--     pratiche annullate è un'informazione, non un vuoto.
-- =============================================================================

-- --- Per operatore ------------------------------------------------------------
create or replace function public.report_by_owner(p_from date, p_to date)
returns table (
  owner_id             uuid,
  owner_name           text,
  bookings_count       bigint,
  pax_count            bigint,
  revenue_cents        bigint,
  cost_cents           bigint,
  commission_cents     bigint,
  margin_cents         bigint,
  margin_bps           integer,
  average_ticket_cents bigint,
  collected_cents      bigint,
  balance_cents        bigint,
  cancelled_count      bigint
)
language sql
stable
security invoker
as $$
  with scope as (
    select
      b.owner_id,
      b.pax_count,
      b.status,
      f.revenue_cents,
      f.cost_cents,
      f.commission_cents,
      f.margin_cents,
      f.paid_cents,
      f.balance_cents
    from public.bookings b
    join public.booking_financials f on f.booking_id = b.id
    where b.deleted_at is null
      and b.departure_date between p_from and p_to
  ),
  aggregato as (
    select
      s.owner_id,
      count(*) filter (where s.status <> 'annullata')::bigint as bookings_count,
      coalesce(sum(s.pax_count) filter (where s.status <> 'annullata'), 0)::bigint as pax_count,
      coalesce(sum(s.revenue_cents) filter (where s.status <> 'annullata'), 0)::bigint as revenue_cents,
      coalesce(sum(s.cost_cents) filter (where s.status <> 'annullata'), 0)::bigint as cost_cents,
      coalesce(sum(s.commission_cents) filter (where s.status <> 'annullata'), 0)::bigint as commission_cents,
      coalesce(sum(s.margin_cents) filter (where s.status <> 'annullata'), 0)::bigint as margin_cents,
      coalesce(sum(s.paid_cents) filter (where s.status <> 'annullata'), 0)::bigint as collected_cents,
      -- Il residuo è solo quello ancora esigibile: un saldo negativo (incassato
      -- più del venduto, per un rimborso da restituire) non va a ridurre il
      -- credito verso gli altri clienti.
      coalesce(sum(s.balance_cents) filter (where s.status <> 'annullata' and s.balance_cents > 0), 0)::bigint as balance_cents,
      count(*) filter (where s.status = 'annullata')::bigint as cancelled_count
    from scope s
    group by s.owner_id
  )
  select
    a.owner_id,
    m.full_name,
    a.bookings_count,
    a.pax_count,
    a.revenue_cents,
    a.cost_cents,
    a.commission_cents,
    a.margin_cents,
    case
      when a.revenue_cents = 0 then 0
      else round((a.margin_cents::numeric * 10000) / a.revenue_cents)::integer
    end,
    case
      when a.bookings_count = 0 then 0
      else round(a.revenue_cents::numeric / a.bookings_count)::bigint
    end,
    a.collected_cents,
    a.balance_cents,
    a.cancelled_count
  from aggregato a
  left join public.memberships m on m.id = a.owner_id
  order by a.revenue_cents desc, m.full_name;
$$;

comment on function public.report_by_owner is
  'Rendimento per operatore nel periodo di partenza. Le annullate restano contate a parte.';

-- --- Preventivi e conversione, per operatore ----------------------------------
-- I preventivi si contano per data di creazione e non per partenza: un
-- preventivo può non avere ancora una data di viaggio, e comunque il lavoro
-- commerciale si misura quando viene fatto. Il report li tiene separati dalle
-- pratiche proprio perché l'asse temporale è un altro.
create or replace function public.report_quotes_by_owner(p_from date, p_to date)
returns table (
  owner_id          uuid,
  owner_name        text,
  quotes_count      bigint,
  sent_count        bigint,
  accepted_count    bigint,
  converted_count   bigint,
  rejected_count    bigint,
  conversion_bps    integer,
  accepted_cents    bigint
)
language sql
stable
security invoker
as $$
  with scope as (
    select
      q.owner_id,
      q.owner_name,
      q.sent_at,
      q.accepted_at,
      q.rejected_at,
      q.converted_booking_id,
      q.revenue_cents
    from public.quote_list q
    -- created_at è un istante, il periodo è fatto di giorni: la conversione nel
    -- fuso dell'agenzia è obbligatoria, altrimenti un preventivo scritto alle
    -- 00:30 del primo gennaio finirebbe nell'anno prima, che è l'ora UTC dello
    -- stesso istante. Le date si leggono a Roma in tutta l'applicazione, e qui
    -- non fa eccezione.
    where (q.created_at at time zone 'Europe/Rome')::date between p_from and p_to
  )
  select
    s.owner_id,
    s.owner_name,
    count(*)::bigint,
    count(*) filter (where s.sent_at is not null)::bigint,
    count(*) filter (where s.accepted_at is not null)::bigint,
    count(*) filter (where s.converted_booking_id is not null)::bigint,
    count(*) filter (where s.rejected_at is not null)::bigint,
    -- La conversione si misura sugli inviati: un preventivo rimasto in bozza
    -- non è mai stato un'offerta, e includerlo punirebbe chi lavora in ordine.
    case
      when count(*) filter (where s.sent_at is not null) = 0 then 0
      else round(
        (count(*) filter (where s.accepted_at is not null)::numeric * 10000)
        / count(*) filter (where s.sent_at is not null)
      )::integer
    end,
    coalesce(sum(s.revenue_cents) filter (where s.accepted_at is not null), 0)::bigint
  from scope s
  group by s.owner_id, s.owner_name
  order by count(*) filter (where s.accepted_at is not null) desc, s.owner_name;
$$;

comment on function public.report_quotes_by_owner is
  'Preventivi creati nel periodo e loro esito, per operatore. La conversione è sugli inviati.';

-- --- Per destinazione ---------------------------------------------------------
-- La destinazione è testo libero: "Santorini e Mykonos" e "santorini e mykonos"
-- sono lo stesso viaggio e devono stare sulla stessa riga. Si raggruppa sulla
-- forma normalizzata e si mostra la grafia usata più spesso.
create or replace function public.report_by_destination(
  p_from date,
  p_to date,
  p_limit integer default 50
)
returns table (
  destination          text,
  country              text,
  bookings_count       bigint,
  pax_count            bigint,
  customers_count      bigint,
  revenue_cents        bigint,
  cost_cents           bigint,
  margin_cents         bigint,
  margin_bps           integer,
  average_ticket_cents bigint
)
language sql
stable
security invoker
as $$
  select
    mode() within group (order by b.destination),
    min(b.country),
    count(*)::bigint,
    coalesce(sum(b.pax_count), 0)::bigint,
    count(distinct b.customer_id)::bigint,
    coalesce(sum(f.revenue_cents), 0)::bigint,
    coalesce(sum(f.cost_cents), 0)::bigint,
    coalesce(sum(f.margin_cents), 0)::bigint,
    case
      when coalesce(sum(f.revenue_cents), 0) = 0 then 0
      else round((coalesce(sum(f.margin_cents), 0)::numeric * 10000) / sum(f.revenue_cents))::integer
    end,
    round(coalesce(sum(f.revenue_cents), 0)::numeric / count(*))::bigint
  from public.bookings b
  join public.booking_financials f on f.booking_id = b.id
  where b.deleted_at is null
    and b.status <> 'annullata'
    and b.departure_date between p_from and p_to
  group by lower(btrim(b.destination))
  order by sum(f.revenue_cents) desc, mode() within group (order by b.destination)
  limit greatest(p_limit, 1);
$$;

comment on function public.report_by_destination is
  'Venduto e margine per destinazione nel periodo di partenza, grafie diverse riunite.';

-- --- Per fornitore ------------------------------------------------------------
-- Il venduto attribuito al fornitore è quello delle righe di servizio comprate
-- da lui, non l'intera pratica: una pratica con volo e hotel di due fornitori
-- diversi deve contare una volta per ciascuno, ciascuno per la sua parte.
create or replace function public.report_by_supplier(p_from date, p_to date)
returns table (
  supplier_id      uuid,
  supplier_name    text,
  kind             app.supplier_kind,
  services_count   bigint,
  bookings_count   bigint,
  cost_cents       bigint,
  revenue_cents    bigint,
  commission_cents bigint,
  margin_cents     bigint,
  margin_bps       integer,
  due_cents        bigint,
  paid_cents       bigint
)
language sql
stable
security invoker
as $$
  with righe as (
    select
      s.supplier_id,
      count(*)::bigint as services_count,
      count(distinct s.booking_id)::bigint as bookings_count,
      coalesce(sum(s.total_cost_cents), 0)::bigint as cost_cents,
      coalesce(sum(s.total_price_cents), 0)::bigint as revenue_cents,
      coalesce(sum(s.commission_cents), 0)::bigint as commission_cents
    from public.booking_services s
    join public.bookings b on b.id = s.booking_id
    where s.deleted_at is null
      and s.supplier_id is not null
      and b.deleted_at is null
      and b.status <> 'annullata'
      and b.departure_date between p_from and p_to
    group by s.supplier_id
  ),
  -- I pagamenti al fornitore seguono la stessa pratica, quindi lo stesso
  -- periodo. Un pagamento non legato ad alcuna pratica non appartiene a nessun
  -- periodo di partenza e resta fuori: lo si vede nello scadenzario.
  pagamenti as (
    select
      p.supplier_id,
      coalesce(sum(p.amount_cents) filter (where p.status in ('da_pagare', 'programmato')), 0)::bigint as due_cents,
      coalesce(sum(p.amount_cents) filter (where p.status = 'pagato'), 0)::bigint as paid_cents
    from public.payments_out p
    join public.bookings b on b.id = p.booking_id
    where p.deleted_at is null
      and b.deleted_at is null
      and b.status <> 'annullata'
      and b.departure_date between p_from and p_to
    group by p.supplier_id
  )
  select
    su.id,
    su.name,
    su.kind,
    r.services_count,
    r.bookings_count,
    r.cost_cents,
    r.revenue_cents,
    r.commission_cents,
    (r.revenue_cents - r.cost_cents + r.commission_cents)::bigint,
    case
      when r.revenue_cents = 0 then 0
      else round(
        ((r.revenue_cents - r.cost_cents + r.commission_cents)::numeric * 10000) / r.revenue_cents
      )::integer
    end,
    coalesce(pa.due_cents, 0)::bigint,
    coalesce(pa.paid_cents, 0)::bigint
  from righe r
  join public.suppliers su on su.id = r.supplier_id
  left join pagamenti pa on pa.supplier_id = r.supplier_id
  order by r.cost_cents desc, su.name;
$$;

comment on function public.report_by_supplier is
  'Acquistato, margine generato e pagamenti per fornitore, sulle righe di servizio del periodo.';

-- --- Andamento mensile di un periodo qualsiasi --------------------------------
-- monthly_trend (0008) guarda sempre agli ultimi N mesi fino a oggi. Qui il
-- periodo lo sceglie chi legge, e i mesi senza partenze devono comunque
-- comparire: un buco nel grafico è un'informazione, una barra mancante no.
create or replace function public.report_monthly(p_from date, p_to date)
returns table (
  month_start    date,
  revenue_cents  bigint,
  margin_cents   bigint,
  bookings_count bigint
)
language sql
stable
security invoker
as $$
  with mesi as (
    select generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    )::date as month_start
  )
  select
    m.month_start,
    coalesce(sum(f.revenue_cents), 0)::bigint,
    coalesce(sum(f.margin_cents), 0)::bigint,
    count(b.id)::bigint
  from mesi m
  left join public.bookings b
    on b.deleted_at is null
   and b.status <> 'annullata'
   and b.departure_date between p_from and p_to
   and date_trunc('month', b.departure_date)::date = m.month_start
  left join public.booking_financials f on f.booking_id = b.id
  group by m.month_start
  order by m.month_start;
$$;

comment on function public.report_monthly is
  'Venduto e margine mese per mese dentro un periodo scelto, mesi vuoti compresi.';

grant execute on function public.report_by_owner(date, date) to authenticated;
grant execute on function public.report_quotes_by_owner(date, date) to authenticated;
grant execute on function public.report_by_destination(date, date, integer) to authenticated;
grant execute on function public.report_by_supplier(date, date) to authenticated;
grant execute on function public.report_monthly(date, date) to authenticated;
