-- =============================================================================
-- 0016 — Gli indici dell'ordinamento predefinito.
--
-- Ogni elenco del gestionale si apre già ordinato, e quell'ordinamento è ciò
-- che il novantacinque per cento delle aperture usa senza toccare nulla. Per
-- quattro elenchi su otto la colonna dell'ordinamento predefinito non aveva un
-- indice: con venti clienti di prova non si vede, con cinquantamila il
-- database ordina cinquantamila righe per mostrarne cinquanta, a ogni pagina.
--
-- Gli indici seguono la coppia che la query usa davvero — l'agenzia prima,
-- perché la RLS filtra sempre su quella, poi la colonna dell'ordine — e
-- ignorano le righe cancellate, che nessun elenco mostra.
-- =============================================================================

-- Preventivi: i più recenti in cima.
create index if not exists quotes_agency_created_idx
  on public.quotes (agency_id, created_at desc)
  where deleted_at is null;

-- Clienti, passeggeri e fornitori: in ordine alfabetico.
create index if not exists customers_agency_name_idx
  on public.customers (agency_id, display_name)
  where deleted_at is null;

create index if not exists passengers_agency_name_idx
  on public.passengers (agency_id, full_name)
  where deleted_at is null;

create index if not exists suppliers_agency_name_idx
  on public.suppliers (agency_id, name)
  where deleted_at is null;

-- Fatture: la data di emissione è già indicizzata, ma le bozze non ce l'hanno
-- e finiscono comunque in cima all'elenco. L'indice su `created_at` copre il
-- secondo criterio di ordinamento, che decide fra due bozze dello stesso
-- giorno.
create index if not exists invoices_agency_created_idx
  on public.invoices (agency_id, created_at desc)
  where deleted_at is null;

-- Attività: l'agenda le chiede per scadenza dentro un intervallo di date.
-- L'indice esistente parte dallo stato, che nell'agenda è quasi sempre lo
-- stesso: mettere la scadenza subito dopo l'agenzia serve le letture per
-- periodo, che sono quelle dell'agenda e del cruscotto.
create index if not exists tasks_agency_due_idx
  on public.tasks (agency_id, due_at)
  where deleted_at is null and due_at is not null;
