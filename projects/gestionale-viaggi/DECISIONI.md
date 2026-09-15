# Decisioni architetturali

Ogni voce riporta la scelta, l'alternativa scartata e il motivo. Quando una
specifica era ambigua si è preso il partito più conservativo, e lo si è annotato
qui.

---

## 1. Accesso ai dati: SQL nativo + tipi generati, non Drizzle

**Scelta.** Migrazioni SQL scritte a mano in `supabase/migrations/`, accesso via
`supabase-js`, tipi TypeScript generati dallo schema (`npm run db:types`).

**Alternativa scartata.** Drizzle ORM.

**Perché.** La sicurezza del gestionale poggia sulla Row Level Security: ogni
query deve viaggiare con l'identità dell'utente. `supabase-js` lo fa da solo
attraverso il token di sessione; con Drizzle su una connessione diretta la RLS
andrebbe reimpostata a mano a ogni richiesta, e un errore in quel punto vale una
fuga di dati fra agenzie. In più la logica delicata (numerazioni, IVA 74-ter,
margine, stato di pagamento) sta in SQL, dove è verificabile con i test sul
database reale e non dipende dal linguaggio applicativo.

**Conseguenza.** I tipi non si scrivono a mano: `scripts/gen-types.mjs`
introspeziona il database e riscrive `src/lib/database.types.ts`. Va rilanciato
dopo ogni migrazione.

> La generazione ufficiale (`supabase gen types`) richiede Docker; lo script
> incluso produce la stessa forma di tipi partendo da una qualunque URL Postgres.

---

## 2. Importi in centesimi interi, aritmetica in BigInt

**Scelta.** Tutti gli importi sono `bigint` in centesimi sul database e interi in
JavaScript. Ogni moltiplicazione o divisione passa da `src/lib/money.ts`, che
lavora in BigInt con arrotondamento commerciale (half-up).

**Perché.** Su una fattura un centesimo perso è un errore contabile. Le
percentuali sono in **punti base** interi (22% = 2200 bps) così nemmeno le
aliquote introducono virgola mobile.

**Conseguenza.** Una regola ESLint vieta `Number.parseFloat` sugli importi, e gli
unit test coprono scorporo IVA, ripartizioni e formattazione.

---

## 3. Date: UTC sul database, Europe/Rome in interfaccia

`timestamptz` per gli istanti, `date` per le date pure (partenza, scadenza
documento). La resa avviene sempre attraverso `src/lib/date.ts`, che applica il
fuso dell'agenzia. Motivo: una partenza del 14 marzo deve restare il 14 marzo
anche per chi apre il gestionale da un altro fuso, e l'ora di un incasso deve
restare confrontabile fra sedi.

---

## 4. Multi-tenant: RLS su ogni tabella, nessuna eccezione applicativa

**Scelta.** `agency_id` su ogni tabella (per `agencies` è una colonna generata
uguale a `id`, così le policy sono uniformi) e policy di lettura/scrittura su
tutte. L'unica tabella senza `agency_id` è `rate_limits`, che per definizione
viene interrogata prima che esista un'identità.

**Perché.** Un filtro dimenticato in una query è un incidente; una policy
mancante è visibile e verificabile. I test in `tests/db/rls.test.ts`
dimostrano su Postgres reale che un utente dell'agenzia A non legge né scrive
nulla dell'agenzia B.

**Nota sulla ricorsione.** `app.current_agency_ids()` è `security definer`:
deve poter leggere `memberships` ignorandone la RLS, altrimenti la policy su
`memberships` richiamerebbe se stessa all'infinito.

---

## 5. Visibilità dell'operatore: pratiche proprie, anagrafiche condivise

**Scelta.** L'operatore vede solo le pratiche e i preventivi di cui è titolare, e
i clienti che ha creato o che compaiono in una sua pratica. Passeggeri e
fornitori restano visibili a tutta l'agenzia.

**Perché.** La specifica dice «solo le proprie pratiche e clienti». Passeggeri e
fornitori sono anagrafiche condivise: nasconderli produrrebbe duplicati (lo
stesso passeggero inserito tre volte) senza proteggere nulla di sensibile.

---

## 6. Margini nascosti agli operatori: nell'applicazione, non nella RLS

**Scelta.** Il parametro `hide_margins_from_operators` è applicato dal livello
applicativo (`session.permissions.margins`), non da una policy.

**Perché.** La RLS filtra righe, non colonne. Mascherare una colonna
richiederebbe viste separate per ruolo, con il rischio che una query futura
aggiri la vista. La regola è applicata in un solo punto, la sessione, e i
componenti chiedono il permesso invece del ruolo.

**Limite dichiarato.** Un operatore determinato che interrogasse direttamente
l'API vedrebbe costi e prezzi: la protezione è contro lo sguardo, non contro
l'esfiltrazione. Se l'agenzia avesse bisogno della seconda, servirebbe una vista
dedicata con `security_invoker` e le colonne assenti.

---

## 7. Numerazione: contatore transazionale, non `serial`

**Scelta.** Tabella `document_counters` con `UPSERT ... RETURNING` dentro la
transazione che crea il documento.

**Alternativa scartata.** Una sequenza Postgres.

**Perché.** Le sequenze non tornano indietro: un rollback lascerebbe un buco, e
la numerazione delle fatture per legge non ne ammette. L'UPSERT prende un lock di
riga: due utenti che confermano una pratica nello stesso istante ottengono numeri
diversi e consecutivi, e un annullamento restituisce il numero. I test lo
verificano anche con due transazioni concorrenti.

---

## 8. Prezzi lordi in riga, IVA calcolata in lettura

**Scelta.** `unit_price_cents` è il prezzo **lordo** praticato al cliente,
`unit_cost_cents` il costo netto fornitore. Imponibile e IVA si calcolano in
lettura, con le funzioni `app.line_vat_cents` / `app.line_taxable_cents`.

**Perché.** È così che ragiona l'agenzia («il cliente paga 3.000 €»). Il regime
cambia solo il modo di scomporre quel numero:

| Regime | Imponibile | IVA |
| --- | --- | --- |
| Ordinaria | corrispettivo scorporato | sul corrispettivo |
| **Art. 74-ter** | **margine** scorporato | **sul margine** |
| Esente art. 10 / fuori campo | corrispettivo | zero |

Calcolarle in lettura evita che una colonna memorizzata resti ferma a un valore
vecchio dopo una modifica della riga. Con margine negativo l'IVA è zero: il
74-ter non genera imposta a credito.

---

## 9. Margine e stato di pagamento in una vista, non in JavaScript

`public.booking_financials` calcola per ogni pratica ricavi, costi, commissioni,
margine, percentuale, incassato, saldo e stato di pagamento. Motivo: è l'unica
definizione possibile, la usano allo stesso modo la panoramica, l'elenco e il
dettaglio, e resta corretta anche interrogando il database da fuori.

Lo stato deriva dagli **incassi**, non dalla forma del piano rateale: una pratica
interamente pagata non è "in ritardo" perché una rata è rimasta aperta.

---

## 10. Preferenze di interfaccia nei cookie, scritte dal browser

**Scelta.** Tema e stato della barra laterale stanno in un cookie, scritto
direttamente dal client (`src/lib/preferences.ts`); il server lo legge al primo
render.

**Alternative scartate.** `localStorage` (il server non lo vede: la pagina
"lampeggerebbe" passando da chiaro a scuro) e una Server Action (la preferenza
andrebbe persa da chi ricarica prima che la richiesta arrivi — è successo
davvero, e un test end-to-end lo ha colto).

---

## 11. Tema scuro a due canali

I token semantici sono definiti tre volte: su `:root` (chiaro), sotto
`@media (prefers-color-scheme: dark)` con il guardiano
`:root:not([data-theme="light"])`, e su `:root[data-theme="dark"]`. Così la
preferenza di sistema funziona senza scelta esplicita, e la scelta esplicita
vince in entrambe le direzioni. Nessun colore è definito **solo** dentro un
blocco condizionale.

---

## 12. Limitazione delle richieste sul database

**Scelta.** Finestra scorrevole in tabella (`public.rate_limits`) interrogata da
una funzione `security definer`.

**Alternativa scartata.** Un contatore in memoria.

**Perché.** Su Vercel ogni richiesta può essere servita da un'istanza diversa: un
contatore in memoria non limiterebbe nulla. Le soglie sono configurabili per
ambiente (`LIMITE_ACCESSO`, …) perché una suite end-to-end apre decine di
sessioni in pochi secondi dallo stesso indirizzo. Se il limitatore stesso è
guasto la richiesta passa: un guasto del guardiano non deve chiudere fuori chi ha
diritto di entrare.

---

## 13. Componenti su primitive Radix, non su una libreria pronta

Bottoni, campi, tabelle, dialoghi e notifiche sono scritti nel progetto sopra le
primitive Radix, con i token del design system. Nessun `shadcn add`: i componenti
copiati portano con sé scelte grafiche altrui e un aspetto riconoscibile, mentre
qui il requisito era un prodotto che non somigliasse a un template.

Le notifiche sono implementate direttamente (contesto + portale, ~150 righe)
invece di aggiungere una dipendenza.

---

## 14. Un solo indicatore di messa a fuoco

Il contorno `:focus-visible` globale è l'unico meccanismo. I campi non lo
disattivano più in favore di un anello proprio: l'anello spariva nelle modalità
ad alto contrasto, e un test end-to-end sulla tastiera lo ha reso evidente.

---

## 15. Navigazione: solo le sezioni che esistono

La barra laterale elenca soltanto le sezioni consegnate. Una voce che porta a una
pagina inesistente è peggio di una voce assente. Le sezioni si aggiungono in
`src/lib/navigation.ts` quando il modulo è pronto.

Per lo stesso motivo la tavolozza dei comandi (⌘K) contiene per ora navigazione e
comandi: la ricerca di pratiche, clienti e preventivi si attiva con la fase 3,
quando esisteranno le pagine di dettaglio a cui i risultati devono portare.

---

## 16. Grafico dell'andamento disegnato in CSS

Dodici barre non giustificano il peso di una libreria di grafici. Il grafico è
CSS puro, con la stessa informazione ripetuta in una tabella riservata ai lettori
di schermo. Recharts entrerà nella fase 7, dove servono grafici davvero
interattivi.

---

## 17. Documenti: nessun file finto nel seed

Il seed non crea righe in `documents`: punterebbero a file inesistenti e
l'interfaccia offrirebbe scaricamenti rotti. La conseguenza voluta è che l'avviso
«pratica confermata senza voucher» si accende davvero sui dati dimostrativi.

---

## 18. Banco di prova locale per sviluppo e test

In assenza di Docker non è possibile eseguire Supabase in locale.
`supabase/testing/local-api.mjs` espone la stessa superficie HTTP (GoTrue +
PostgREST) sopra al Postgres con le migrazioni reali, eseguendo ogni richiesta
con `set local role authenticated` e i claim JWT sulla connessione.

Non fa parte del prodotto, non viene distribuito e non è raggiungibile in
produzione. Serve a una cosa sola: poter verificare davvero — a schermo e con i
test end-to-end — quello che altrimenti si potrebbe soltanto dichiarare.

---

## 19. Ricerca: colonna generata e indice trigram, non `ilike '%...%'`

Ogni anagrafica ha una colonna `search_text` generata e conservata, che unisce
nome, ragione sociale, contatti e codici fiscali normalizzati (minuscole, senza
accenti, senza punteggiatura), con indice GIN `pg_trgm`. Cercare "citta" trova
"Città" e cercare un pezzo di email trova il cliente, senza scansione completa.

La normalizzazione vive in `app.normalize`, scritta in **plpgsql** e non in SQL:
una funzione SQL verrebbe incorporata nella query dal pianificatore, esponendo
la volatilità `stable` di `unaccent` e facendo rifiutare la colonna generata,
che pretende una funzione `immutable`. Il dizionario passato a `unaccent` è
esplicito proprio perché il risultato non dipenda dalla configurazione del
server.

---

## 20. Lo stato dell'elenco sta nell'indirizzo

Ricerca, filtri, ordinamento, pagina e righe per pagina sono parametri della
query string, letti dal Server Component e risolti sul database. Nessuno stato
di elenco vive nel browser.

Costa una navigazione a ogni cambio di filtro, e in cambio: un elenco filtrato
si può mandare a un collega con un collegamento, il tasto indietro funziona,
l'aggiornamento della pagina non perde niente, e l'esportazione CSV riceve
esattamente gli stessi parametri della vista (`/clienti/esporta?...`), quindi
esporta ciò che si sta guardando e non "tutto".

---

## 21. TanStack Table v8, con paginazione e ordinamento manuali

La griglia usa `@tanstack/react-table` **8.x**, fissata: la 9 ha una API
incompatibile (`createCoreRowModel`, `useTable`) e non porta nulla che serva qui.

Sono attivi `manualPagination`, `manualSorting` e `manualFiltering`: la libreria
si occupa solo di colonne, visibilità e selezione; righe, ordine e conteggio
arrivano dal server. Il browser non riceve mai più righe di quelle che mostra,
e con 5.000 clienti la pagina pesa quanto con 40.

Da tablet in su la griglia è una tabella; sotto diventa un elenco di schede,
perché nove colonne su 390 px non si leggono. L'ordinamento, che sulla tabella
vive nelle intestazioni, sulle schede diventa il comando "Ordina": senza, su
telefono l'elenco resterebbe senza ordinamento.

---

## 22. Importazione CSV in due tempi, con ripiego sulle colonne assenti

Il file viene letto nel browser e mostrato in anteprima riga per riga, con
l'esito di ciascuna; solo alla conferma le righe valide passano al server, che
le rivalida con lo stesso schema Zod. La validazione che decide è quella del
server, l'anteprima serve a non far scoprire gli errori a cose fatte.

Le intestazioni si riconoscono per sinonimi ("Partita IVA", "P.IVA",
`partita_iva`), e i campi che lo schema pretende ma che il file non ha prendono
un ripiego: senza colonna "Tipo" un elenco di sole persone è di privati, uno di
sole ragioni sociali è di aziende, un fornitore senza condizioni commerciali
prende 30 giorni e regime 74-ter. Un'esportazione altrui ha quasi sempre meno
colonne delle nostre: rifiutare l'intero file per una colonna mancante sarebbe
corretto e inutile.

Prima di inserire, il server scarta le righe che ripetono un'anagrafica già
esistente per email, partita IVA o codice fiscale — e i doppioni interni allo
stesso file. Non c'è un vincolo di unicità sul database, perché due fratelli
possono condividere un recapito e un cliente può non avere nessuno di quei
campi; il controllo sta quindi dove si conosce l'intenzione ("importa queste
righe"), e le righe saltate vengono elencate con il loro motivo. Chi corregge
tre righe e ricarica il file intero — cioè chiunque — non si ritrova
l'anagrafica doppia.

---

## 23. Validazione fiscale scritta due volte, di proposito

Partita IVA (checksum di Luhn), codice fiscale (carattere di controllo) e IBAN
(mod 97) sono validati in `src/lib/fiscal.ts`, usato dallo schema Zod sia nel
browser sia nel server. La stessa verifica esiste in SQL (`app.tax_code_with_checksum`)
perché il seed non può inserire codici che l'applicazione rifiuterebbe.

Le due implementazioni sono confrontate da un test: sono duplicate, quindi
devono restare d'accordo per costruzione, non per fiducia.

---

## 24. Clienti con pratiche: anonimizzazione, mai eliminazione

L'eliminazione di un cliente è consentita solo se non ha pratiche collegate; è
comunque una cancellazione logica (`deleted_at`), registrata nel registro
attività. Per gli altri esiste l'anonimizzazione GDPR: sostituisce i dati
personali, conserva gli importi e i riferimenti fiscali che la legge impone di
tenere, e lascia le pratiche consultabili.

Il diritto alla cancellazione e l'obbligo di conservazione fiscale convivono
così: il cliente sparisce come persona, la contabilità resta in piedi.

---

## 25. I valori inviati tornano indietro quando la validazione fallisce

Dopo una Server Action React azzera i campi non controllati del modulo. Con un
modulo da venti campi, sbagliare una cifra della partita IVA significherebbe
ridigitare tutto. Per questo `ActionState` porta anche i valori inviati e ogni
campo li usa come valore predefinito.

Non è autosalvataggio: è la garanzia che un errore di validazione costi la
correzione di un carattere e non la ricompilazione del modulo.

---

## 26. Il selettore a segmenti è fatto di bottoni, non di radio nascosti

Il modello diffuso — `<input type="radio" class="sr-only">` dentro la `<label>` —
lascia il contorno di messa a fuoco su un elemento di un pixel: chi naviga da
tastiera non vede dove si trova, e il puntatore colpisce la label invece del
comando. `SegmentedControl` usa bottoni con `role="radio"` dentro un
`role="radiogroup"`: il contorno globale di `:focus-visible` circonda il
segmento per intero, il fuoco entra una volta sola nel gruppo e le frecce
spostano la scelta come in un gruppo nativo.

---

## 27. Scelte rinviate, con motivo

| Argomento | Rinviata a | Perché |
| --- | --- | --- |
| Generazione PDF | Fase 5 | La scelta della libreria dipende dal layout dei preventivi |
| Email transazionali (Resend) | Fase 8 | Servono i modelli, che dipendono dai moduli precedenti |
| TanStack Query | Fase 4 | Serve dove c'è stato client vero: lo scadenzario, non gli elenchi |
| Realtime | Fase 4 | Utile sullo scadenzario condiviso, inutile finché non esiste |
| Viste salvate degli elenchi | Fase 3 | I filtri stanno già nell'indirizzo: salvarli è un'aggiunta, non una riscrittura |
