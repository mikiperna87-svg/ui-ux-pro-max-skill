-- =============================================================================
-- 0008 — Funzioni di lettura per la panoramica.
--
-- Gli indicatori si calcolano sul database e non in JavaScript: portare 5.000
-- pratiche nel browser per sommarle sarebbe lento e, con la RLS, inutile.
-- Tutte le funzioni sono SECURITY INVOKER: vedono solo cio' che vede l utente.
-- =============================================================================

create or replace function public.dashboard_kpis(
  p_from date,
  p_to date,
  p_owner_id uuid default null
)
returns table (
  bookings_count      bigint,
  confirmed_count     bigint,
  revenue_cents       bigint,
  cost_cents          bigint,
  margin_cents        bigint,
  margin_bps          integer,
  average_ticket_cents bigint,
  collected_cents     bigint,
  receivable_cents    bigint,
  overdue_cents       bigint,
  supplier_due_cents  bigint
)
language sql
stable
security invoker
as $$
  with scope as (
    select b.id, b.status, f.*
    from public.bookings b
    join public.booking_financials f on f.booking_id = b.id
    where b.deleted_at is null
      and b.departure_date between p_from and p_to
      and (p_owner_id is null or b.owner_id = p_owner_id)
      and b.status <> 'annullata'
  )
  select
    count(*)::bigint,
    count(*) filter (where status in ('confermata', 'partita', 'rientrata'))::bigint,
    coalesce(sum(revenue_cents), 0)::bigint,
    coalesce(sum(cost_cents), 0)::bigint,
    coalesce(sum(margin_cents), 0)::bigint,
    case
      when coalesce(sum(revenue_cents), 0) = 0 then 0
      else round((coalesce(sum(margin_cents), 0)::numeric * 10000) / sum(revenue_cents))::integer
    end,
    case when count(*) = 0 then 0 else round(coalesce(sum(revenue_cents), 0)::numeric / count(*))::bigint end,
    coalesce(sum(paid_cents), 0)::bigint,
    coalesce(sum(balance_cents) filter (where balance_cents > 0), 0)::bigint,
    coalesce(sum(balance_cents) filter (where payment_state = 'in_ritardo' and balance_cents > 0), 0)::bigint,
    coalesce(sum(supplier_due_cents), 0)::bigint
  from scope;
$$;

comment on function public.dashboard_kpis is
  'Indicatori del periodo: le pratiche annullate non entrano nel fatturato.';

-- Andamento mensile venduto / margine, per il grafico della panoramica.
create or replace function public.monthly_trend(
  p_months integer default 12,
  p_owner_id uuid default null
)
returns table (
  month_start   date,
  revenue_cents bigint,
  margin_cents  bigint,
  bookings_count bigint
)
language sql
stable
security invoker
as $$
  with months as (
    select generate_series(
      date_trunc('month', current_date) - make_interval(months => p_months - 1),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as month_start
  )
  select
    m.month_start,
    coalesce(sum(f.revenue_cents), 0)::bigint,
    coalesce(sum(f.margin_cents), 0)::bigint,
    count(b.id)::bigint
  from months m
  left join public.bookings b
    on b.deleted_at is null
   and b.status <> 'annullata'
   and (p_owner_id is null or b.owner_id = p_owner_id)
   and date_trunc('month', b.departure_date)::date = m.month_start
  left join public.booking_financials f on f.booking_id = b.id
  group by m.month_start
  order by m.month_start;
$$;

-- Partenze imminenti con stato di pagamento, per la lista della panoramica.
create or replace function public.upcoming_departures(
  p_days integer default 30,
  p_limit integer default 8,
  p_owner_id uuid default null
)
returns table (
  booking_id     uuid,
  code           text,
  title          text,
  destination    text,
  departure_date date,
  return_date    date,
  pax_count      integer,
  status         app.booking_status,
  customer_name  text,
  owner_name     text,
  revenue_cents  bigint,
  balance_cents  bigint,
  payment_state  app.payment_state
)
language sql
stable
security invoker
as $$
  select
    b.id, b.code, b.title, b.destination, b.departure_date, b.return_date, b.pax_count, b.status,
    c.display_name, m.full_name,
    f.revenue_cents, f.balance_cents, f.payment_state
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  left join public.memberships m on m.id = b.owner_id
  join public.booking_financials f on f.booking_id = b.id
  where b.deleted_at is null
    and b.status in ('opzione', 'confermata')
    and b.departure_date between current_date and current_date + p_days
    and (p_owner_id is null or b.owner_id = p_owner_id)
  order by b.departure_date, b.code
  limit p_limit;
$$;

-- Scadenze fornitore in arrivo o gia' superate.
create or replace function public.upcoming_supplier_payments(
  p_days integer default 14,
  p_limit integer default 8
)
returns table (
  payment_id    uuid,
  supplier_name text,
  booking_code  text,
  amount_cents  bigint,
  due_date      date,
  status        app.payout_status,
  days_left     integer
)
language sql
stable
security invoker
as $$
  select
    p.id, s.name, b.code, p.amount_cents, p.due_date, p.status,
    (p.due_date - current_date)::integer
  from public.payments_out p
  join public.suppliers s on s.id = p.supplier_id
  left join public.bookings b on b.id = p.booking_id
  where p.deleted_at is null
    and p.status in ('da_pagare', 'programmato')
    and p.due_date <= current_date + p_days
  order by p.due_date, s.name
  limit p_limit;
$$;

grant execute on function public.dashboard_kpis(date, date, uuid) to authenticated;
grant execute on function public.monthly_trend(integer, uuid) to authenticated;
grant execute on function public.upcoming_departures(integer, integer, uuid) to authenticated;
grant execute on function public.upcoming_supplier_payments(integer, integer) to authenticated;
