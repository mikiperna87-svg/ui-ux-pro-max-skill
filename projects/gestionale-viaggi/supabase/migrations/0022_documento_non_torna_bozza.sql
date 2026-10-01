-- ============================================================================
-- 0022 — Un documento emesso non torna bozza
--
-- Il controllo della 0013 confronta codice, numero, anno, cliente, pratica,
-- data, regime e importi — e si disattiva appena `old.status = 'bozza'`. Ma
-- non impediva di *portare* lo stato a 'bozza': una fattura emessa poteva
-- essere riaperta e, da lì, modificata o eliminata come se non fosse mai
-- esistita. Lo stesso valeva per le sue righe, che leggono lo stato del
-- documento padre.
--
-- Dal modulo non si poteva fare — l'azione di salvataggio filtra su
-- `status = 'bozza'` — ma la policy RLS permette la scrittura diretta sulla
-- tabella a chi ha i permessi contabili, e una chiamata all'API bastava.
--
-- La regola aggiunta è una sola, e volutamente minima: una volta uscito dalla
-- bozza, un documento non ci torna. Le transizioni in avanti restano libere,
-- perché inventare qui una macchina a stati completa vorrebbe dire decidere al
-- posto di chi fa la contabilità.
-- ============================================================================

create or replace function app.invoices_guard_issued()
returns trigger
language plpgsql
as $$
begin
  -- Un documento emesso non torna indietro. Il controllo sta prima
  -- dell'uscita anticipata sulla bozza: altrimenti basterebbe un
  -- aggiornamento per disattivare tutti gli altri.
  if old.status <> 'bozza' and new.status = 'bozza' then
    raise exception
      'Il documento % è già emesso e non torna in bozza: si corregge con una nota di credito',
      old.code;
  end if;

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
