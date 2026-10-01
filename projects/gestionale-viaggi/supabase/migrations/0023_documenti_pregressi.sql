-- ============================================================================
-- 0023 — Documenti pregressi: le fatture che arrivano dal gestionale di prima
--
-- Un'agenzia che cambia gestionale a metà anno porta con sé le fatture già
-- emesse. Non per rifarle: per avere l'estratto conto del cliente completo, il
-- registro IVA dell'anno intero e lo scadenzario di quello che deve ancora
-- incassare. Oggi non c'è modo di farlo senza inventare dati, perché una
-- fattura in questo gestionale nasce da una bozza e prende il numero dal
-- contatore.
--
-- Tre cose servono, e sono tutte qui.
--
-- 1. Il numero di origine si conserva. Una fattura è il suo numero: se
--    cambia, l'estratto conto non torna con quello del commercialista e la
--    nota di credito di gennaio non trova la fattura di novembre. Il contatore
--    viene quindi portato avanti fino al numero più alto importato, altrimenti
--    la prima fattura nuova riuserebbe un numero già speso.
--
-- 2. Un documento importato non si trasmette allo SdI. Era già stato
--    trasmesso dal gestionale di prima: rimandarlo significa depositare una
--    seconda fattura con lo stesso numero all'Agenzia delle Entrate. Il
--    divieto sta sul database e non nell'interfaccia, perché un errore qui
--    costa una comunicazione di variazione e non un messaggio di errore.
--
-- 3. Resta scritto che è importato. `imported_at` non serve all'aritmetica:
--    serve a chi guarda il registro IVA e deve sapere quali righe arrivano da
--    un sistema in cui erano già state dichiarate.
--
-- Quello che questa migrazione non fa: non tocca la liquidazione IVA e non
-- esclude i documenti importati dal registro. Un'agenzia che importa l'anno in
-- corso vuole il registro completo; quella che ha già dichiarato quei mesi
-- importa solo i documenti aperti. È una decisione di chi tiene la
-- contabilità, non una regola da nascondere in una vista.
-- ============================================================================

-- --- Provenienza --------------------------------------------------------------

alter table public.invoices
  add column if not exists imported_at timestamptz;

comment on column public.invoices.imported_at is
  'Quando il documento e'' stato importato da un gestionale precedente. Nullo se nato qui.';

-- Il registro e l'elenco filtrano su questa colonna solo per contare: un
-- indice parziale basta e costa niente sulle righe normali.
create index if not exists invoices_imported_idx
  on public.invoices (agency_id, imported_at)
  where imported_at is not null;

-- --- Un documento importato non si trasmette ----------------------------------

create or replace function app.invoices_guard_imported()
returns trigger
language plpgsql
as $$
begin
  -- La provenienza si decide alla nascita e non si cambia piu': ne' si cancella
  -- da un documento importato, ne' si appiccica a uno nato qui — sarebbe il modo
  -- piu' semplice di sottrarre una fattura vera alla trasmissione.
  if tg_op = 'UPDATE' then
    if new.imported_at is distinct from old.imported_at then
      raise exception 'La provenienza del documento % non si modifica', old.code;
    end if;
  end if;

  if new.imported_at is null then
    return new;
  end if;

  -- Il documento era già stato trasmesso dal gestionale di prima. Trasmetterlo
  -- di nuovo deposita una seconda fattura con lo stesso numero.
  if new.sdi_status <> 'non_inviata' then
    raise exception
      'Il documento % è stato importato da un gestionale precedente: era già stato trasmesso allo SdI e non si ritrasmette',
      coalesce(new.code, '');
  end if;

  if new.sdi_progressivo is not null or new.sdi_sent_at is not null then
    raise exception
      'Il documento % è importato: non può avere un progressivo di invio',
      coalesce(new.code, '');
  end if;

  return new;
end;
$$;

comment on function app.invoices_guard_imported is
  'Vieta la trasmissione allo SdI dei documenti importati: erano gia'' stati trasmessi altrove.';

drop trigger if exists invoices_guard_imported on public.invoices;
create trigger invoices_guard_imported before insert or update on public.invoices
  for each row execute function app.invoices_guard_imported();

-- --- Il contatore non deve riusare un numero importato ------------------------

create or replace function app.catch_up_document_counter(
  p_agency_id uuid,
  p_kind app.counter_kind,
  p_year integer,
  p_number integer
)
returns void
language plpgsql
as $$
begin
  insert into public.document_counters as dc (agency_id, kind, year, last_number)
  values (p_agency_id, p_kind, p_year, greatest(p_number, 0))
  on conflict (agency_id, kind, year)
  do update set last_number = greatest(dc.last_number, greatest(p_number, 0)),
                updated_at = now();
end;
$$;

comment on function app.catch_up_document_counter is
  'Porta il contatore almeno fino al numero indicato: il prossimo documento non riusa un numero importato.';

-- --- Importazione di un documento pregresso -----------------------------------

create or replace function public.import_legacy_invoice(
  p_customer_id uuid,
  p_kind app.invoice_kind,
  p_year integer,
  p_number integer,
  p_code text,
  p_issue_date date,
  p_due_date date,
  p_status app.invoice_status,
  p_vat_regime app.vat_regime,
  p_notes text,
  p_items jsonb
)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agency_id uuid;
  v_invoice public.invoices;
  v_counter app.counter_kind;
  v_voce jsonb;
  v_righe integer := 0;
  v_prefix text;
  v_code text;
begin
  -- L'agenzia viene dal cliente, e il cliente lo vede solo chi ne ha diritto:
  -- la RLS fa da sola il controllo che altrimenti andrebbe scritto qui.
  select c.agency_id into v_agency_id
  from public.customers c
  where c.id = p_customer_id and c.deleted_at is null;

  if v_agency_id is null then
    raise exception 'Cliente non trovato' using errcode = 'no_data_found';
  end if;

  if p_status = 'bozza' then
    raise exception 'Un documento importato non è una bozza: indica lo stato che aveva';
  end if;

  if coalesce(p_number, 0) <= 0 then
    raise exception 'Il numero del documento è obbligatorio';
  end if;

  if p_issue_date is null then
    raise exception 'La data di emissione è obbligatoria';
  end if;

  if p_issue_date > current_date then
    raise exception 'La data di emissione non può essere nel futuro';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Il documento deve avere almeno una riga';
  end if;

  v_counter := case when p_kind = 'nota_credito' then 'nota_credito'::app.counter_kind
                    else 'fattura'::app.counter_kind end;

  if exists (
    select 1 from public.invoices i
    where i.agency_id = v_agency_id
      and i.kind = p_kind
      and i.year = p_year
      and i.number = p_number
      and i.deleted_at is null
  ) then
    raise exception 'Il documento % del % esiste già', p_number, p_year
      using errcode = 'unique_violation';
  end if;

  -- Nasce bozza perché le righe di un documento emesso non si possono
  -- inserire: è il controllo che tiene immutabile tutto il resto, e non si
  -- allenta per l'importazione.
  insert into public.invoices (
    agency_id, kind, customer_id, issue_date, due_date, status, vat_regime, notes, imported_at
  ) values (
    v_agency_id, p_kind, p_customer_id, p_issue_date, p_due_date, 'bozza', p_vat_regime,
    p_notes, now()
  )
  returning * into v_invoice;

  for v_voce in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (
      agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
      vat_bps, vat_regime, sort_order
    ) values (
      v_agency_id,
      v_invoice.id,
      coalesce(nullif(btrim(v_voce ->> 'description'), ''), 'Servizio'),
      coalesce((v_voce ->> 'quantity')::integer, 1),
      coalesce((v_voce ->> 'unit_price_cents')::bigint, 0),
      coalesce((v_voce ->> 'cost_cents')::bigint, 0),
      coalesce((v_voce ->> 'vat_bps')::integer, 2200),
      coalesce((v_voce ->> 'vat_regime')::app.vat_regime, p_vat_regime),
      v_righe
    );
    v_righe := v_righe + 1;
  end loop;

  -- Il codice di origine si conserva com'è scritto nel file. Quando il file non
  -- lo porta si compone con il prefisso dell'agenzia, la stessa regola della
  -- numerazione normale.
  v_code := nullif(btrim(coalesce(p_code, '')), '');
  if v_code is null then
    select case when p_kind = 'nota_credito'
                then coalesce(s.credit_note_number_prefix, 'NC')
                else coalesce(s.invoice_number_prefix, '') end
      into v_prefix
    from public.agency_settings s
    where s.agency_id = v_agency_id;
    v_code := app.format_document_code(coalesce(v_prefix, ''), p_year, p_number);
  end if;

  -- Lo stato finale porta con sé numero, anno e codice di origine: il trigger
  -- di numerazione li lascia stare proprio perché arrivano già scritti.
  update public.invoices
  set status = p_status,
      year = p_year,
      number = p_number,
      code = v_code
  where id = v_invoice.id
  returning * into v_invoice;

  perform app.catch_up_document_counter(v_agency_id, v_counter, p_year, p_number);

  perform public.log_activity(
    v_agency_id, 'creazione', 'invoices', v_invoice.id, v_invoice.code,
    case when v_invoice.kind = 'nota_credito' then 'Nota di credito ' else 'Fattura ' end ||
      v_invoice.code || ' importata da un gestionale precedente per ' ||
      app.euro_testo(v_invoice.total_cents)
  );

  return v_invoice;
end;
$$;

comment on function public.import_legacy_invoice is
  'Inserisce un documento gia'' emesso altrove conservandone numero e data, e porta avanti il contatore.';
