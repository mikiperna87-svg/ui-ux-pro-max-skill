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

La stessa regola vale dentro SQL quando un **istante** va raggruppato per
**giorno**: `report_quotes_by_owner` converte con
`(created_at at time zone 'Europe/Rome')::date` prima di confrontare con il
periodo. Senza la conversione il confronto userebbe il fuso della sessione —
UTC sui server — e un preventivo scritto alle 00:30 del primo gennaio
finirebbe nell'anno precedente, dove la segreteria non lo cercherebbe mai.
Le colonne `date` (partenza, emissione, scadenza) non hanno questo problema:
sono già giorni, e per questo si preferiscono ovunque la precisione dell'ora
non serva.

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

## 27. Conferma e annullamento sono funzioni del database

`confirm_booking` e `cancel_booking` vivono in SQL, non nella Server Action.
Toccano quattro tabelle insieme — pratica, piano rateale, scadenze, task — e o
succede tutto o non succede niente: una transazione del database lo garantisce,
una sequenza di chiamate PostgREST no.

Sono anche **ripetibili**: riconfermare una pratica dopo un cambio di prezzo
allinea gli importi delle scadenze invece di affiancarne di nuove, e non crea un
secondo controllo documenti. Un operatore che clicca due volte non deve
produrre due acconti.

L'annullamento pretende un motivo, calcola la penale, toglie le scadenze future
e chiude i task aperti — e non cancella nulla: la pratica resta consultabile,
perché era un fatto ed è successa.

---

## 28. La numerazione non si passa, si riceve

`year`, `number` e `code` sono `not null` e li assegna un trigger con il
contatore transazionale. Chi inserisce da PostgREST, però, non può omettere una
colonna `not null` priva di default: si ritrovava a passare uno zero, e il
vincolo `number > 0` rifiutava la riga.

Le tre colonne hanno ora un default che vale da segnaposto, e il trigger lo
riconosce come "assegnalo tu". L'inserimento nomina solo i dati reali del
documento, e nessuno può inventarsi un numero di pratica.

---

## 29. Il quadro economico resta sempre in vista

La scheda della pratica ha sei schede, ma la domanda che porta qualcuno ad
aprirla è quasi sempre la stessa: quanto vale, quanto ho incassato, quanto
manca. Perciò venduto, costo, commissioni, margine, incassato, residuo e stato
di pagamento stanno in una barra laterale che non cambia al cambio di scheda.

Sotto i 1280 px la barra scende sotto il contenuto invece di stringersi: un
riquadro di numeri largo dieci caratteri non è più una sintesi.

---

## 30. Gli incassi si attribuiscono alle scadenze in lettura

Lo stato di pagamento della pratica lo calcola il database (`booking_financials`).
Quale *rata* sia coperta, invece, si decide leggendo: gli incassi si attribuiscono
in ordine di scadenza, come farebbe una persona riconciliando a mano
(`src/lib/scadenze.ts`).

Non è una scorciatoia: legare un incasso a una rata specifica è una decisione
contabile che appartiene al modulo degli incassi, e finché non esiste, mostrare
"da incassare" accanto a una rata già coperta sarebbe semplicemente falso.

---

## 31. Una pratica si cerca anche per cognome del cliente

`bookings.search_text` è una colonna generata e non può leggere un'altra
tabella. Ma chi cerca una pratica parte dal cliente, non dal codice.

La vista `booking_list` porta quindi accanto la colonna di ricerca già
indicizzata di `customers`, e la query cerca su entrambe con un `or`. Nessun
dato duplicato, nessun trigger di sincronizzazione, e la ricerca resta una sola
interrogazione.

---

## 32. I documenti stanno in un deposito privato

Il bucket `documenti` non è pubblico: non esiste un indirizzo da indovinare. La
prima cartella del percorso è l'identificativo dell'agenzia, ed è su quella che
la policy dello storage verifica l'accesso — la stessa regola della RLS, appena
scritta altrove.

Ogni apertura chiede al server un collegamento firmato che vale cinque minuti.
Se l'inserimento della riga nel database fallisce, il file appena caricato viene
rimosso: un file senza riga sarebbe invisibile e non cancellabile.

---

## 33. Una vista salvata è un nome dato a un indirizzo

I filtri stanno già nella query string. Una vista salvata non introduce un
secondo modo di filtrare: memorizza quella stringa con un nome. Con
`membership_id` nullo appartiene all'agenzia (la crea il titolare), altrimenti è
di chi l'ha salvata.

Due indici unici parziali invece di un vincolo unico, perché in SQL i NULL non
si confrontano fra loro: senza il primo, la stessa vista condivisa potrebbe
esistere in dieci copie.

---

## 34. La suite end-to-end gira con un lavoratore solo

Tutti i contesti condividono un server e un database. Due browser che creano
pratiche nello stesso istante si contendono il contatore della numerazione e i
parametri dell'agenzia, e i fallimenti finiscono per raccontare la macchina
invece del prodotto.

La suite completa impiega qualche minuto in più ed è ripetibile: da un test
serve quello. `scripts/dev-stack.mjs` accende Postgres e il banco di prova se
sono spenti, così "prima esegui le due cose" smette di essere un passaggio da
ricordare.

---

## 35. Niente `loading.tsx` di rotta: le pagine hanno già i propri scheletri

Il gruppo `(app)` aveva un `loading.tsx` che mostrava uno scheletro finito
mentre la pagina veniva preparata. Quel file crea un confine Suspense sopra
tutte le pagine dell'applicazione e, combinato con un layout che attende a ogni
richiesta e con azioni server che scrivono cookie (il rinnovo della sessione
Supabase) e chiamano `revalidatePath`, attiva un difetto del router di Next 15:
la corsia di transizione resta sospesa e non viene mai risvegliata, così la
risposta dell'azione arriva completa al browser ma l'interfaccia non la applica
mai. Per chi usa il gestionale significa un bottone fermo su "Salvataggio..."
per sempre, con il dato in realtà già salvato.

Misurato sulla build di produzione, con quaranta creazioni di pratica di
seguito: **16 bloccate su 40** con il `loading.tsx`, **0 su 40** senza (e 0 su
80 inserimenti di riga contro 4). Il difetto è noto a monte
(vercel/next.js#98303, riprodotto solo nelle build di produzione) ed è corretto
solo in canary di Next 16: restare su Next 15, come chiede la specifica, vuol
dire togliere una delle condizioni che lo innescano.

La perdita è minima perché ogni pagina ha già i suoi confini `<Suspense>` con
gli scheletri giusti (`TableSkeleton`, `KpiSkeleton`, `ListSkeleton`):
l'intestazione e la barra dei comandi compaiono subito e sono le aree dati a
riempirsi dopo. Al posto dello scheletro a pagina intera, la voce di menu
cliccata mostra una rotellina (`StatoNavigazione`, basata su `useLinkStatus`),
così la navigazione resta annunciata anche a chi legge con la tastiera.

Quando il correttivo arriverà in un Next 15 stabile, il `loading.tsx` si può
rimettere: basta ripetere il conteggio descritto sopra e confrontarlo con questi
numeri.

---

## 36. Gli incassi coprono le scadenze in ordine di data, e la regola sta in SQL

Registrare un incasso non dice da solo *quale* scadenza è stata pagata. La
regola scelta è quella che userebbe chiunque riconciliando a mano: il primo
denaro entrato copre la prima scadenza, il resto scende alla successiva.

La regola vive nella vista `installment_list`, non in TypeScript. La fase 3
aveva una funzione `attribuisciIncassi()` che faceva lo stesso calcolo per la
scheda della pratica; con lo scadenzario sarebbero diventate due
implementazioni della stessa regola, e due implementazioni divergono al primo
ritocco — con il risultato che la stessa rata si leggerebbe "saldata" in una
pagina e "da incassare" nell'altra. La funzione è stata tolta: scheda e
scadenzario interrogano la stessa vista.

Lo stato di una rata ha quattro valori (`saldata`, `parziale`, `scaduta`,
`attesa`) e una colonna a parte, `is_late`. Servono entrambi: una rata coperta
a metà si legge "parziale" — è il fatto più utile da vedere — ma resta in
ritardo, ed è su `is_late` che filtra lo scadenzario. Senza la distinzione, un
pagamento parziale sparirebbe dall'elenco dei solleciti.

---

## 37. Un incasso ha una chiave di idempotenza

`record_payment_in` accetta una chiave costruita da pratica, data, importo,
tipo e riferimento. Se arriva due volte la stessa chiave, la seconda chiamata
restituisce l'incasso già scritto invece di crearne un altro.

Un doppio clic su "Registra", una connessione che cade dopo l'invio o un
tentativo ripetuto non devono diventare un doppio incasso: sarebbe un errore
che si scopre alla chiusura del mese, quando ritrovare l'origine costa più che
prevenirla. Le due tabelle avevano già la colonna e il vincolo unico dalla
fase 1; qui viene finalmente usata.

---

## 38. Un rimborso si scrive in negativo

`payment_in_kind` prevede `rimborso`. Un rimborso è denaro che torna al
cliente, quindi si registra con importo negativo: l'incassato della pratica
scende e il residuo si riapre da solo, senza una seconda tabella e senza segni
da interpretare. Il vincolo è in due punti — nello schema Zod e nella funzione
di dominio — perché la seconda difende anche dalle chiamate che non passano
dal modulo.

---

## 39. I pagamenti ai fornitori nascono dalle righe di servizio, senza riscrivere quelli già eseguiti

`sync_booking_payouts` allinea i pagamenti alle righe di servizio con un
fornitore e un costo: importo netto, scadenza dichiarata sulla riga o, in
mancanza, sette giorni prima della partenza. È ripetibile e non duplica nulla.

Quello che **non** fa è toccare un pagamento già eseguito. Se il costo di una
riga cambia dopo che il fornitore è stato pagato, il denaro è uscito per
l'importo vecchio: riallinearlo falsificherebbe la cassa. La differenza si
gestisce con un secondo movimento, non riscrivendo la storia.

---

## 40. Il modulo di un'azione non vive dentro la riga che l'azione fa sparire

Lo storno di un incasso apriva un dialogo montato dentro la riga della
tabella. Funzionava a metà: l'incasso veniva stornato, ma il dialogo restava
aperto e l'esito non compariva.

Il motivo è che l'azione server rivalida la pagina, e il nuovo albero arriva
al browser insieme al risultato dell'azione: nello stesso commit React
applica il successo *e* toglie la riga, così l'effetto che chiude il dialogo e
mostra l'avviso non viene mai eseguito. I moduli delle azioni distruttive
stanno quindi nel componente che sopravvive all'operazione, e la riga contiene
solo il bottone che li apre.

---

## 41. Un solo confine Suspense per pagina

La panoramica aveva cinque `<Suspense>` fratelli — indicatori, andamento,
attività, partenze, pagamenti — che si sospendevano tutti insieme a ogni cambio
di periodo. Circa una volta su quattro il clic su "90 giorni" non faceva nulla:
la risposta del server arrivava completa, e il router non applicava mai la
navigazione. È lo stesso difetto della decisione 35, questa volta su una
navigazione invece che su una mutazione.

Misurato sulla build di produzione, stesso gesto ripetuto:

| Pagina | Confini Suspense | Navigazioni bloccate |
| --- | --- | --- |
| Panoramica, prima | 5 | 4-6 su 16 |
| Panoramica, dopo | 1 | 0 su 20 |
| Elenco pratiche | 1 | 0 su 16 |

Il numero di confini che si sospendono insieme è la causa, non il modo in cui
la navigazione parte: convertire le voci del periodo da `<Link>` a comandi con
`router.replace` non cambiava niente (4 su 16), consolidare i confini li ha
azzerati entrambi. Le voci sono quindi rimaste collegamenti, che è la cosa
giusta per un indirizzo condivisibile.

Il corpo della panoramica è ora un solo componente con un solo scheletro. Si
perde il riempimento a scaglioni dei singoli riquadri: le sezioni partono
insieme con `Promise.all` e compaiono insieme. L'intestazione con il selettore
del periodo resta fuori dal confine, quindi visibile e cliccabile da subito.

La regola vale per tutto il gestionale: un confine per pagina, attorno all'area
dati. Gli elenchi lo rispettavano già, ed è il motivo per cui non hanno mai
mostrato il problema.

---

## 42. Il permesso della pagina pubblica è il token, non una chiave

Il preventivo si apre a un cliente che non ha un account. La strada facile
sarebbe leggere i dati con la chiave di servizio, che scavalca la Row Level
Security: un'unica riga di codice sbagliata, lì dentro, e il collegamento di
un preventivo diventerebbe una finestra su tutto il database.

Le tre operazioni pubbliche — leggere, accettare, rifiutare — sono invece
funzioni `security definer` che accettano **soltanto** il token. Filtrano da
sole su token, cancellazione e stato, e l'applicazione le chiama con il client
anonimo, lo stesso che userebbe un estraneo. Non c'è niente da scavalcare
perché non c'è nessun privilegio in più: il `public_token` è un uuid casuale,
non compare in nessun elenco e vale per un preventivo solo.

Il ruolo `anon` non ha alcun permesso sulle tabelle `quotes` e `quote_items`:
il test di database lo dimostra leggendole direttamente e ottenendo
`permission denied`.

---

## 43. Lo stato "scaduto" non si scrive sul database

Un preventivo scaduto resta `inviato` finché qualcuno non lo rinnova. La
scadenza è un fatto derivato — `valid_until` è passato — e scriverla come stato
vorrebbe dire un processo che ogni notte aggiorna delle righe, e una finestra
in cui il database mente perché quel processo non è ancora passato.

`quote_list` espone quindi la colonna calcolata `is_expired`, l'elenco ci
filtra sopra e il distintivo mostra "Scaduto". Una bozza non è mai scaduta: la
validità di un'offerta conta da quando la si manda.

---

## 44. Rispondere due volte non cambia la risposta

Il cliente riapre l'email tre giorni dopo e preme di nuovo il bottone. Deve
succedere niente, non un secondo cambio di scelta.

`accept_quote` su un preventivo già accettato restituisce la riga così com'è,
senza toccare variante, nome e data: chi conferma per primo decide. Il rifiuto
si comporta allo stesso modo. Accettare dopo un rifiuto, o rifiutare dopo
un'accettazione, sono invece errori espliciti: sono ripensamenti, e un
ripensamento passa dall'agenzia.

La stessa regola vale a monte: `convert_quote_to_booking` chiamata due volte
restituisce la pratica che esiste già invece di aprirne una seconda con la sua
numerazione.

---

## 45. Al cliente arrivano i prezzi, mai i costi

`quote_public_items` non restituisce `unit_cost_cents`, né la commissione, né
il margine: non li nasconde in interfaccia, proprio non li seleziona. È l'unico
modo per essere certi che un ritocco al foglio di stile, o una riga aggiunta in
fretta, non li mandi a chi non deve vederli.

La stessa regola governa il PDF, che è il documento allegato all'email, e si
ritrova nei test: la pagina pubblica viene controllata anche per ciò che **non**
deve contenere.

---

## 46. Il PDF porta con sé il proprio carattere

I font standard del formato PDF — Helvetica e famiglia — usano una codifica del
1985 che non contiene il simbolo dell'euro né l'apostrofo tipografico. Non
danno errore: i caratteri mancanti spariscono e basta. Il primo documento
generato diceva "1.500,00" senza il segno € e "lintero gruppo" senza apostrofo.

Il documento incorpora quindi Inter (SIL Open Font License) in due pesi, lo
stesso carattere dell'applicazione, letto da `src/server/pdf/fonts/`. Solo i
glifi usati finiscono nel file: un preventivo di due proposte pesa circa 16 kB.
`outputFileTracingIncludes` in `next.config.ts` tiene i due file dentro il
pacchetto della funzione anche in produzione, dove `public/` non basta.

---

## 47. Il ritocco percentuale della copia vale sul prezzo, non sul costo

Costruire la proposta Premium riga per riga quando cambia solo il livello dei
servizi è lavoro inutile: si copia la Consigliata e si ritocca. La percentuale
si applica però al solo prezzo di vendita, perché il fornitore chiede quello
che chiede: quello che cambia è il margine, e va visto cambiare.

La copia sostituisce le righe già presenti nella proposta di destinazione
invece di aggiungersi: premere due volte "Copia" deve dare lo stesso risultato
di premerlo una volta.

---

## 48. Il numero si assegna all'emissione, non alla creazione

Prima una fattura riceveva il numero nel momento in cui nasceva la riga. Basta
aprire una bozza e cambiare idea per lasciare un buco nella numerazione, che
per le fatture non è ammesso.

Numero e codice sono quindi annullabili finché lo stato è `bozza`, e un vincolo
li rende obbligatori appena non lo è più:

```sql
check (status = 'bozza' or (number is not null and code is not null))
```

Il trigger che numera lavora sullo stesso passaggio, e ricalcola l'anno dalla
data di emissione: una bozza aperta a dicembre ed emessa a gennaio prende il
primo numero dell'anno nuovo, non l'ultimo del vecchio. Emettere due volte non
rinumera, perché `issue_invoice` su un documento già emesso restituisce quello
che c'è.

La 0010 aveva dato a queste colonne un segnaposto (0 e stringa vuota) perché un
inserimento da PostgREST non può omettere una colonna NOT NULL senza default.
Ora che sono annullabili il segnaposto è il valore nullo, e il trigger
normalizza comunque lo zero che un client vecchio potrebbe mandare.

---

## 49. Un documento emesso è fermo: si corregge con una nota di credito

Due trigger impediscono di toccare una fattura emessa: uno sulla testata
(cliente, data, imponibile, imposta, totale, cancellazione logica) e uno sulle
righe, che blocca inserimenti, modifiche e cancellazioni. Restano liberi lo
stato e la data di invio, che sono le uniche cose che cambiano dopo.

Non è una scelta di prudenza: è il modo in cui funziona un documento fiscale.
La conseguenza pratica è che il lavoro si fa sulla bozza, dove tutto è
modificabile, e che il pulsante «Modifica» sparisce dopo l'emissione invece di
portare a un modulo che al salvataggio darebbe errore.

Il prezzo lo paga il seed, che prima creava le fatture già emesse e poi ci
aggiungeva le righe: ora apre la bozza, la riempie e la emette, come farebbe una
persona.

---

## 50. Gli importi di una nota di credito restano positivi

Una nota di credito dice «ti tolgo 500 €», non «contiene -500 €». Le sue righe
hanno quindi importi positivi, e il segno lo mettono la vista e il registro,
dove serve davvero: `invoice_list` espone `signed_total_cents`, e `vat_register`
somma con il segno del tipo di documento.

L'alternativa — righe negative — avrebbe reso il totale della nota negativo e il
PDF pieno di meno da stampare in valore assoluto, spostando la complessità dal
punto giusto (due colonne di una vista) a quello sbagliato (ogni schermata che
mostra un importo).

---

## 51. L'incasso della pratica vale sulla fattura, fino a concorrenza

Il cliente paga la pratica; la fattura è il documento di quella pratica. Se il
collegamento non lo tiene il database, l'elenco delle fatture mostra «da
incassare» su documenti già pagati.

Due trigger lo mantengono, e solo dove non c'è ambiguità: un incasso senza
fattura indicata si attacca all'unica fattura emessa della pratica, e
l'emissione ricollega gli incassi già registrati. Con due fatture sulla stessa
pratica l'attribuzione la fa una persona.

L'importo attribuito è però limitato al totale del documento:

```sql
least(coalesce(incassi.paid_cents, 0), i.total_cents) as paid_cents
```

Il motivo è il caso dell'intermediazione: il cliente ha versato il pacchetto
intero mentre la fattura riguarda la sola provvigione. Oltre il totale il numero
non significherebbe niente per il documento, e l'eccedenza si legge sulla
pratica, dove sta davvero.

---

## 52. Il campo data accetta una forma sola, e il banco di prova deve rispettarla

Un `<input type="date">` accetta soltanto «AAAA-MM-GG»: qualunque altra cosa lo
lascia vuoto senza dire niente. PostgREST restituisce le colonne `date` proprio
in quella forma, ma il driver `pg` usato dal banco di prova locale le trasformava
in oggetti `Date`, che JSON serializza come istanti UTC
(`2026-09-20T00:00:00.000Z`). Risultato: in sviluppo e nei test end-to-end ogni
modulo di modifica mostrava le date vuote, mentre in produzione erano piene.

Il difetto è stato corretto in due punti, perché entrambi erano sbagliati:

- il banco di prova ora registra un parser per il tipo `date` che restituisce la
  stringa così com'è, e si comporta come la produzione;
- `toDateInput()` taglia alla forma accettata qualunque valore la contenga, ed è
  usata da tutti i campi data del gestionale.

Un banco di prova che si comporta diversamente dalla produzione non è un banco
di prova: nasconde i difetti veri e ne inventa di falsi.

---

## 53. I report hanno un asse solo: la data di partenza

**Scelta.** Tutti i report — per operatore, per destinazione, per fornitore —
selezionano le pratiche sulla **data di partenza**, lo stesso criterio della
panoramica. I preventivi, che una data di partenza possono non averla ancora,
si contano per data di creazione e stanno in una scheda separata, con scritto
sopra come si contano.

**Alternativa scartata.** Lasciar scegliere l'asse (creazione, conferma,
partenza, incasso) con un menu.

**Perché.** Con quattro assi possibili, due sezioni del gestionale possono
mostrare due numeri diversi per la stessa domanda, e nessuno dei due è
sbagliato: è il modo più rapido per perdere fiducia in un cruscotto. Con un
asse solo il venduto della panoramica e quello del report coincidono sempre, e
il confronto fra operatori è fra cose omogenee.

**Conseguenza.** Un preventivo scritto a novembre per un viaggio di luglio pesa
su novembre nella conversione e su luglio nel venduto. Sono due domande
diverse, e il report non le mescola mai in una riga sola: la tabella dei
preventivi è una tabella a parte, con scritto sopra come si conta.

---

## 54. Il termine di paragone: pari durata nei report, anno su anno in panoramica

**Scelta.** Nel report il confronto è con il **periodo immediatamente
precedente di pari durata** (febbraio si confronta con i 28 giorni prima, non
con gennaio intero). In panoramica il confronto è con lo **stesso periodo di un
anno fa**.

**Perché.** Due comparazioni diverse perché le due finestre sono diverse. Il
report guarda un intervallo chiuso, e allora "prima" vuol dire qualcosa di
preciso; la panoramica comprende le partenze dei prossimi dodici mesi, e un
intervallo che contiene il futuro non ha un "periodo prima" paragonabile —
avrebbe il vuoto delle pratiche non ancora vendute. Anno su anno invece regge,
perché confronta futuro con futuro, ed è anche il modo in cui un'agenzia legge
la stagione.

**Conseguenza.** Ogni variazione dice a parole con che cosa si confronta. Se il
termine di paragone è zero non viene mostrata alcuna percentuale: passare da
zero a cinquantamila euro non è "+100 %", è un confronto che non esiste, e la
casella lo scrive («Nessun dato nel periodo precedente») invece di inventare un
numero.

---

## 55. Le destinazioni si raggruppano sulla forma normalizzata

**Scelta.** `report_by_destination` raggruppa su `lower(btrim(destination))` e
mostra come etichetta la grafia usata più spesso (`mode()`).

**Alternativa scartata.** Un'anagrafica di destinazioni con chiave esterna sulla
pratica.

**Perché.** La destinazione è testo libero perché il mondo non sta in un elenco
a tendina, e chi scrive una pratica al telefono non deve fermarsi a censire una
meta nuova. Ma "Santorini e Mykonos", "santorini e mykonos" e la stessa con uno
spazio di troppo sono lo stesso viaggio: tre righe da 5 % invece di una da 15 %
non sono un dettaglio estetico, sono un report che mente sulla classifica.

**Conseguenza.** Il raggruppamento ignora maiuscole e spazi, non gli accenti né
i sinonimi: "Roma" e "Rome" restano due righe. Il giorno in cui servisse una
tassonomia vera — per paese, per area, per stagione — la si aggiunge come
tabella di normalizzazione senza toccare le pratiche già scritte.

---

## 56. Il report dei fornitori segue il permesso sui margini

**Scelta.** Chi non può vedere i margini non vede nemmeno la vista "Fornitori",
e nelle altre due viste le colonne di costo e margine non compaiono, né a
schermo né nel file esportato. Un indirizzo `?vista=fornitori` scritto a mano
riporta agli operatori invece di rispondere con un errore.

**Perché.** Il report dei fornitori è per intero una lettura di costi: mostrarlo
a chi non può vedere il margine equivarrebbe a mostrarglielo, perché il ricarico
si ottiene per differenza con il venduto che ha già sotto gli occhi. Un permesso
che si aggira con una sottrazione non è un permesso.

**Conseguenza.** Il filtro è nell'interfaccia e nella rotta di esportazione, non
nelle funzioni SQL, che restituiscono sempre tutte le colonne: il confine vero
resta la RLS, che decide *quali righe* si vedono, mentre il permesso sui margini
decide *quali colonne* si mostrano. Il file esportato ha le colonne del ruolo di
chi lo scarica, non quelle della pagina che ha generato il collegamento.

---

## 57. La posta ha una coda, e nulla si dichiara inviato senza esserlo

**Scelta.** Ogni messaggio è una riga di `email_messages` scritta *prima* del
tentativo di consegna, con destinatario, oggetto, corpo in HTML e in testo,
tentativi ed esito. Senza credenziali del fornitore la riga resta `in_coda` e
l'interfaccia lo dice con queste parole; con le credenziali diventa `inviata`
solo dopo che il fornitore ha risposto, e `errore` con il motivo scritto
accanto. Due vincoli sul database rendono impossibile il resto:
`email_messages_sent_has_date` (niente stato "inviata" senza data di invio) e
`email_messages_error_has_reason` (niente errore senza spiegazione).

**Perché.** La tentazione, in un ambiente senza fornitore di posta collegato, è
mostrare "inviato" e non spedire niente. È la bugia più costosa che un
gestionale possa dire: l'operatore chiude la pratica convinto che il cliente
abbia il preventivo, e lo scopre quando il cliente chiama arrabbiato. Un
messaggio che resta in coda è un lavoro rimandato; un messaggio dichiarato
inviato e mai partito è un lavoro perso.

**Conseguenza.** Nessun invio sparisce: un messaggio in errore si rimanda dal
pannello Posta, e per la fattura il PDF viene ricostruito al momento del
rinvio invece di essere conservato, così l'allegato riflette il documento com'è
adesso. Il numero di tentativi resta sulla riga: un messaggio in coda con
tentativi maggiori di zero ha già incontrato un problema, e si vede.

---

## 58. La chiave del fornitore di posta sta nell'ambiente, non nelle impostazioni

**Scelta.** `RESEND_API_KEY` e `EMAIL_MITTENTE` sono variabili d'ambiente del
server. Il pannello Posta dice soltanto se ci sono e con quale mittente; non
offre un campo per inserirle. Quello che il titolare configura da lì è ciò che
il cliente legge: nome del mittente, indirizzo di risposta, firma, e
l'interruttore generale dell'invio.

**Perché.** Una chiave API è una credenziale con cui si può scrivere a nome
dell'agenzia. Metterla in una tabella significa che compare in un backup, in un
export, nei log di una query andata storta, e che chiunque prenda il controllo
di un account titolare la porta via. L'ambiente del server non lo attraversa
nessuna di queste strade.

**Conseguenza.** Attivare la posta è un'operazione di chi amministra il server,
non di chi usa il gestionale — ed è giusto così, perché passa dalla verifica
del dominio presso il fornitore. Fino ad allora l'applicazione funziona per
intero: compone i messaggi, li registra, li mostra. Manca solo l'ultimo metro.

---

## 59. Che cosa cambia stato quando si invia

**Scelta.** Inviare un preventivo lo porta a `inviato` comunque, anche se il
messaggio resta in coda. Inviare una fattura la porta a `inviata` soltanto se
il messaggio è partito davvero.

**Perché.** Non è un'incoerenza, è la differenza fra le due cose. Lo stato
`inviato` di un preventivo dice che il suo collegamento pubblico è vivo e che
il cliente può accettarlo: quel collegamento esiste dal momento in cui si preme
il pulsante, indipendentemente dalla posta, e si può passare al cliente anche
a voce o per messaggio. Lo stato `inviata` di una fattura è invece
un'affermazione sulla consegna del documento, e su quella non si può
scommettere.

**Conseguenza.** Il sollecito di una rata non cambia nessuno stato: è un
promemoria, e l'incasso resta quello che è finché non arrivano i soldi.

---

## 60. L'agenda guarda indietro di sessanta giorni

**Scelta.** Le tre finestre dell'agenda — oggi, sette giorni, trenta giorni —
riguardano solo il futuro: all'indietro l'agenda parte sempre da sessanta
giorni fa, e ciò che è scaduto compare in cima, sotto "In ritardo".

**Perché.** Un'agenda che mostra soltanto da oggi in avanti fa sparire i
problemi nel momento esatto in cui diventano problemi: la rata non incassata
di ieri esce dallo schermo proprio il giorno in cui qualcuno dovrebbe
occuparsene. Il calendario di una scrivania non funziona come quello del muro.

**Conseguenza.** La finestra scelta cambia quanto avanti si guarda, mai quanto
indietro: passando da "oggi" a "trenta giorni" gli arretrati restano gli
stessi, e l'elenco si allunga solo in fondo. Sessanta giorni sono un limite
arbitrario e dichiarato: oltre, un arretrato non è più una cosa da fare in
settimana ma una questione da riprendere dal suo registro — lo scadenzario, i
pagamenti, le pratiche.

---

## 61. L'ora di una scadenza è ora di Roma, e si converte ai due estremi

**Scelta.** Un campo `datetime-local` scrive e legge l'orologio dell'agenzia.
`fromDateTimeInput` costruisce l'istante passando i pezzi separati a
`TZDate.tz`, e `toDateTimeInput` lo riporta indietro; sul database la scadenza
resta un `timestamptz`, e la vista `task_list` ricava il giorno con
`(due_at at time zone 'Europe/Rome')::date`.

**Perché.** Il costruttore che riceve la stringa intera la legge come se fosse
già UTC e si limita a mostrarla a Roma: sposta l'istante invece di
interpretarlo. Un promemoria scritto per le 9:30 finiva salvato per le 7:30, e
d'estate sarebbe suonato con due ore di anticipo — un errore che nessuno
segnala come tale, perché l'ora mostrata torna a essere quella giusta appena si
riapre il modulo. Lo stesso vale in fondo alla catena: un'attività scaduta alle
23:30 del 30 giugno appartiene al primo luglio a Roma, e senza conversione
comparirebbe nell'agenda del giorno prima.

**Conseguenza.** È l'estensione ai singoli istanti della regola già presa per i
periodi (decisione 3): le date si confrontano nel fuso dell'agenzia, non in
quello del processo. La coppia di funzioni ha un test che chiude il giro — un
istante convertito e riconvertito deve tornare identico — su una data d'estate
e una d'inverno, perché è il cambio d'ora a far emergere l'errore.

---

## 62. Un modulo dentro una pagina sospesa non usa `useActionState`

**Scelta.** Il modulo delle attività invia con `startTransition`, chiamando la
Server Action come una funzione e tenendo l'esito in uno `useState`. È l'unico
modulo del gestionale scritto così; tutti gli altri restano su
`<form action={submit}>` con `useActionState`.

**Perché.** Nella build di produzione di Next 15, un modulo inviato con
`useActionState` da una pagina il cui corpo sta dentro un confine `Suspense`
non riceve mai l'esito se l'azione chiama `revalidatePath`: la scrittura
riesce, il registro la annota, ma la transizione non si chiude. Il bottone
resta su "Salvataggio...", la finestra non si chiude, e l'operatore riprova —
creando due attività identiche. In sviluppo lo stesso codice funziona, il che
rende il difetto particolarmente sgradevole: si manifesta solo là dove costa.

L'agenda è la prima pagina in cui le due cose si incontrano — un corpo sospeso
e un modulo che scrive sulla pagina stessa — perché altrove i moduli stanno su
pagine dedicate (`/clienti/nuovo`, `/pratiche/nuova`) e i comandi delle righe
non sono moduli. Le prove hanno isolato la combinazione: la stessa azione dalla
scheda di una pratica, che non ha confini `Suspense`, chiude in 400 ms; lo
stesso comando "Completa" dall'agenda, che passa da `startTransition`, chiude
in 240 ms; il modulo sull'agenda restava appeso per sempre.

**Conseguenza.** Si perde il funzionamento senza JavaScript, che questo
modulo — dentro una finestra di dialogo — non aveva comunque. `SubmitButton`
accetta ora un `pending` esplicito, perché fuori da `<form action>` non c'è uno
stato del form da cui leggerlo. La regola per il futuro: se una pagina ha un
confine `Suspense` attorno al corpo e vi si apre un modulo che scrive, il
modulo invia con `startTransition`. Vale come estensione delle decisioni 35 e
41: il router di Next 15 e i confini sospesi vanno tenuti d'occhio ogni volta
che una transizione deve riconciliare una pagina con sé stessa.

---

## 63. Ogni misura di testo va dichiarata a chi unisce le classi

**Scelta.** `cn()` non usa più `twMerge` così com'è, ma una versione estesa a
cui sono dichiarate le dieci misure del design system — `hero`, `display`,
`title`, `heading`, `body`, `small`, `caption`, `micro`, `metric`,
`metric-sm`. Un test unitario percorre l'elenco e fallisce se una misura nuova
viene aggiunta al CSS e dimenticata qui.

**Perché.** `tailwind-merge` risolve i conflitti conoscendo i nomi di
Tailwind: `text-sm` è una dimensione, `text-red-500` un colore. Le nostre
misure non le conosce, e davanti a `text-accent-fg text-caption` vedeva due
colori in conflitto: teneva l'ultimo e buttava via il primo. Ogni bottone con
una dimensione — cioè tutti tranne quelli a sola icona — perdeva il colore
della propria variante e ereditava quello del corpo della pagina. Il bottone
principale mostrava testo quasi nero su verde scuro, 2,7:1 contro i 4,5
richiesti da AA; nel tema scuro, bianco su verde chiaro a 2,1:1.

**Conseguenza.** Il difetto era invisibile a occhio — il testo si legge, male,
ma si legge — e nessuna revisione visiva l'avrebbe colto. L'ha trovato axe.
Da qui la regola più generale della fase: le cose che si misurano vanno
misurate, non guardate.

---

## 64. Il testo discreto ha due valori, uno per tema

**Scelta.** `--text-subtle` non è più lo stesso grigio nei due temi: `warm-550`
sul fondo chiaro, `warm-450` su quello scuro. I due gradini sono nati dalla
misura, non dall'occhio: il peggiore dei rapporti su tutti i nostri fondi è
5,01 nel chiaro e 4,80 nello scuro, sopra la soglia AA di 4,5.

**Perché.** Un grigio a metà scala sembra la scelta ovvia per un testo
"discreto" in entrambi i temi, e invece non basta a nessuno dei due: 3,96 sul
fondo chiaro, 3,71 su quello scuro. Ed era il colore delle etichette degli
indicatori, delle didascalie, dei metadati — il testo più piccolo del
gestionale, quello che ha più bisogno di contrasto, non meno.

**Conseguenza.** La scala neutra ha due gradini in più. Il testo discreto resta
visibilmente più tenue di `--text-muted` (5,01 contro 6,55 nel chiaro): la
gerarchia si vede ancora, ma sta tutta sopra la soglia.

---

## 65. Un'etichetta nascosta alla vista resta per chi ascolta

**Scelta.** Le etichette dei comandi che sul telefono lasciano solo l'icona
usano `EtichettaBottone`, cioè `sr-only sm:not-sr-only`, mai `hidden
sm:inline`.

**Perché.** `hidden` è `display: none`, e `display: none` toglie l'elemento
anche dall'albero di accessibilità. Il bottone restava con la sola icona, che
è decorativa per definizione: un lettore di schermo annunciava "pulsante", e
basta. Su uno schermo stretto — cioè proprio dove VoiceOver e TalkBack si
usano di più — l'intestazione di ogni elenco era una fila di pulsanti senza
nome. Visivamente non cambia nulla, perché `sr-only` toglie comunque
l'elemento dal flusso e non occupa neanche lo spazio del `gap`.

**Conseguenza.** Restano quattro punti con `hidden sm:inline`, ciascuno con la
sua ragione scritta accanto: dove esiste già una forma breve per il telefono,
dove il nome accessibile è su un altro elemento, e dove a sparire è un comando
intero e non la sua etichetta.

---

## 66. Sul telefono i filtri stanno chiusi, la ricerca no

**Scelta.** Sotto la soglia `sm` i filtri di un elenco stanno dietro il
comando "Filtri", che porta scritto quanti ne sono attivi. Il campo di ricerca
resta sempre a schermo, fuori dal pannello.

**Perché.** Sull'elenco delle pratiche, a 390 px, i filtri occupavano oltre
mille pixel di altezza: più di uno schermo intero da scorrere prima di vedere
la prima riga. Un elenco che non mostra righe non è un elenco. La ricerca è
l'eccezione perché è il comando che si usa per primo e più spesso: metterlo
dietro un pulsante vorrebbe dire due gesti al posto di uno, ogni volta.

**Conseguenza.** Il numero sul pulsante non è un vezzo: un elenco filtrato che
non dice di esserlo si legge come un elenco vuoto, e chi lo guarda conclude
che i dati non ci sono. Da `sm` in su non cambia niente: i filtri sono dove
sono sempre stati.

---

## 67. L'ordinamento predefinito di un elenco ha sempre un indice

**Scelta.** Ogni elenco ha un indice sulla coppia `(agency_id, colonna
dell'ordinamento predefinito)`, parziale sulle righe non cancellate.

**Perché.** Quattro elenchi su otto non ce l'avevano: preventivi per data di
creazione, clienti, passeggeri e fornitori per nome. Con i venti clienti dei
dati di prova non si vede niente; con cinquantamila, il database ordina
cinquantamila righe per mostrarne cinquanta, a ogni apertura della pagina. Il
piano lo dice senza ambiguità: prima c'era un nodo `Sort` sopra una scansione
completa, ora l'indice fornisce già l'ordine e il `Limit` si ferma dopo
cinquanta righe.

**Conseguenza.** Gli indici coprono l'ordinamento predefinito, non tutte le
colonne ordinabili: è quello che il novantacinque per cento delle aperture
usa senza toccare nulla, e un indice per colonna costerebbe in scrittura più
di quanto renda in lettura. Il giorno in cui un ordinamento alternativo
diventasse abituale, si aggiunge il suo.

---

## 68. Le migrazioni applicate si registrano

**Scelta.** `npm run db:apply` scrive ogni migrazione applicata in
`public.schema_migrations` e al giro successivo la salta. Un database creato
prima del registro si allinea una volta sola con `--adotta`, che registra
senza eseguire.

**Perché.** Prima il comando rieseguiva tutto dall'inizio, e alla seconda
messa in produzione si fermava sulla prima migrazione non idempotente. È il
comando che il manuale di rilascio indica di eseguire a ogni versione: un
aggiornamento che funziona solo la prima volta non è una procedura di
rilascio.

**Conseguenza.** `--adotta` esiste ma non si attiva da solo, e non indovina:
su un database fermo a metà strada, registrare tutto sarebbe una bugia che si
scopre al primo dato mancante. Chi lo usa deve sapere che il database è già
allineato. Il registro vive in `public`, perché deve esistere prima che le
migrazioni creino lo schema `app`, e ha la RLS accesa senza policy: attraverso
l'API non lo legge nessuno, ci arriva solo chi possiede il database. Vale anche
per una tabella di servizio la regola di tutte le altre.

**Aggiunta, imparata sul campo.** Rieseguire le migrazioni su un database già
migrato non è innocuo: la seconda applicazione di una vecchia migrazione
*riporta indietro* ciò che una successiva aveva cambiato. È successo davvero in
questa fase — una `create or replace function` della 0003 ha sovrascritto la
versione della 0010, e da quel momento ogni nuova pratica nasceva senza numero.
Nessun errore a schermo se non "non siamo riusciti a salvare": il registro non
è una comodità, è ciò che impedisce a un comando di rilascio di corrompere il
database che dovrebbe aggiornare.

---

## 69. La politica sui contenuti si regge su un numero usa e getta

**Scelta.** Ogni risposta porta una `Content-Security-Policy` con un nonce
diverso: gli script eseguibili sono quelli che il server ha firmato, più
quelli che loro stessi caricano (`strict-dynamic`). Gli stili restano su
`unsafe-inline`.

**Perché.** È l'ultima rete, e l'unica che lavora dentro il browser
dell'utente: sotto ci sono già la validazione Zod sul server e la RLS sul
database. Uno script iniettato — da un campo, da un commento, da una
dipendenza compromessa — non ha il nonce di quella richiesta e non parte.
L'eccezione sugli stili è deliberata: Radix e il grafico dell'andamento
scrivono attributi `style` calcolati al momento, e un foglio di stile
iniettato può imbruttire una pagina, non portare via i dati di un cliente.

**Conseguenza.** In sviluppo la politica aggiunge `unsafe-eval`, senza il
quale il ricaricamento a caldo di Next non funziona: è una differenza
dichiarata fra i due ambienti, non una dimenticanza. `frame-ancestors 'none'`
affianca `X-Frame-Options`, che resta per i browser che la politica non la
leggono. `Strict-Transport-Security` va solo in produzione: su localhost
direbbe al browser di pretendere HTTPS anche lì, e da quel momento lo sviluppo
si blocca finché non si svuota a mano la cache delle politiche.

---

## 70. Il costo di una pagina è misurato, e una parte non si tocca

**Scelta.** Il livello dati è verificato: aprire un elenco costa una query per
vista — `memberships`, `agencies`, `agency_settings`, la vista dell'elenco e le
viste salvate — e nessuna query per riga. La verifica dell'utente è memorizzata
per richiesta con `cache` di React, così i componenti che chiedono la sessione
nello stesso render non la rifanno. Il resto del traffico resta com'è.

**Perché.** Misurando il banco di prova, l'apertura dell'elenco pratiche
produceva ventisette chiamate al server di autenticazione contro sei query di
dati. Nessun N+1 sulle righe, come si poteva temere: le ventisette venivano da
Next, che in produzione preleva in anticipo ogni collegamento a schermo —
quattordici schede di pratica, più le impostazioni, il nuovo, un cliente. Ogni
prelievo passa dal middleware, e il middleware verifica la sessione.

**Conseguenza.** Saltare la verifica sui prelievi sarebbe sicuro — non è il
middleware a proteggere le pagine, lo fa `requireSession()` dentro ciascuna, e
sotto c'è la RLS — ma non è implementabile in modo onesto: l'intestazione che
distingue un prelievo da una navigazione vera (`Next-Router-Prefetch`) non
arriva al middleware in questa versione di Next, e le altre non bastano a
distinguerli. Saltare la verifica su qualcosa che *potrebbe* essere una
navigazione vera vorrebbe dire non reindirizzare chi non ha più la sessione.
Meglio una chiamata di troppo su una richiesta speculativa — che è fuori dal
percorso critico, non fa aspettare nessuno e costa solo al server di
autenticazione — che una regola di accesso applicata a intermittenza. Il
giorno in cui l'intestazione arrivasse, il punto dove intervenire è uno solo,
l'inizio di `updateSession`.

---

## 71. Scelte rinviate, con motivo

| Argomento | Rinviata a | Perché |
| --- | --- | --- |
| Generazione PDF | — | Risolta in fase 5: `@react-pdf/renderer`, che compone il documento come l'interfaccia e non richiede un browser sul server |
| Email transazionali (Resend) | — | Risolta in fase 8: coda sul database, adattatore reale, credenziali nell'ambiente del server |
| TanStack Query | — | Lo scadenzario si è rivelato una griglia come le altre: stato nell'indirizzo, dati dal server. Una libreria di stato client non avrebbe nulla da gestire |
| Realtime | Non pianificata | L'agenda si rilegge a ogni apertura e la posta ha il suo pannello: una connessione persistente aggiungerebbe complessità senza togliere un solo clic |
| Esportazione XLSX | Non pianificata | Il CSV si apre in Excel italiano senza passaggi, e nessuno ha chiesto formule o fogli multipli: una libreria in più va giustificata da un bisogno vero, non dal fatto che si potrebbe |
| Fatturazione elettronica (XML SdI) | Risolta a metà | Il tracciato FatturaPA 1.2 è stato costruito dopo la roadmap (migrazione 0018, DECISIONI 79): il file si produce e si verifica prima di produrlo. Resta fuori la **trasmissione**, che richiede accreditamento, firma e un canale presso un intermediario: l'esito si registra a mano dal pannello sulla scheda della fattura |

---

## 72. La pubblicazione carica i file, non collega GitHub

**Scelta.** Il progetto Vercel non è collegato al repository. `scripts/deploy-vercel.mjs`
elenca i file con `git ls-files`, li carica uno per uno e crea la pubblicazione.

**Perché.** L'account Vercel dell'agenzia non ha l'applicazione GitHub installata:
`GET /v1/integrations/git-namespaces` risponde con una lista vuota. Collegarla
avrebbe richiesto un passaggio a mano nell'interfaccia di GitHub, e soprattutto
avrebbe dato a un servizio terzo l'accesso in lettura a un repository che
contiene molto più del gestionale.

**Conseguenza.** Non c'è pubblicazione automatica a ogni `git push`: ogni
rilascio è un comando esplicito. È un passaggio in più e una sorpresa in meno —
nessuna versione arriva in produzione perché qualcuno ha spinto un ramo.
`git ls-files` come sorgente dell'elenco significa che `node_modules`, `.next`,
`.env.local` e i risultati dei test restano fuori senza una seconda lista da
tenere allineata: quello che non è nel repository non è in produzione.

---

## 73. Le migrazioni viaggiano in HTTPS, non sulla porta Postgres

**Scelta.** `scripts/db-apply-api.mjs` applica le migrazioni al progetto ospitato
passando dalla Management API di Supabase. `scripts/db-apply.mjs` resta per il
Postgres locale. Il registro `public.schema_migrations` è lo stesso, quindi i due
comandi si alternano senza contarsi addosso.

**Perché.** La porta 5432 di un progetto Supabase è raggiungibile in IPv6 diretto
o attraverso il pooler, e in molte reti nessuna delle due strade è aperta;
`api.supabase.com` risponde sempre. Tenere il rilascio legato a un requisito di
rete che non controlliamo voleva dire un rilascio che funziona sulla macchina di
chi l'ha scritto.

**Conseguenza.** Entrambi gli script parlano con `curl` invece che con `fetch()`:
`fetch()` di Node ignora le variabili di proxy, e dietro il proxy di una rete
aziendale il comando resterebbe appeso senza dire perché. Le sedici migrazioni
sono state applicate così, in ordine, al primo tentativo.

---

## 74. La conferma dell'indirizzo email è spenta, e si riaccende con la posta

**Scelta.** Su Supabase `mailer_autoconfirm` è acceso: chi si registra entra
subito, senza passare da un messaggio di conferma. Le regole della password sul
server (dieci caratteri, una minuscola, una maiuscola, una cifra) sono state
allineate a quelle già applicate da Zod, che prima erano più severe del
database.

**Perché.** Il progetto non ha ancora un fornitore di posta: Supabase userebbe
il proprio servizio condiviso, limitato a due messaggi l'ora e con recapito
garantito soltanto agli indirizzi dell'organizzazione. Con la conferma accesa e
senza SMTP, la registrazione si fermerebbe a metà — utente creato, agenzia no,
e nessun messaggio in arrivo. Meglio una porta che si apre che una porta che
finge di aprirsi.

**Conseguenza.** Finché resta così, chiunque conosca l'indirizzo del gestionale
può creare un'agenzia. Non è un rischio per i dati — la RLS isola ogni agenzia
dalle altre, e un'agenzia nuova nasce vuota — ma è un invito che non serve a
nessuno. Quando la chiave Resend sarà configurata, i due interruttori da girare
sono `mailer_autoconfirm` a spento e `disable_signup` a acceso, da
Authentication → Providers. Entrambi in un pannello, nessuna riga di codice.

---

## 75. Due agenzie di prova restano nel database, e non le ho cancellate

**Scelta.** La verifica di produzione ha creato due agenzie, «Agenzia di
Verifica», per dimostrare che la registrazione funziona davvero. Sono ancora lì.

**Perché.** Cancellarle richiedeva di sospendere il trigger che rende immutabile
`activity_log`: l'eliminazione a cascata tocca il registro attività, e il
registro rifiuta qualunque DELETE. È esattamente il comportamento chiesto dalla
specifica, ed è arrivato addosso a chi l'aveva scritto — che è il momento in cui
si scopre se una regola è vera o decorativa.

**Conseguenza.** Le due agenzie sono inerti: la RLS fa sì che nessun'altra
agenzia le veda, e nessuna di esse veda le altre. Restano finché qualcuno non
decide, consapevolmente, o di riportare il database allo stato appena creato —
`drop schema public cascade` e le sedici migrazioni da capo, che porta via il
registro insieme a tutto il resto — o di tenerle. La scelta che non si può fare
è la terza: togliere due righe dal registro e lasciare il resto in piedi.

---

## 76. La registrazione si chiude con un codice, non con un interruttore

**Scelta.** La variabile `CODICE_REGISTRAZIONE`. Se c'è, il modulo di
registrazione chiede un codice di invito e il server lo verifica prima di
toccare qualunque cosa; se non c'è, il modulo resta aperto com'era.

**Perché.** La strada ovvia era `disable_signup` su Supabase: un interruttore,
zero righe di codice. Ma chiude fuori anche il proprietario, e in questa
installazione l'agenzia vera non era ancora stata creata: girarlo avrebbe
lasciato il gestionale in piedi e inaccessibile a tutti, compreso chi lo
possiede. Un codice chiude la porta agli sconosciuti lasciando la chiave a chi
deve entrare, e la stessa chiave serve per far entrare la seconda agenzia
quando arriverà.

**Conseguenza.** La verifica sta nella Server Action e non nel modulo: un campo
nascosto o il `required` del browser non fermano nessuno, chiunque può inviare
il form a mano. Sta dopo il limite di frequenza — cinque tentativi l'ora per
indirizzo — così provare i codici a tappeto non è un'opzione. Il confronto passa
da uno sha256 e da `timingSafeEqual`: un `===` esce al primo carattere diverso,
e su abbastanza tentativi quella differenza di tempo si misura; lo sha256 serve
anche a non far trapelare la lunghezza del codice. La variabile non ha il
prefisso `NEXT_PUBLIC`, quindi il codice non finisce nel pacchetto che arriva
al browser: il modulo sa soltanto che un codice serve.

---

## 77. Una colonna che dice «cancellata» adesso cancella

**Scelta.** La migrazione 0017 insegna a `app.current_agency_ids()`,
`app.current_role()` e `app.current_membership_id()` a ignorare le agenzie con
`deleted_at` valorizzato.

**Perché.** La colonna esisteva dalla 0002 e non la guardava nessuno. Si poteva
marcare un'agenzia come cancellata e i suoi membri continuavano a entrare, a
leggere e a scrivere: una colonna che dichiara una cosa e non la fa è peggio di
una colonna che non c'è, perché qualcuno prima o poi ci conta. Me ne sono
accorto cercando un modo onesto di togliere di mezzo le due agenzie nate dalla
verifica di rilascio, dopo che il registro attività — immutabile, come chiesto
— si era rifiutato di lasciarle cancellare.

**Conseguenza.** Il controllo sta nelle tre funzioni e non nel codice
dell'applicazione perché quelle tre sono la porta da cui passa ogni policy di
questo schema: chiudendola lì, la cancellazione vale per venticinque tabelle in
un colpo solo, comprese le query che nessuno ha ancora scritto. `has_role`,
`can_write`, `can_manage_accounting` e `is_owner` leggono tutte `current_role`
e si adeguano da sole. In `getSession` la lettura dell'agenzia passa da `single`
a `maybeSingle`: per un ex membro la riga non è più visibile, e trattarlo come
un errore a ogni richiesta sarebbe rumore — la sessione semplicemente non si
apre. Il registro attività resta intatto: dice ancora che quelle agenzie sono
esistite, che è esattamente il suo mestiere.

---

## 78. Due redirect che si rilanciavano, e una pagina bianca

**Scelta.** Il middleware non rimanda più su `/` chi è autenticato e apre
`/registrati`: quel rimbalzo resta solo per `/accedi`. A decidere è la pagina
stessa, che rimanda alla panoramica solo chi ha davvero una sessione
applicativa.

**Perché.** Avere un utente autenticato non vuol dire avere un'agenzia. Il
middleware però non lo sa: sa leggere il token, non interrogare le membership —
e per saperlo servirebbe una query a ogni richiesta, comprese quelle
speculative che Next fa in anticipo. Così rimbalzava su `/` anche chi
un'agenzia non ce l'aveva, e `/` — dove `requireSession()` non trova la
sessione — lo rispediva su `/registrati`. I due redirect si rilanciavano, il
browser smetteva di seguirli, e al posto di una risposta restava una pagina
bianca con dentro solo «Salta al contenuto».

**Conseguenza.** Il caso non era teorico e non l'ho introdotto io marcando
cancellate le agenzie di prova: ci finiva chi riceve un invito — il percorso
che `signUpAction` dichiara di gestire, «se l'utente ha già una sessione
creiamo solo l'agenzia» — e chi conferma l'indirizzo senza completare la
registrazione, che è esattamente quello che il messaggio «dopo la conferma
potrai completare la creazione dell'agenzia» promette. Tre strade diverse
finivano nello stesso muro. La query che il middleware non può permettersi, la
pagina sì: `/registrati` la fa una volta sola, per sé. Il test end-to-end
percorre la strada intera — registrazione, agenzia cancellata sotto i piedi,
ritorno — perché è la sequenza che nessuno rifarebbe a mano.

---

## 79. La fattura elettronica: il file sì, il canale no

**Scelta.** Il gestionale produce il file XML FatturaPA 1.2, lo verifica prima
di produrlo, gli assegna un progressivo di invio univoco e tiene traccia
dell'esito. Non lo trasmette: quello resta a un intermediario, e l'esito si
registra a mano dal pannello.

**Perché.** Parlare direttamente con il Sistema di Interscambio richiede
accreditamento, un canale accreditato e una firma: è un rapporto contrattuale,
non una libreria da installare. Gli intermediari che lo fanno per conto terzi
hanno API diverse fra loro e credenziali che qui non ci sono. Scrivere
l'integrazione con uno di essi senza poterla provare avrebbe prodotto codice
che *sembra* funzionare, che è la cosa peggiore da consegnare a chi ci deve
fatturare davvero.

**Conseguenza.** Il confine è dove il lavoro è verificabile per intero. Quello
che c'è — tracciato, verifica, progressivo, stato — è provato: i test mettono
il generatore contro ventisei casi, e la catena intera contro una fattura vera
del banco di prova, confrontando il totale del file con quello della fattura al
centesimo. Quando si sceglierà un intermediario, il punto in cui innestarlo è
uno solo: l'azione che oggi registra l'esito a mano.

La verifica preventiva è la parte che si nota usandolo. Uno scarto di SdI
arriva giorni dopo, con un codice tipo «00423» e nessun riferimento al campo
da correggere; il pannello dice la stessa cosa prima, in italiano, e dice
anche dove si corregge — «Impostazioni → Agenzia», «Scheda del cliente». La
differenza è fra un problema di cinque minuti e uno di mezza giornata.

---

## 80. Il prezzo è IVA inclusa, e il generatore non lo sapeva

**Scelta.** `ivaRiga` e `imponibileRiga` scorporano l'IVA dal prezzo di riga,
con la stessa formula di `app.line_vat_cents` sul database. Un test di
integrazione confronta le due su centosettantasei combinazioni di importo,
aliquota e quantità.

**Perché.** Il primo generatore trattava il prezzo di riga come imponibile e
ci aggiungeva l'IVA sopra. Era sbagliato: in tutto il gestionale il prezzo è
il corrispettivo, IVA compresa — è così che si parla a un cliente al banco, ed
è così che il database calcola imponibile e imposta. L'errore non si vedeva
guardando il file, che era ben formato e plausibile: si è visto solo
confrontando il totale del file (385,83) con quello della fattura (316,25). Il
ventidue per cento di differenza, dichiarato al fisco.

**Conseguenza.** Il confronto con il database non è un test in più: è il test.
Una formula fiscale scritta due volte in due linguaggi diverge il giorno in cui
qualcuno ne tocca una sola, e qui la divergenza sarebbe fra un documento
fiscale e la sua copia telematica. Da qui viene anche la scelta di sommare
imponibile e imposta riga per riga invece di ricalcolarli sul gruppo:
ricalcolare darebbe numeri più tondi e un documento che contraddice il suo
originale di un centesimo. Il prezzo unitario, nel file, si ricava dividendo
il totale di riga per la quantità e si porta fino a otto decimali — il totale
è il numero che deve tornare, quindi è quello a restare intero.

---

## 81. La copia di sicurezza contiene i dati, non lo schema

**Scelta.** `npm run db:backup` scarica un file `.sql` di soli dati, per la
via HTTPS della Management API o per connessione diretta. Lo schema non c'è
dentro: vive nelle migrazioni, che stanno in git. Ripristinare vuol dire
database vuoto, `db:apply`, poi il file.

**Perché.** Un dump completo duplicherebbe lo schema in un secondo posto, non
versionato, che il giorno del ripristino potrebbe essere più vecchio del
codice. Le migrazioni sono già la descrizione autorevole della forma del
database, e il registro `schema_migrations` dice a quale versione la copia si
riferisce — è scritto nell'intestazione del file.

I valori non vengono riscritti come letterali SQL. Un apostrofo in una
ragione sociale, una data con il fuso, un array di tag, un JSON: ognuno di
questi è un modo di rompere un dump fatto a mano. Viaggiano come JSON e li
riconverte `json_populate_recordset`, che i tipi delle colonne li conosce.
Le colonne generate restano fuori, perché Postgres le ricalcola da sé.

**Conseguenza.** Il file contiene `auth.users`, cioè le impronte delle
password: senza, il ripristino ridà i dati e nessuno riesce più a entrare. Va
trattato come una credenziale, e `backup/` è in `.gitignore`. Chi preferisce
può escluderlo con `--senza-utenti`, sapendo che cosa rinuncia.

---

## 82. Una copia mai ripristinata non è una copia

**Scelta.** `npm run db:verifica-backup -- --sono-sicuro` prende una copia,
svuota il database, lo ricostruisce e confronta tabella per tabella. Rifiuta
di girare su qualunque indirizzo che non sia locale.

**Perché.** Il primo ripristino di prova è fallito, ed è il motivo per cui
questo comando esiste. `bookings` cita il preventivo da cui nasce e `quotes`
cita la pratica in cui si è convertito: un ciclo, e un ciclo non ha un ordine
di inserimento valido. Nessun riordino delle tabelle poteva risolverlo — la
copia sembrava perfetta e non si sarebbe ripristinata il giorno in cui
serviva.

**Conseguenza.** La 0019 rende differibili tutte le chiavi esterne dello
schema, e il file di copia apre con `set constraints all deferred`:
i controlli si fanno alla fine della transazione, quando tutte le righe ci
sono. `deferrable initially immediate` non cambia nulla nell'uso normale — i
controlli restano immediati riga per riga — e vale per tutte le chiavi, non
solo per le due del ciclo: scegliere quali vorrebbe dire rifare la scelta a
ogni tabella nuova, e sbagliarla una volta. Beneficia anche l'importazione di
dati da un altro gestionale, che ha lo stesso problema.

---

## 83. Il pannello di piattaforma vede i numeri, mai i dati

**Scelta.** Chi amministra la piattaforma vede l'elenco delle agenzie con i
loro conteggi — utenti, clienti, pratiche, fatture, ultima attività — e i
nomi dei membri. Non vede un solo cliente, una sola pratica, una sola fattura.

**Perché.** Un pannello di amministrazione è il posto più naturale dove
l'isolamento fra agenzie si rompe. La promessa «i tuoi dati li vedi solo tu»
vale finché non esiste un ruolo che la scavalca, e quel ruolo, una volta
creato, tende a crescere. Il confine sta nello schema e non nella disciplina
di chi scrive le query: nessuna policy dà all'amministratore accesso a
`customers`, `bookings`, `quotes` o `invoices`, e due test lo verificano
leggendo quelle tabelle e contando zero.

**Conseguenza.** I conteggi non potevano venire dalla vista, che gira con i
permessi di chi la legge: tornavano tutti zero, che è l'isolamento che
funziona e un pannello che non serve. Vengono da `app.platform_counts`, una
funzione `security definer` che restituisce numeri e nient'altro, e che chiude
con `where app.is_platform_admin()` — una funzione `security definer` senza
controllo è una porta di servizio lasciata aperta.

Amministratore non si diventa dall'applicazione: la riga in `platform_admins`
si inserisce da SQL o con la chiave di servizio. Il primo amministratore di un
sistema non può crearselo attraverso il sistema stesso.

---

## 84. Sospendere ferma la scrittura, non la lettura

**Scelta.** Un'agenzia sospesa continua a consultare ed esportare tutto quello
che ha registrato. Smette solo di registrarne di nuovo. La sospensione
richiede un motivo, e il motivo finisce nel registro attività dell'agenzia e
in una striscia in cima a ogni pagina.

**Perché.** Tenere in ostaggio i dati di chi non ha pagato è una leva che non
serve: chi vuole andarsene se ne va comunque, e chi sta per rimettersi in
regola nel frattempo non può lavorare né capire perché. Su dati fiscali di
un'azienda è anche una posizione difficile da difendere. Fermare la scrittura
ottiene lo stesso risultato commerciale senza nessuna di queste conseguenze.

**Conseguenza.** Il blocco sta in `can_write`, `can_manage_accounting` e
`is_owner`, che passano tutte da `agency_suspended`: una riga in più in tre
funzioni, e vale per le venticinque tabelle in una volta sola. `can_write`
resta falsa comunque per chi ha il ruolo di sola lettura, quindi la
sospensione non allenta niente. Il motivo obbligatorio non è burocrazia: chi
si trova il gestionale in sola lettura deve poter leggere perché, invece di
telefonare per scoprirlo.

---

## 85. I limiti del piano stanno nel database

**Scelta.** Il limite di utenti e quello di pratiche all'anno sono due trigger
`before insert`. La scadenza dell'abbonamento passa da `can_write`, insieme
alla sospensione.

**Perché.** Nell'applicazione sarebbero stati più facili da scrivere e più
facili da dimenticare: basta una query nuova, un'importazione, uno script di
manutenzione, e il limite non c'è più. Nel database vale per chiunque scriva,
comunque scriva — ed è così che i test lo provano, scrivendo direttamente in
SQL senza passare da nessuna pagina.

**Conseguenza.** Un'agenzia senza riga di abbonamento scrive senza limiti: il
gestionale installato per una sola agenzia non ha abbonamenti, e non deve
smettere di funzionare perché una tabella è vuota. La scadenza conta anche
quando lo stato dice ancora «attivo»: uno stato che nessuno ha aggiornato non
deve tenere aperta la porta.

Il prezzo dei piani nasce nullo. È una decisione commerciale, non tecnica, e un
prezzo inventato nel codice è peggio di nessun prezzo perché sembra una scelta.

---

## 86. Il webhook non parla con nessun fornitore in particolare

**Scelta.** `POST /api/abbonamenti/webhook` accetta un corpo documentato e una
firma HMAC-SHA256 nello schema `t=<epoca>,v1=<hmac>`, quello che usano quasi
tutti i fornitori di pagamenti. L'adattatore che traduce gli eventi di *quel*
fornitore in questo corpo si scrive quando il fornitore è scelto.

**Perché.** Lo stesso confine della fattura elettronica: senza credenziali non
si prova niente, e codice non provato che sembra funzionare è la cosa peggiore
da consegnare. Quello che c'è — firma, tolleranza sull'orario, validazione del
corpo, scrittura — è provato per intero, a mano e da otto test unitari più tre
end-to-end.

**Conseguenza.** Senza `WEBHOOK_ABBONAMENTI_SECRET` l'endpoint rifiuta tutto.
È il verso giusto: un endpoint che regala mesi di servizio non deve restare
aperto per distrazione. Il controllo sull'orario non è un di più — senza, una
richiesta firmata intercettata una volta varrebbe per sempre.

Due cose sono venute fuori solo provandolo sopra HTTP, e nessun test unitario
avrebbe potuto vederle. La prima: il middleware rimandava il webhook alla
pagina di accesso, e il fornitore avrebbe ricevuto un cortese 200 con dentro
dell'HTML mentre niente veniva aggiornato. La seconda: l'`upsert` di PostgREST
non funziona sul banco di prova locale, e sarebbe stato codice verificabile
solo in produzione. Ora la scrittura passa da una funzione — la stessa che usa
il pannello di piattaforma — revocata a tutti i ruoli tranne quello di
servizio, `authenticated` compreso, che altrimenti avrebbe trovato lì un modo
per regalarsi un piano.

---

## 87. Una fattura emessa non torna in bozza

**Scelta.** La migrazione 0022 aggiunge una riga al controllo della 0013: se lo
stato esce da «bozza», non ci rientra.

**Perché.** Il controllo esistente proteggeva codice, numero, cliente, data,
regime e importi — e si spegneva da solo alla prima riga, `if old.status =
'bozza' then return new`. Ma nessuno impediva di *portare* lo stato a «bozza».
Una fattura emessa poteva essere riaperta e, da lì, modificata o eliminata come
se non fosse mai esistita; le sue righe pure, perché il loro controllo legge lo
stato del documento padre.

Dall'interfaccia non era raggiungibile — l'azione di salvataggio filtra su
`status = 'bozza'` — ma la policy RLS permette la scrittura diretta sulla
tabella a chi ha i permessi contabili, e una chiamata all'API bastava. Una
protezione che vale solo finché si passa dal modulo non è una protezione: è una
convenzione.

**Conseguenza.** L'ho trovata cercando un modo di ricostruire la demo, che si
fermava proprio su questi controlli. La tentazione era usare quella strada
(riporta a bozza, cancella, rifai) e andare avanti. Usarla voleva dire
dipendere da un buco invece di chiuderlo. Chiuso il buco, il seed smette di
essere rieseguibile su un database dove ha gia' emesso fatture — e lo dice,
invece di fallire con un messaggio che parla d'altro. È il prezzo giusto:
l'integrità di un documento fiscale vale più della comodità di rifare una demo.

La regola aggiunta è volutamente minima — solo il ritorno in bozza. Le
transizioni in avanti restano libere, perché inventare qui una macchina a stati
completa vorrebbe dire decidere al posto di chi fa la contabilità.

---

## 88. La demo entra dalla porta principale

**Scelta.** L'agenzia dimostrativa vive in produzione accanto alle altre, con
un account di sola lettura le cui credenziali sono pubbliche, e un pulsante
sulla pagina di accesso che le usa. Nessuna modalità speciale, nessuna sessione
costruita a parte, nessuna scorciatoia che salti i controlli.

**Perché.** Una «modalità demo» scritta a parte è codice che non è il prodotto:
diverge, si rompe in silenzio, e il giorno in cui qualcuno la guarda non mostra
piu' quello che il gestionale fa davvero. Entrando dalla porta principale, la
demo è la prova che il prodotto funziona — e il ruolo di sola lettura che la
protegge è lo stesso che protegge le agenzie vere, già verificato dai suoi
test.

**Conseguenza.** Il seed, che finora girava solo sul banco di prova, ha dovuto
imparare due cose che su Supabase vero sono obbligatorie e in locale non si
notavano: le righe in `auth.identities`, senza le quali l'accesso con password
non funziona affatto, e i quattro campi di testo (`confirmation_token`,
`recovery_token`, `email_change`, `email_change_token_new`) che il servizio di
autenticazione legge come stringhe non nulle — a NULL, risponde «credenziali
errate» a credenziali giuste. Due trappole che costano un pomeriggio a chi non
le conosce.

Le credenziali stanno in due variabili con prefisso `NEXT_PUBLIC`, ed è
corretto: non sono un segreto, sono l'indirizzo di casa di un account che non
può scrivere. Dove non sono impostate il pulsante non compare — l'installazione
di un'agenzia vera non deve mostrare un invito a entrare in casa d'altri.

---

## 89. Il modello scaricabile deve tornare indietro

**Scelta.** Fra i nomi di colonna che l'importazione riconosce c'è sempre
l'etichetta del campo, e un test genera il modello di ogni entità, lo rilegge
con il nostro stesso lettore e lo valida con lo schema dell'entità.

**Perché.** Il modello è la prima cosa che un'agenzia tocca di questo gestionale:
lo scarica, lo compila, lo ricarica. Quattro campi su cinque entità non si
riconoscevano da sole — «Tipo di vendita», «Data di nascita», «Luogo di
nascita», «Giorni di pagamento»: l'intestazione stampata dal modello non era fra
gli alias, e la colonna veniva ignorata **in silenzio**. Nessun errore, nessuna
riga scartata: solo dati che non arrivano. Chi importa duemila clienti scopre
dopo un mese che non ha le date di nascita, e non ha modo di sapere perché.

**Conseguenza.** Le righe di esempio dei cinque modelli sono passate dalle
rotte `/<entità>/modello` a `IMPORT_DEFINITIONS`, così il file che consegniamo e
il file che rileggiamo nascono dalla stessa definizione e non possono divergere.
Il test ha trovato anche un IBAN di esempio con la cifra di controllo sbagliata
— e, da lì, nove IBAN su dieci sbagliati nel seed dimostrativo: dati che il
database accetta (non verifica il mod-97) e che il form rifiuta, cioè la demo
che si blocca appena qualcuno salva un fornitore. Da qui il test che verifica
IBAN e partite IVA del seed con gli stessi validatori dell'applicazione.

---

## 90. Le pratiche e i preventivi importati non portano il loro numero

**Scelta.** Una pratica o un preventivo che arriva da un altro gestionale prende
la numerazione di questo. Il numero di origine, per i preventivi, finisce nelle
note, dove la ricerca lo trova.

**Perché.** Non sono documenti fiscali: nessuno li deve ritrovare per numero,
e la numerazione di questo gestionale è progressiva per anno e senza buchi
perché è così che si legge un registro. Conservare numeri altrui vorrebbe dire
accettare buchi, doppioni e formati arbitrari in una sequenza che serve a
contare.

**Conseguenza.** Chi cerca «PREV-2026-114» lo trova comunque, perché la ricerca
dei preventivi guarda anche le note. Per le fatture la scelta è opposta, e per
una ragione precisa: lì il numero *è* il documento (decisione 91).

---

## 91. I documenti pregressi conservano numero e data, e non si ritrasmettono

**Scelta.** Le fatture già emesse dal gestionale precedente si importano con il
loro numero, il loro codice e la loro data di emissione. Il contatore della
numerazione viene portato avanti fino al numero più alto importato. Un documento
importato non può essere trasmesso allo SdI: il divieto sta sul database.

**Perché.** Tre cose, in ordine di costo.

Il numero. Una fattura *è* il suo numero: l'estratto conto del cliente, il
registro del commercialista e la nota di credito che la rettifica la citano per
numero. Rinumerarla significa che nessuno di quei tre documenti torna.

Il contatore. Se importo la 417 e il contatore è a 12, la prossima fattura
emessa qui prende la 13 — e prima o poi arriva a 417, dove il vincolo di
unicità la respinge. L'agenzia lo scopre il giorno in cui deve emettere, cioè
nel momento peggiore. `app.catch_up_document_counter` porta il contatore al
massimo fra il valore attuale e quello importato, e non lo arretra mai.

La trasmissione. Il documento era già stato trasmesso al Sistema di
Interscambio dal gestionale di prima. Rimandarlo deposita una seconda fattura
con lo stesso numero all'Agenzia delle Entrate, e si corregge con una
comunicazione di variazione — non con un messaggio di errore. Per questo il
divieto è un trigger (`app.invoices_guard_imported`) e non un controllo
nell'interfaccia: vale anche per una chiamata diretta all'API, che la policy RLS
consente a chi ha i permessi contabili. Lo stesso trigger impedisce di
cancellare la provenienza e di appiccicarla a un documento nato qui — che
sarebbe il modo più semplice di sottrarre una fattura vera alla trasmissione.

**Quello che non si fa.** I documenti importati **non** vengono esclusi dal
registro IVA. Un'agenzia che importa l'anno in corso vuole il registro
completo; una che ha già liquidato quei mesi importa solo i documenti aperti. È
una decisione di chi tiene la contabilità, non una regola da nascondere in una
vista — e il registro lo dice, con un avviso che conta quanti documenti
dell'anno arrivano da un gestionale precedente.

**Conseguenza.** Il tetto di righe per file scende a 300 per i soli documenti,
contro le 2000 delle altre entità: ogni documento è una chiamata a sé —
`import_legacy_invoice` apre la bozza, scrive le righe, numera e porta avanti il
contatore in una transazione — e trecento chiamate sono già il limite del tempo
massimo di una funzione serverless. Chi ha tre anni di fatturato li importa un
anno per volta.

---

## 92. Una riga del file è una riga del documento

**Scelta.** Nell'importazione dei documenti pregressi, più righe con lo stesso
tipo, anno e numero fanno un documento solo con tutte le sue voci. La prima riga
ne fissa la testata; una riga successiva che la contraddice — un altro cliente,
un'altra data — viene scartata da sola, senza far cadere il documento.

**Perché.** È la forma in cui i gestionali esportano il registro delle vendite,
ed è la sola che permetta di importare una fattura con il suo dettaglio invece
di un totale unico. Scartare la riga in conflitto e non il documento è la scelta
più prudente nella direzione giusta: una fattura con la riga di un altro cliente
attaccata sarebbe sbagliata e nessuno se ne accorgerebbe; una fattura con una
voce in meno si vede, perché il totale non torna.

**Conseguenza.** Il raggruppamento (`src/lib/import-fatture.ts`) è codice puro:
prende righe già validate e restituisce documenti e conflitti, senza toccare il
database. È l'unica parte di questa importazione che si può provare per intero
senza un database, quindi è dove sta la logica.

---

## 93. I primi passi si ricavano dai dati, non si memorizzano

**Scelta.** Il percorso guidato del primo giorno mostra sei passi e li spunta
contando i dati che ci sono: dati fiscali compilati, clienti, fornitori,
pratiche, documenti, persone. Sul database non resta traccia di quali passi
sono «fatti»: l'unica cosa salvata è il momento in cui l'agenzia ha chiuso il
riquadro.

**Perché.** Un elenco di passi completati salvato a parte diverge dalla realtà
al primo cliente cancellato, e mostra spuntato un passo che non lo è. Una
spunta che resta accesa quando il dato non c'è più è peggio di nessuna spunta:
dice il falso proprio nel momento in cui qualcuno la sta usando per capire
dove si trova. Contare costa cinque `count` con `head: true` dentro il confine
di sospensione che la panoramica ha già.

**Perché al titolare.** I passi portano alle impostazioni e all'importazione dei
documenti, due pagine che gli altri ruoli non possono aprire. Mostrare a un
operatore un percorso con quattro comandi su sei che finiscono in «pagina non
trovata» è peggio che non mostrarglielo.

**Conseguenza.** Lo stato sta su `agency_settings` e non sull'iscrizione della
singola persona: i primi passi riguardano la configurazione dell'agenzia, e il
secondo titolare che entra non deve rivedere un percorso già fatto. Nascondere
il riquadro non è una via senza ritorno — dalle impostazioni si riapre, perché
un comando che cancella per sempre una cosa utile senza chiedere niente è una
trappola. Le regole stanno in `src/lib/primi-passi.ts`, che è codice puro: quali
passi, in che ordine, quali facoltativi si provano senza database.

**Quello che non si fa.** Nessuna procedura guidata a schermo pieno che
impedisce di usare il gestionale finché non è finita, e nessun dato di esempio
caricato di nascosto. Chi entra deve poter andare dove vuole; il riquadro
suggerisce, e sparisce da solo quando non ha più niente da dire.

---

## 94. Le funzioni girano accanto al database, non accanto a Vercel

**Scelta.** Le funzioni serverless girano in `dub1` (Dublino), la stessa regione
AWS — `eu-west-1` — in cui sta il progetto Supabase. La regione autorevole è
quella impostata sul progetto Vercel, che `scripts/deploy-vercel.mjs` allinea a
ogni pubblicazione; `preferredRegion` nel layout radice la dichiara anche nel
repository.

**Perché.** Il gestionale era lento, e l'istinto diceva «ottimizza le query». La
misura diceva un'altra cosa. `EXPLAIN ANALYZE` sui tre elenchi più pesanti e
sulle tre funzioni della panoramica, sul database di produzione:

| Interrogazione | Esecuzione |
| --- | --- |
| elenco pratiche (25 righe) | 3,9 ms |
| elenco clienti (25 righe) | 4,7 ms |
| elenco fatture (25 righe) | 1,7 ms |
| `dashboard_kpis` su 12 mesi | 1,7 ms |
| `monthly_trend` | 0,8 ms |
| `upcoming_departures` | 0,7 ms |

Il database risponde in millisecondi. Le pagine autenticate, intanto, avevano un
TTFB fra 750 e 1500 ms. La differenza non era calcolo: era geografia. Le funzioni
giravano in `iad1` — Washington, il valore predefinito di Vercel — e il database
sta in Irlanda. Ogni andata e ritorno costava circa 85 ms, e una pagina resa dal
server ne fa diverse in fila: l'autenticazione, l'iscrizione, poi agenzia e
parametri, poi i dati. A questo si sommava la strada del browser, perché chi usa
il gestionale dall'Italia raggiungeva Washington e non Dublino.

Misurato dopo lo spostamento, dallo stesso punto di osservazione:

| Pagina | `iad1` | `dub1` |
| --- | --- | --- |
| Panoramica | 1424 ms | 698 ms |
| Pratiche | 1494 ms | 503 ms |
| Scadenzario | 1002 ms | 456 ms |
| Clienti | 1002 ms | 521 ms |
| Report | 914 ms | 424 ms |
| Agenda | 966 ms | 421 ms |

Da un punto di osservazione italiano il guadagno è maggiore di così: la misura
qui sopra è presa attraverso un proxy americano, che dopo lo spostamento paga
*più* strada per raggiungere la funzione, non meno.

**Quello che non si è fatto, e perché.** Nessuna query riscritta, nessun indice
aggiunto: non c'era niente da correggere, e cambiare codice che funziona per un
problema che sta altrove avrebbe aggiunto rischio senza togliere millisecondi.

Niente cache dei dati lato client (`experimental.staleTimes`): il ritorno
all'elenco da una scheda è stato misurato fra 130 e 155 ms, già servito dalla
cronologia del browser senza toccare il server. Accenderla avrebbe barattato un
guadagno inesistente con il rischio di mostrare uno scadenzario vecchio di
secondi a chi registra un incasso mentre un collega registra lo stesso.

Il middleware resta com'è: valida la sessione contro il server di
autenticazione a ogni richiesta, e dal bordo di rete più vicino all'utente costa
una trentina di millisecondi. È una proprietà di sicurezza scelta e documentata
(il token non si crede sulla parola), e trenta millisecondi su una pagina ora
veloce sono un prezzo proporzionato. Chi volesse togliere anche quelli deve
passare alle chiavi asimmetriche di Supabase e verificare la firma in locale:
è un cambio all'autenticazione di un sistema in produzione, non
un'ottimizzazione.
