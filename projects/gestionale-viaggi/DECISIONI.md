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

## 57. Scelte rinviate, con motivo

| Argomento | Rinviata a | Perché |
| --- | --- | --- |
| Generazione PDF | — | Risolta in fase 5: `@react-pdf/renderer`, che compone il documento come l'interfaccia e non richiede un browser sul server |
| Email transazionali (Resend) | Fase 8 | Servono i modelli, che dipendono dai moduli precedenti |
| TanStack Query | — | Lo scadenzario si è rivelato una griglia come le altre: stato nell'indirizzo, dati dal server. Una libreria di stato client non avrebbe nulla da gestire |
| Realtime | Fase 8 | Ha senso con le notifiche, non da solo |
| Esportazione XLSX | Fase 9 | Il CSV si apre in Excel italiano senza passaggi: una libreria in più va giustificata da un bisogno vero |
| Fatturazione elettronica (XML SdI) | Dopo la fase 9 | Il tracciato FatturaPA e l'invio al Sistema di Interscambio sono un modulo a sé: servono l'accreditamento, la firma e un canale. Lo schema dei documenti è già quello giusto per generarlo |
