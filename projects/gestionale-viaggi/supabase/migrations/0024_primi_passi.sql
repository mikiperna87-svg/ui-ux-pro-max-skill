-- ============================================================================
-- 0024 — I primi passi di un'agenzia nuova
--
-- Un gestionale vuoto non si giudica dalle funzioni che ha: si giudica da
-- quanto ci vuole a far succedere la prima cosa utile. Il giorno in cui
-- un'agenzia entra, tutti gli elenchi sono vuoti, tutti gli indicatori sono
-- zero, e le funzioni che la convincerebbero sono dietro dati che non ci sono
-- ancora.
--
-- Questa migrazione aggiunge l'unica cosa che al percorso guidato serve dal
-- database: il momento in cui l'agenzia ha deciso di non vederlo piu'. Tutto il
-- resto — quali passi sono fatti — si ricava dai dati che ci sono, contandoli:
-- un elenco di passi «completati» salvato a parte divergerebbe dalla realta' al
-- primo cliente cancellato, e mostrerebbe spuntato un passo che non lo e'.
--
-- La colonna sta su `agency_settings` e non sulla singola iscrizione perche' i
-- primi passi riguardano lo stato dell'agenzia, non quello della persona: il
-- secondo titolare che entra non deve rivedere un percorso gia' fatto.
-- ============================================================================

alter table public.agency_settings
  add column if not exists onboarding_dismissed_at timestamptz;

comment on column public.agency_settings.onboarding_dismissed_at is
  'Quando l''agenzia ha chiuso il riquadro dei primi passi. Nullo se non l''ha mai chiuso.';
