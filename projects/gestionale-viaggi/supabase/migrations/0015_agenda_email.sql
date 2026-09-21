-- =============================================================================
-- 0015 — Agenda, attività e notifiche email.
--
-- Due cose nuove, legate da un'idea sola: il gestionale deve dire che cosa c'è
-- da fare oggi, e deve saper scrivere al cliente senza che qualcuno copi e
-- incolli in un'altra applicazione.
--
--   * l'agenda unisce in un elenco solo le attività, le rate in scadenza, i
--     pagamenti ai fornitori, le partenze imminenti e i documenti dei
--     passeggeri che stanno per scadere: sono le cinque cose che fanno
--     suonare il telefono in agenzia;
--   * la posta ha una coda vera sul database. Ogni messaggio è una riga con
--     destinatario, oggetto, corpo, tentativi ed esito. L'invio scrive la
--     riga, prova a consegnare e registra che cosa è successo: se il
--     fornitore di posta non risponde, il messaggio resta in coda e si
--     rimanda, invece di sparire con un errore a schermo.
-- =============================================================================

do $$ begin
  create type app.email_kind as enum ('preventivo', 'fattura', 'promemoria_incasso', 'prova');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.email_status as enum ('in_coda', 'inviata', 'errore', 'annullata');
exception when duplicate_object then null; end $$;

-- --- La coda della posta ------------------------------------------------------
create table if not exists public.email_messages (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  kind                app.email_kind not null,
  status              app.email_status not null default 'in_coda',
  to_email            text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  to_name             text,
  reply_to            text,
  subject             text not null check (length(btrim(subject)) between 3 and 200),
  -- Due corpi per lo stesso messaggio: l'HTML per chi legge in un client
  -- moderno, il testo per chi ha le immagini spente, per i filtri antispam e
  -- per l'archivio. Scriverne uno solo vuol dire scegliere per il cliente.
  body_text           text not null check (length(btrim(body_text)) > 0),
  body_html           text not null check (length(btrim(body_html)) > 0),
  attachment_name     text,
  quote_id            uuid references public.quotes (id) on delete set null,
  invoice_id          uuid references public.invoices (id) on delete set null,
  booking_id          uuid references public.bookings (id) on delete set null,
  customer_id         uuid references public.customers (id) on delete set null,
  provider            text,
  provider_message_id text,
  error_message       text,
  attempts            integer not null default 0 check (attempts >= 0 and attempts <= 100),
  last_attempt_at     timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  deleted_at          timestamptz,
  -- Un messaggio "inviato" senza data di invio sarebbe una consegna raccontata
  -- e mai avvenuta: il vincolo impedisce di scriverla.
  constraint email_messages_sent_has_date check (status <> 'inviata' or sent_at is not null),
  constraint email_messages_error_has_reason check (status <> 'errore' or error_message is not null)
);

comment on table public.email_messages is
  'Coda della posta in uscita: un messaggio per riga, con il suo esito. Nulla si invia senza lasciare traccia qui.';
comment on column public.email_messages.attempts is
  'Tentativi di consegna già fatti. Un messaggio in coda con tentativi > 0 ha già incontrato un errore.';

create index if not exists email_messages_agency_idx
  on public.email_messages (agency_id, created_at desc) where deleted_at is null;
create index if not exists email_messages_status_idx
  on public.email_messages (agency_id, status) where deleted_at is null;
create index if not exists email_messages_quote_idx
  on public.email_messages (quote_id) where deleted_at is null and quote_id is not null;
create index if not exists email_messages_invoice_idx
  on public.email_messages (invoice_id) where deleted_at is null and invoice_id is not null;

drop trigger if exists email_messages_touch_updated_at on public.email_messages;
create trigger email_messages_touch_updated_at
  before update on public.email_messages
  for each row execute function app.touch_updated_at();

alter table public.email_messages enable row level security;

-- La posta in uscita è un registro dell'agenzia: la legge chi ne fa parte, la
-- scrive chi può operare. Non c'è cancellazione definitiva, solo annullamento
-- di un messaggio ancora in coda.
drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages for select to authenticated
  using (agency_id in (select app.current_agency_ids()));

drop policy if exists email_messages_insert on public.email_messages;
create policy email_messages_insert on public.email_messages for insert to authenticated
  with check (agency_id in (select app.current_agency_ids()) and app.can_write(agency_id));

drop policy if exists email_messages_update on public.email_messages;
create policy email_messages_update on public.email_messages for update to authenticated
  using (app.can_write(agency_id))
  with check (app.can_write(agency_id) and agency_id in (select app.current_agency_ids()));

-- --- Impostazioni della posta -------------------------------------------------
alter table public.agency_settings
  add column if not exists email_enabled boolean not null default true,
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text,
  add column if not exists email_signature text;

comment on column public.agency_settings.email_from_name is
  'Nome che il cliente legge come mittente. Il dominio del mittente lo decide la configurazione del fornitore di posta.';
comment on column public.agency_settings.email_enabled is
  'Interruttore dell''agenzia: a falso i messaggi non partono e restano in coda, segnati come annullati.';

-- --- Attività ------------------------------------------------------------------
-- Una vista, non una query ripetuta in cinque punti: l'elenco, l'agenda, la
-- pratica e il cruscotto devono dire la stessa cosa sulla stessa attività.
drop view if exists public.task_list;
create view public.task_list
with (security_invoker = on) as
select
  t.id,
  t.agency_id,
  t.title,
  t.description,
  t.kind,
  t.status,
  t.priority,
  t.due_at,
  t.assignee_id,
  m.full_name as assignee_name,
  t.booking_id,
  b.code as booking_code,
  b.title as booking_title,
  b.destination,
  b.departure_date,
  b.owner_id as booking_owner_id,
  t.customer_id,
  c.display_name as customer_name,
  t.quote_id,
  q.code as quote_code,
  t.completed_at,
  t.completed_by,
  cb.full_name as completed_by_name,
  t.created_at,
  t.created_by,
  -- Il ritardo si calcola, non si scrive: una riga "in ritardo" salvata sul
  -- database sarebbe vera solo fino a mezzanotte.
  (t.due_at is not null and t.due_at < now() and t.status in ('aperto', 'in_corso')) as is_overdue,
  case
    when t.due_at is null then null
    else (t.due_at at time zone 'Europe/Rome')::date
  end as due_date,
  app.searchable(
    coalesce(t.title, '') || ' ' || coalesce(t.description, '') || ' ' ||
    coalesce(b.code, '') || ' ' || coalesce(c.display_name, '')
  ) as search_text
from public.tasks t
left join public.memberships m on m.id = t.assignee_id
left join public.memberships cb on cb.id = t.completed_by
left join public.bookings b on b.id = t.booking_id
left join public.customers c on c.id = t.customer_id
left join public.quotes q on q.id = t.quote_id
where t.deleted_at is null;

comment on view public.task_list is
  'Attività con assegnatario, pratica e cliente già risolti, e il ritardo calcolato al momento della lettura.';

-- Chiudere e riaprire un'attività sono due operazioni, non due update: chi ha
-- completato e quando fanno parte del dato, e vanno scritti insieme allo stato.
create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
as $$
declare
  v_task public.tasks;
  v_membership uuid;
begin
  select * into v_task from public.tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Attività non trovata' using errcode = 'P0002';
  end if;
  if v_task.status = 'completato' then
    return v_task;
  end if;

  v_membership := app.current_membership_id(v_task.agency_id);

  update public.tasks
  set status = 'completato',
      completed_at = now(),
      completed_by = v_membership
  where id = p_task_id
  returning * into v_task;

  perform public.log_activity(
    v_task.agency_id, 'cambio_stato', 'tasks', v_task.id, v_task.title,
    'Attività completata'
  );

  return v_task;
end;
$$;

create or replace function public.reopen_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
as $$
declare
  v_task public.tasks;
begin
  update public.tasks
  set status = 'aperto',
      completed_at = null,
      completed_by = null
  where id = p_task_id and deleted_at is null
  returning * into v_task;

  if not found then
    raise exception 'Attività non trovata' using errcode = 'P0002';
  end if;

  perform public.log_activity(
    v_task.agency_id, 'cambio_stato', 'tasks', v_task.id, v_task.title,
    'Attività riaperta'
  );

  return v_task;
end;
$$;

-- --- L'agenda ------------------------------------------------------------------
-- Cinque sorgenti, un elenco solo. Le scadenze di denaro restano nello
-- scadenzario, che è il registro: qui compaiono come impegni della giornata,
-- accanto alle attività e alle partenze, perché è così che si organizza la
-- mattina in agenzia.
create or replace function public.agenda(
  p_from date,
  p_to date,
  p_assignee_id uuid default null
)
returns table (
  item_kind     text,
  item_id       uuid,
  due_date      date,
  title         text,
  detail        text,
  amount_cents  bigint,
  booking_id    uuid,
  booking_code  text,
  entity_id     uuid,
  task_status   app.task_status,
  task_priority app.task_priority,
  assignee_id   uuid,
  assignee_name text,
  is_overdue    boolean
)
language sql
stable
security invoker
as $$
  -- Attività
  select
    'attivita'::text,
    t.id,
    t.due_date,
    t.title,
    coalesce(nullif(btrim(t.description), ''), t.booking_code, t.customer_name, ''),
    0::bigint,
    t.booking_id,
    t.booking_code,
    t.id,
    t.status,
    t.priority,
    t.assignee_id,
    t.assignee_name,
    t.is_overdue
  from public.task_list t
  where t.status in ('aperto', 'in_corso')
    and t.due_date between p_from and p_to
    and (p_assignee_id is null or t.assignee_id = p_assignee_id)

  union all

  -- Rate da incassare
  select
    'incasso'::text,
    i.id,
    i.due_date,
    'Incasso da ' || coalesce(i.customer_name, 'cliente'),
    coalesce(i.booking_code, '') || ' · ' || coalesce(i.destination, ''),
    i.residual_cents::bigint,
    i.booking_id,
    i.booking_code,
    i.booking_id,
    null::app.task_status,
    null::app.task_priority,
    i.owner_id,
    null::text,
    coalesce(i.is_late, false)
  from public.installment_list i
  where i.state in ('attesa', 'parziale', 'scaduta')
    and i.due_date between p_from and p_to
    and i.booking_status <> 'annullata'
    and (p_assignee_id is null or i.owner_id = p_assignee_id)

  union all

  -- Pagamenti ai fornitori
  select
    'pagamento'::text,
    p.id,
    p.due_date,
    'Pagamento a ' || coalesce(p.supplier_name, 'fornitore'),
    coalesce(p.booking_code, '') || ' · ' || coalesce(p.service_description, ''),
    p.amount_cents::bigint,
    p.booking_id,
    p.booking_code,
    p.supplier_id,
    null::app.task_status,
    null::app.task_priority,
    p.owner_id,
    null::text,
    coalesce(p.is_late, false)
  from public.payout_list p
  where p.status in ('da_pagare', 'programmato')
    and p.due_date between p_from and p_to
    and (p_assignee_id is null or p.owner_id = p_assignee_id)

  union all

  -- Partenze
  select
    'partenza'::text,
    b.id,
    b.departure_date,
    'Partenza: ' || b.destination,
    coalesce(c.display_name, '') || ' · ' || b.pax_count || ' pax',
    0::bigint,
    b.id,
    b.code,
    b.id,
    null::app.task_status,
    null::app.task_priority,
    b.owner_id,
    null::text,
    false
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.deleted_at is null
    and b.status in ('opzione', 'confermata')
    and b.departure_date between p_from and p_to
    and (p_assignee_id is null or b.owner_id = p_assignee_id)

  union all

  -- Documenti di viaggio in scadenza: non hanno un responsabile, quindi
  -- compaiono solo nell'agenda di tutti.
  select
    'documento'::text,
    pa.id,
    pa.document_expires_at,
    'Documento in scadenza: ' || pa.full_name,
    coalesce(pa.document_number, 'documento senza numero'),
    0::bigint,
    null::uuid,
    null::text,
    pa.id,
    null::app.task_status,
    null::app.task_priority,
    null::uuid,
    null::text,
    pa.document_expires_at < current_date
  from public.passengers pa
  where pa.deleted_at is null
    and pa.document_expires_at is not null
    and pa.document_expires_at between p_from and p_to
    and p_assignee_id is null

  order by 3, 1, 4;
$$;

comment on function public.agenda is
  'Che cosa c''è da fare fra due date: attività, rate, pagamenti, partenze e documenti in scadenza.';

grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid) to authenticated;
grant execute on function public.agenda(date, date, uuid) to authenticated;
