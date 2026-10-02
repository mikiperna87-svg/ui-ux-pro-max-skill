-- ============================================================================
-- 0019 — Le chiavi esterne diventano differibili
--
-- `bookings.quote_id` punta a `quotes` e `quotes.converted_booking_id` punta a
-- `bookings`: un ciclo, e un ciclo non ha un ordine di inserimento valido.
-- Qualunque caricamento massivo — un ripristino da copia di sicurezza, una
-- migrazione da un altro gestionale, il seed di un ambiente di prova — si
-- ferma su quel ciclo.
--
-- `deferrable initially immediate` non cambia niente nell'uso normale: i
-- controlli restano immediati, riga per riga, e un errore di programmazione
-- viene colto subito com'era prima. Cambia solo che ora una transazione *puo'*
-- chiedere `set constraints all deferred` e farsi verificare tutto alla fine.
--
-- Vale per tutte le chiavi esterne e non solo per le due del ciclo: scegliere
-- quali vorrebbe dire rifare la scelta a ogni tabella nuova, e sbagliarla una
-- volta.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select c.conname, n.nspname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not c.condeferrable
  loop
    execute format(
      'alter table %I.%I alter constraint %I deferrable initially immediate',
      v.nspname, v.relname, v.conname
    );
  end loop;
end $$;
