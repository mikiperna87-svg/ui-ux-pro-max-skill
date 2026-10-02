# Gestionale Viaggi

Gestionale per agenzie di viaggio italiane (dettaglio e organizzatore): pratiche,
preventivi, incassi, scadenze fornitore, fatturazione in regime ordinario e
art. 74-ter.

Il cuore dell'applicazione è la **pratica di viaggio**: un contenitore che lega
cliente, passeggeri, servizi acquistati, costi fornitore, ricavi, incassi,
documenti e scadenze. Tutto il resto ruota attorno a questa entità.

> **Stato: fasi 1-7 di 9 completate** (fondamenta, anagrafiche, pratiche, incassi
> e scadenze, preventivi, amministrazione, report).
> Le sezioni consegnate sono autenticazione, ruoli, panoramica, impostazioni,
> clienti, passeggeri, fornitori, **pratiche di viaggio**, **preventivi** con
> pagina pubblica di accettazione, **fatturazione** con regime art. 74-ter e
> registro IVA e i **report** per operatore, destinazione e fornitore.
> La roadmap completa
> è in fondo a questo file; il registro delle scelte tecniche è in
> [DECISIONI.md](./DECISIONI.md), la guida per il personale in
> [MANUALE.md](./MANUALE.md).

---

## Che cosa fa (oggi)

| Sezione | Contenuto |
| --- | --- |
| **Accesso** | Password o link via email, recupero password, uscita da tutti i dispositivi, limitazione dei tentativi |
| **Panoramica** | Venduto, margine, da incassare, da pagare ai fornitori, ciascuno confrontato con lo stesso periodo di un anno fa · andamento mensile · partenze imminenti · scadenze fornitore · registro attività |
| **Impostazioni** | Dati fiscali dell'agenzia, utenti e ruoli, parametri delle scadenze, numerazioni, visibilità dei margini |
| **Pratiche** | Il cuore del gestionale: elenco con ricerca (anche per cognome del cliente), filtri per stato, pagamento, periodo, tipo di vendita e operatore, viste salvate, esportazione · scheda a sei schede con barra laterale sempre visibile di venduto, costi, commissioni, margine, incassato e residuo · righe di servizio con IVA di riga in chiaro (compreso l'art. 74-ter) · conferma che genera acconto, saldo e controllo documenti · annullamento con motivo e penale · documenti allegati in deposito privato |
| **Incassi e scadenze** | Registrazione degli incassi con attribuzione automatica alle scadenze in ordine di data, storno con motivo, piano rateale modificabile riga per riga · pagamenti ai fornitori generati dalle righe di servizio e segnabili come pagati anche in blocco · **scadenzario** con due elenchi (da incassare, da pagare), totali, filtri sul ritardo, ricerca ed esportazione filtrata |
| **Preventivi** | Fino a tre proposte a confronto (Essenziale, Consigliata, Premium) sullo stesso viaggio, copiabili l'una dall'altra con un ritocco percentuale sui prezzi · elenco con ricerca, filtri per stato, validità, operatore e cliente, viste salvate ed esportazione · **PDF A4** con l'intestazione dell'agenzia · **collegamento pubblico** che il cliente apre senza account per accettare una proposta o rifiutare · conversione in pratica in un clic, con le voci che diventano righe di servizio |
| **Fatture** | Fatture e note di credito con numerazione annuale **assegnata all'emissione**, così una bozza scartata non lascia buchi · regime **art. 74-ter** con l'IVA scorporata dal margine e il calcolo sempre in chiaro, riga per riga · un documento emesso non si modifica e non si elimina: si corregge con una nota di credito · PDF A4 con intestazione, dati del cliente e riepilogo per aliquota · fattura aperta dalla pratica in un clic, servizi o provvigione secondo il tipo di vendita |
| **Registro IVA** | Imponibile, imposta e margine per mese, regime e aliquota, con le note di credito già in negativo · esportazione per il commercialista |
| **Report** | Periodo a scelta (mese, trimestre, anno, ultimi 12 mesi, anno scorso o due date qualsiasi) con il confronto sul periodo precedente di pari durata · **per operatore**: pratiche, passeggeri, venduto, ticket medio, margine, incassato, residuo, annullate, più preventivi creati, inviati, accettati e tasso di conversione · **per destinazione**: quota sul venduto, passeggeri, clienti, ticket medio e margine, con le grafie diverse della stessa meta riunite · **per fornitore**: acquistato, venduto attribuito, commissioni, margine generato e residuo da pagare · esportazione CSV della vista e del periodo |
| **Agenda** | Un elenco solo per cinque cose che fanno suonare il telefono: attività, rate da incassare, pagamenti ai fornitori, partenze e documenti dei passeggeri in scadenza · finestra a scelta (oggi, 7 giorni, 30 giorni) con gli arretrati degli ultimi 60 giorni sempre in cima · filtro per tipo e per "solo le mie" · attività create, assegnate, modificate e chiuse dall'agenda o dalla pratica |
| **Posta** | Coda vera sul database: ogni messaggio è una riga con destinatario, oggetto, corpo in HTML e in testo, tentativi ed esito · invio del preventivo e della fattura al cliente (con il PDF in allegato) e sollecito di una rata · nome del mittente, indirizzo di risposta e firma dell'agenzia · prova di invio, rinvio di ciò che è in errore, annullamento di ciò che è in coda |
| **Clienti** | Elenco con ricerca insensibile ad accenti e maiuscole, filtri, ordinamento, colonne configurabili, selezione multipla, esportazione CSV e importazione guidata · scheda con valore generato, margine, viaggi, passeggeri, consensi e cronologia · esportazione e anonimizzazione GDPR |
| **Passeggeri** | Anagrafica separata dai clienti, con documento di viaggio, scadenze e filtro su chi non è in regola |
| **Fornitori** | Tipo, condizioni di pagamento, commissione predefinita, regime IVA, IBAN · acquistato, margine generato, da pagare e prossima scadenza · disattivazione senza perdita dello storico |
| **Primo giorno** | Percorso guidato in panoramica con sei passi, ognuno con il motivo e il comando che lo esegue · le spunte si ricavano dai dati, non sono memorizzate · sparisce quando non ha più niente da dire, e si nasconde o si riapre dalle impostazioni |
| **Trasloco da un altro gestionale** | Importazione guidata da CSV di clienti, passeggeri, fornitori, pratiche, preventivi e **documenti pregressi** · modello scaricabile per ciascuna entità, con righe di esempio · le intestazioni si riconoscono da sole, anche quelle di un altro programma · anteprima riga per riga prima di confermare · le fatture già emesse conservano numero e data, e non vengono ritrasmesse allo SdI |

Il database contiene l'intero modello dati (incassi, piani rateali, fatture,
documenti, attività, posta in uscita, audit) con le relative policy di
sicurezza: ogni tabella ha `agency_id`, e nessuna query può ignorarlo.

## Stack

- **Next.js 15** (App Router, React Server Components, Server Actions) + TypeScript strict
- **Supabase**: Postgres, Auth, Row Level Security, Storage
- **Tailwind CSS v4** con design token in `src/app/globals.css` + primitive Radix personalizzate
- **Zod** per la validazione condivisa, **date-fns** con locale italiano
- **Vitest** + Testing Library per unità e componenti, **Playwright** per i percorsi end-to-end
- **axe-core** dentro Playwright: l'accessibilità è un test che gira, non una buona intenzione

---

## Installazione

### Prerequisiti

- Node.js 20.9 o successivo
- Un progetto Supabase (gratuito) oppure un Postgres 15+ locale

### 1. Dipendenze

```bash
npm install
cp .env.example .env.local
```

### 2. Configurazione di Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. Da **Project Settings → API** copia in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (resta sul server: consente di scavalcare la RLS)
3. Da **Project Settings → Database** copia la stringa di connessione in `DATABASE_URL`.
4. Applica le migrazioni e i dati dimostrativi:

   ```bash
   DATABASE_URL="postgresql://..." npm run db:apply -- --seed
   ```

   Le migrazioni sono in `supabase/migrations/`, numerate e rieseguibili da zero.
   Con la CLI ufficiale di Supabase l'equivalente è `supabase db push`.

5. In **Authentication → URL Configuration** imposta come *Site URL* l'indirizzo
   dell'applicazione e aggiungi `<indirizzo>/auth/callback` fra i *Redirect URLs*:
   è il ritorno dei link inviati per email.
6. In **Storage** il bucket privato `documenti` viene creato dalla migrazione
   `0006`; non renderlo pubblico, i file si servono con URL firmati a scadenza.

### 2-bis. Posta in uscita (facoltativa)

L'applicazione funziona per intero senza fornitore di posta: i messaggi vengono
composti, registrati e mostrati, e restano in coda finché non c'è un canale per
spedirli. Per attivare l'invio vero servono due variabili d'ambiente **sul
server**:

```bash
RESEND_API_KEY="re_..."                        # chiave da resend.com
EMAIL_MITTENTE="Orizzonti Viaggi <info@tuodominio.it>"
```

Il dominio del mittente va verificato presso il fornitore, altrimenti i
messaggi partono e finiscono nello spam. La chiave non si inserisce
dall'interfaccia e non finisce sul database (DECISIONI 58): il pannello
**Impostazioni → Posta** dice soltanto se c'è, e con quale mittente.

### 3. Avvio

```bash
npm run dev          # http://localhost:3000
```

Con il seed applicato si entra con:

| Ruolo | Email | Password |
| --- | --- | --- |
| Titolare | `titolare@orizzontiviaggi.it` | `Gestionale2026!` |
| Amministrativo | `amministrativo@orizzontiviaggi.it` | `Gestionale2026!` |
| Operatore | `operatore@orizzontiviaggi.it` | `Gestionale2026!` |

---

## Sviluppo senza Supabase

Per lavorare offline (o dove Docker non è disponibile) il progetto include un
**banco di prova**: un Postgres locale con le migrazioni reali e un piccolo
servizio che espone la stessa superficie HTTP di Supabase.

```bash
# 1. Postgres locale (una volta sola)
initdb -D .postgres && pg_ctl -D .postgres -o "-p 54329" start

# 2. Postgres + banco di prova, se sono spenti
npm run dev:stack

# 3. Migrazioni + seed su quel database
npm run db:reset

# 4. Applicazione, con .env.local che punta a 127.0.0.1:54321
npm run dev
```

Il banco di prova (`supabase/testing/local-api.mjs`) **non fa parte del
prodotto** e non viene distribuito: serve a sviluppare e a eseguire i test.
Esegue ogni richiesta con `set local role authenticated` e i claim JWT sulla
connessione, esattamente come PostgREST, quindi le policy RLS che si
attraversano sono quelle vere. Espone anche lo storage dei documenti, con la
stessa regola di accesso della produzione: la prima cartella del percorso è
l'agenzia.

Due variabili lo governano quando serve: `LOCAL_API_POOL` (connessioni al
database, 60 di default) e `LOCAL_API_LOG=1` (traccia ogni richiesta con la sua
durata, utile quando un test si blocca).

---

## Comandi

| Comando | Effetto |
| --- | --- |
| `npm run dev` | Server di sviluppo |
| `npm run build` | Build di produzione (fallisce su errori di tipo o di lint) |
| `npm run verifica` | lint + type-check + test + build, in sequenza |
| `npm run test` | Unità, componenti, RLS e regole economiche (Vitest) |
| `npm run test:e2e` | Percorsi end-to-end (Playwright, desktop e mobile) |
| `npm run db:apply` | Applica le migrazioni (`-- --seed` per i dati dimostrativi) |
| `npm run db:reset` | Ricrea da zero il database locale con migrazioni e seed |
| `npm run db:types` | Rigenera `src/lib/database.types.ts` dallo schema |
| `npm run db:query:api` | Interroga un progetto ospitato (`-- --ref <ref> --sql "..."`); serve `--scrivi` per tutto ciò che non è una lettura |
| `npm run dev:api` | Banco di prova Supabase per lo sviluppo locale |
| `npm run dev:stack` | Accende Postgres e il banco di prova se sono spenti |
| `npm run start:e2e` | Server di produzione con i limiti di accesso alzati |

Dopo ogni migrazione va rigenerato il file dei tipi: così un campo rinominato
rompe la compilazione invece della produzione.

La suite end-to-end comprende `tests/e2e/accessibilita.spec.ts`, che passa
axe-core su ogni pagina nei due temi e alle due larghezze, e
`tests/e2e/telefono.spec.ts`, che verifica a 390 px che nessuna pagina si legga
scorrendo di lato. Sono test permanenti: una regressione di accessibilità o di
impaginazione non si vede finché qualcuno non la segnala, ed è troppo tardi.

`npm run test:e2e` accende da sé il server con i limiti giusti. Se invece si
punta la suite a un server già acceso (`E2E_BASE_URL=...`), quel server va
avviato con `npm run start:e2e`: centoquaranta test che entrano con le stesse
tre email dallo stesso indirizzo superano di slancio il limite di otto accessi
ogni cinque minuti, e i fallimenti raccontano il limitatore invece del
prodotto.

---

## Struttura

```
src/
├── app/
│   ├── (auth)/              accesso, registrazione, recupero password
│   ├── (app)/               applicazione autenticata (shell + pagine)
│   ├── auth/callback/       ritorno dai link inviati per email
│   └── globals.css          design system: token, tipografia, temi
├── components/
│   ├── ui/                  primitive (bottoni, campi, tabelle, dialoghi, toast)
│   ├── layout/              shell, barra laterale, tavolozza dei comandi
│   ├── data-table/          griglia, filtri, paginazione, importazione CSV
│   ├── forms/               messaggi, invio, avviso sulle modifiche non salvate
│   ├── domain/              componenti che conoscono il dominio (badge di stato)
│   └── dashboard/           indicatori, variazioni e grafico di panoramica e report
├── lib/                     denaro, date, ruoli, etichette, validazione, tipi del database
├── server/                  sessione, query, Server Action, limitazione richieste
│   ├── email/               modelli dei messaggi, coda, adattatore del fornitore
│   └── pdf/                 documenti A4 (preventivo, fattura) e caratteri
└── middleware.ts            rinnovo sessione e protezione delle rotte

supabase/
├── migrations/              schema, logica, RLS, funzioni di lettura
├── seed.sql                 agenzia dimostrativa completa
└── testing/                 banco di prova locale (non distribuito)

tests/
├── unit/                    denaro, date, componenti
├── db/                      RLS multi-agenzia e regole economiche su Postgres reale
└── e2e/                     percorsi completi con Playwright
```

---

## Regole non negoziabili del codice

1. **Gli importi sono interi di centesimi.** Ogni calcolo passa da `src/lib/money.ts`,
   che usa BigInt: in questo progetto `0,1 + 0,2` non può diventare `0,30000000000000004`.
2. **Le date sono UTC sul database e Europe/Rome in interfaccia** (`src/lib/date.ts`).
3. **Nessuna query senza `agency_id`.** Lo garantisce la Row Level Security, non la
   buona volontà di chi scrive la query.
4. **Il colore non è mai l'unico portatore di significato**: ogni stato ha anche un testo.
5. **Nessun valore esadecimale o pixel sparso nei componenti**: solo token del design system.
   Le tre eccezioni sono dichiarate e inevitabili: i PDF (`@react-pdf` non legge le
   variabili CSS), il colore della barra del browser (`metadata.themeColor` vuole un
   valore letterale) e `global-error.tsx`, che sostituisce l'intero documento proprio
   quando il foglio di stile potrebbe non essere arrivato.
6. **Ogni misura di testo aggiunta al design system va dichiarata in `src/lib/utils.ts`**:
   altrimenti `cn()` la scambia per un colore e cancella quello vero (DECISIONI 63).
7. **Un'etichetta che sparisce sul telefono usa `EtichettaBottone`, mai `hidden`**:
   `display: none` la toglie anche a chi usa un lettore di schermo (DECISIONI 65).

---

## Distribuzione su Vercel

Il gestionale è in linea su **https://gestionale-viaggi-nu.vercel.app**, con il
database sul progetto Supabase `wwaaswzcalwfsuceiydn` (regione `eu-west-1`).

La pubblicazione **non** passa dall'integrazione GitHub: i file vengono caricati
direttamente, perché quell'account non ha l'applicazione GitHub installata e
installarla avrebbe dato a un servizio terzo la lettura dell'intero repository
(DECISIONI 72). Conseguenza pratica: `git push` non pubblica niente. Il rilascio
è sempre un comando.

### La prima volta

1. Crea il progetto Supabase e applica le migrazioni. Se la porta 5432 non è
   raggiungibile — capita spesso — si passa dalla Management API:

   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply:api -- --ref <project-ref>
   ```

   Con il database raggiungibile in TCP vale ancora `DATABASE_URL="postgresql://..." npm run db:apply`.
   I due comandi condividono il registro `public.schema_migrations`, quindi si
   alternano senza riapplicare nulla.

2. Crea il progetto Vercel e inserisci le variabili di `.env.example`, senza
   `DATABASE_URL` che serve solo agli script:

   | Variabile | Tipo su Vercel |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | normale |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | normale — finisce comunque nel browser |
   | `SUPABASE_SERVICE_ROLE_KEY` | **sensibile**: scavalca la RLS, non deve essere rileggibile |
   | `NEXT_PUBLIC_SITE_URL` | normale, l'indirizzo definitivo |

   | `CODICE_REGISTRAZIONE` | normale — il codice di invito senza cui non si aprono nuove agenzie |

   `RESEND_API_KEY` ed `EMAIL_MITTENTE` solo quando la posta è configurata, e la
   prima è sensibile.

3. Su Supabase, Authentication → URL Configuration: *Site URL* sull'indirizzo
   definitivo, e fra i *Redirect URLs* almeno `https://<indirizzo>/auth/callback`.

4. Sempre su Supabase, Authentication → Providers: la lunghezza minima della
   password va portata a **10** con minuscole, maiuscole e cifre obbligatorie,
   o il database accetterebbe password che il modulo rifiuta.

5. Pubblica:

   ```bash
   VERCEL_TOKEN=... VERCEL_TEAM_ID=team_... npm run deploy
   ```

### A ogni versione

```bash
npm run verifica                                    # lint, typecheck, test, build
SUPABASE_ACCESS_TOKEN=... npm run db:apply:api -- --ref <ref>   # solo le migrazioni nuove
VERCEL_TOKEN=... npm run deploy
```

Lo stato della pubblicazione si legge con
`node scripts/deploy-vercel.mjs --stato <id>`: passa da `BUILDING` a `READY`, e
l'indirizzo di produzione cambia solo al primo rilascio.

**La regione conta più di qualunque indice.** Le funzioni girano in `dub1`
(Dublino), la stessa regione AWS del progetto Supabase: `deploy-vercel.mjs` la
imposta alla creazione e la corregge se il progetto sta altrove. Con il valore
predefinito di Vercel — `iad1`, Washington — ogni andata e ritorno al database
costava circa 85 ms contro i 2-5 ms che il database impiega a rispondere, e il
TTFB delle pagine era doppio o triplo (misure in DECISIONI 94). Se un giorno il
database si sposta, si sposta anche questa: `--regione <id>`.

**L'ordine conta**: prima le migrazioni, poi la pubblicazione. Il codice è
scritto per non sbagliare se l'ordine si invertisse — le colonne nuove che non
arrivano dal database vengono lette con un ripiego invece di cambiare
comportamento in silenzio — ma una funzione nuova resta inerte finché la sua
migrazione non è passata.

Per guardare che cosa c'è davvero sul database dopo un rilascio:

```bash
SUPABASE_ACCESS_TOKEN=... npm run db:query:api -- --ref <ref> \
  --sql "select version from public.schema_migrations order by version desc limit 3"
```

Il comando rifiuta tutto ciò che non è una lettura se non si aggiunge
`--scrivi`: una query sbagliata su produzione non si annulla.

### Da sistemare prima di aprire al pubblico

| Cosa | Dove | Perché |
| --- | --- | --- |
| Conferma dell'email spenta | Supabase → Authentication → Providers, `mailer_autoconfirm` | Senza un fornitore di posta la conferma bloccherebbe la registrazione a metà (DECISIONI 74) |
| ~~Registrazione aperta a chiunque~~ | risolto | Chiusa da `CODICE_REGISTRAZIONE`: senza il codice di invito non si apre nessuna agenzia (DECISIONI 76). Si cambia riscrivendo la variabile su Vercel e ripubblicando |
| Posta in coda | `RESEND_API_KEY`, `EMAIL_MITTENTE` | Senza chiave i messaggi si compongono e restano in attesa: nulla si perde, nulla parte |
| ~~Due agenzie di prova~~ | risolto | Marcate cancellate. Dalla 0017 `agencies.deleted_at` vale davvero: la RLS le toglie da ogni query e i loro account non entrano più (DECISIONI 77) |
| Supabase è sul piano gratuito | Supabase → Billing | Un progetto gratuito viene **messo in pausa dopo sette giorni senza attività**: il gestionale smette di rispondere finché qualcuno non lo riattiva. Per un'agenzia che ci lavora davvero è il primo costo da mettere in conto |
| Vercel è sul piano Hobby | Vercel → Settings → Billing | Il piano Hobby è riservato a usi non commerciali dalle condizioni di Vercel. Un'agenzia che fattura con questo gestionale ha bisogno del piano Pro |

### Prima di dire che è finita

| Controllo | Come |
| --- | --- |
| Migrazioni allineate | `npm run db:apply` non applica nulla di nuovo |
| Tipi allineati | `npm run db:types` non produce differenze |
| Suite completa verde | `npm run verifica` e `npm run test:e2e` |
| Accessibilità | `npx playwright test tests/e2e/accessibilita.spec.ts` |
| Telefono | `npx playwright test tests/e2e/telefono.spec.ts` |
| Account senza agenzia | `npx playwright test tests/e2e/senza-agenzia.spec.ts` — chi è invitato o resta senza agenzia deve trovare il modulo, non una pagina bianca |
| Fattura elettronica | `npx playwright test tests/e2e/fattura-elettronica.spec.ts` — il totale del file XML deve coincidere al centesimo con quello della fattura |
| Formule IVA allineate | `npx vitest run tests/db/sdi-formule.test.ts` — lo scorporo in TypeScript e quello in SQL devono dare lo stesso numero |
| Copia di sicurezza ripristinabile | `npm run db:verifica-backup -- --sono-sicuro` sul banco locale: copia, azzera, rimette, confronta |
| Isolamento dal pannello di piattaforma | `npx vitest run tests/db/piattaforma.test.ts` — l'amministratore deve contare zero clienti, zero pratiche, zero fatture |
| Limiti e scadenza degli abbonamenti | `npx vitest run tests/db/abbonamenti.test.ts` |
| Webhook degli abbonamenti | `npx playwright test tests/e2e/abbonamenti.spec.ts` — quattro firme non valide devono ricevere 401 |
| Documento emesso immutabile | `npx vitest run tests/db/fattura-immutabile.test.ts` — non deve tornare in bozza nemmeno da SQL |
| Demo in sola lettura | `npx playwright test tests/e2e/demo.spec.ts` |
| Documenti pregressi | `npx vitest run tests/db/documenti-pregressi.test.ts` — un documento importato non deve lasciarsi ritrasmettere allo SdI, e il contatore deve arrivare al numero importato |
| Modelli reimportabili | `npx vitest run tests/unit/import-modelli.test.ts` — il file che consegniamo deve superare la nostra stessa validazione |
| Dati dimostrativi validi | `npx vitest run tests/unit/dati-dimostrativi.test.ts` — IBAN e partite IVA del seed devono passare i validatori dell'applicazione |
| Trasloco completo | `npx playwright test tests/e2e/importazioni.spec.ts` |
| Risposta al clic | `npx playwright test tests/e2e/risposta-al-clic.spec.ts` — la riga cliccata e la barra in cima devono comparire subito, e spegnersi all'arrivo |
| Il primo giorno | `npx playwright test tests/e2e/primi-passi.spec.ts` — il percorso guidato deve comparire a un'agenzia nuova, spuntarsi da solo e non avere violazioni axe nei due temi |
| Bucket privato | `documenti` non è pubblico su Supabase Storage |
| Chiavi al loro posto | `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` solo sul server |
| Posta verificata | il dominio del mittente è verificato presso il fornitore |
| Intestazioni | la risposta porta `Content-Security-Policy` e, in HTTPS, `Strict-Transport-Security` |

---

## Demo pubblica

L'installazione dimostrativa mostra, sulla pagina di accesso, un pulsante
**Entra nella demo**: un clic e si è dentro l'agenzia «Orizzonti Viaggi», con
sessanta pratiche, preventivi, incassi, fatture e registro IVA. L'account è di
**sola lettura** — lo stesso ruolo che protegge le agenzie vere, con i suoi
test.

Si accende con due variabili, che non sono un segreto:

```
NEXT_PUBLIC_DEMO_EMAIL=revisore@orizzontiviaggi.it
NEXT_PUBLIC_DEMO_PASSWORD=...
```

Dove non ci sono, il pulsante non compare: l'installazione di un'agenzia vera
non deve invitare a entrare in casa d'altri.

I dati arrivano da `supabase/seed.sql`, che si applica a un database nuovo:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:apply:api -- --ref <ref> --seed
```

**Non è rieseguibile** su un database dove la demo ha già emesso fatture: un
documento emesso non si cancella e non torna in bozza, per costruzione
(DECISIONI 87). Il seed se ne accorge e lo dice. Per rifare la demo si azzera
il database, oppure si usa una seconda agenzia dimostrativa.

---

## Abbonamenti

Tre piani sono già a schema — **Prova**, **Base** (3 utenti, 500 pratiche
all'anno), **Completo** (senza limiti) — con il prezzo da impostare: è una
decisione commerciale, e un prezzo inventato nel codice sembra una scelta
(DECISIONI 85).

L'abbonamento si assegna dal pannello **Piattaforma**. L'agenzia lo vede in
**Impostazioni → Abbonamento**, in sola lettura.

Uno stato **scaduto** o **annullato**, o una data già passata, mettono
l'agenzia in sola lettura: continua a consultare ed esportare, non a
registrare. I limiti di piano sono due trigger sul database, quindi valgono
per chiunque scriva, comunque scriva — anche da uno script.

### Il webhook del fornitore di pagamenti

```
POST /api/abbonamenti/webhook
x-firma: t=<epoca unix>,v1=<hmac-sha256 esadecimale>
content-type: application/json

{ "agency_id": "<uuid>", "plan_code": "completo",
  "status": "attivo", "valid_until": "2027-12-31" }
```

L'HMAC si calcola su `<epoca>.<corpo grezzo>` con
`WEBHOOK_ABBONAMENTI_SECRET`. Richieste più vecchie di cinque minuti vengono
rifiutate, perché senza quel controllo una richiesta firmata intercettata una
volta varrebbe per sempre. **Senza la variabile l'endpoint rifiuta tutto**: un
endpoint che regala mesi di servizio non deve restare aperto per distrazione.

L'endpoint non parla con nessun fornitore in particolare: l'adattatore che
traduce gli eventi di quello scelto in questo corpo si scrive quando il
fornitore è scelto (DECISIONI 86).

---

## Amministrazione della piattaforma

Chi vende il gestionale a più agenzie ha una sezione **Piattaforma**: elenco
delle agenzie con i loro numeri, chi è il titolare, sospensione e
riattivazione. Il pannello mostra **quante righe** ha ogni agenzia, non che
cosa contengono — nessuna policy dà accesso a clienti, pratiche o fatture
altrui, e due test lo verificano contando zero (DECISIONI 83).

Amministratore non si diventa dall'applicazione. La riga si inserisce da SQL:

```sql
insert into public.platform_admins (user_id, note)
select id, 'titolare della piattaforma' from auth.users where email = 'tu@esempio.it';
```

**Sospendere** ferma la scrittura, non la lettura: l'agenzia continua a
consultare ed esportare i propri dati, e vede in cima a ogni pagina una
striscia con il motivo. Il motivo è obbligatorio e finisce anche nel suo
registro attività (DECISIONI 84).

---

## Copie di sicurezza

```bash
# Dal progetto ospitato, in HTTPS
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:backup -- --ref <project-ref>

# Oppure per connessione diretta
npm run db:backup -- --url postgresql://...
```

Il file contiene **solo i dati**: lo schema vive nelle migrazioni, che stanno
in git (DECISIONI 81). Ripristinare vuol dire database vuoto, `npm run
db:apply`, poi il file.

Il file contiene anche `auth.users`, cioè le impronte delle password — senza,
dopo un ripristino nessuno riesce più ad accedere. **Trattalo come una
credenziale**: la cartella `backup/` è in `.gitignore` apposta. Con
`--senza-utenti` si esclude, sapendo a che cosa si rinuncia.

Una copia mai ripristinata non è una copia. La prova si fa sul banco locale:

```bash
npm run db:verifica-backup -- --sono-sicuro
```

Prende una copia, svuota il database, lo ricostruisce e confronta tabella per
tabella. Rifiuta di girare su un indirizzo non locale.

---

## Fattura elettronica

Il gestionale produce il file XML **FatturaPA 1.2** e lo verifica prima di
produrlo. Non lo trasmette: la trasmissione passa da un intermediario, e
l'esito si registra dal pannello sulla scheda della fattura (DECISIONI 79).

Il percorso, dalla scheda di una fattura emessa:

1. Il pannello **Fattura elettronica** dice se il documento è pronto. Se non lo
   è, elenca che cosa manca e dove si corregge.
2. **Prepara il file** assegna il progressivo di invio — un contatore per
   agenzia, in base 36 — e fissa il nome, `IT<partitaIVA>_<progressivo>.xml`.
   Il progressivo si assegna una volta sola: due file con lo stesso nome dallo
   stesso trasmittente vengono rifiutati da SdI.
3. **Scarica XML** dà il file da consegnare all'intermediario. Riscaricarlo dà
   sempre lo stesso file.
4. **Registra l'esito** annota che cosa ha risposto SdI: consegnata, non
   consegnata, scartata.

Prima di emettere la prima fattura vanno compilati, in **Impostazioni →
Agenzia**: partita IVA, regime fiscale, sede completa di CAP e provincia, e —
se si dichiara il REA — ufficio e numero insieme. Sul cliente servono
l'identificativo fiscale e l'indirizzo; il codice destinatario o la PEC sono
facoltativi, ma senza nessuno dei due la fattura resta solo nel cassetto
fiscale del cliente.

| Regime IVA della riga | Nel file |
| --- | --- |
| Ordinaria | Aliquota esposta, IVA scorporata dal prezzo |
| 74-ter | Aliquota 0, Natura **N5**, corrispettivo intero, nessuna imposta esposta |
| Esente art. 10 | Aliquota 0, Natura **N4** |
| Fuori campo | Aliquota 0, Natura **N2.2** |
| Inversione contabile | Aliquota 0, Natura **N6.9**, modificabile riga per riga |

---

## Il primo giorno

Un gestionale vuoto non si giudica dalle funzioni che ha: si giudica da quanto
ci vuole a far succedere la prima cosa utile. Un'agenzia appena registrata trova
in panoramica il riquadro **Primi passi**, con sei passi in ordine, il motivo di
ciascuno e il comando che lo esegue:

1. **Completa i dati dell'agenzia** — partita IVA, sede e provincia finiscono su
   ogni documento: senza, la fattura non si emette.
2. **Porta i clienti** — vengono prima di tutto il resto, perché pratiche,
   preventivi e fatture li citano per nome.
3. **Porta i fornitori** — condizioni di pagamento e commissione predefinita
   fanno il resto da sole.
4. **Porta le pratiche aperte** — da lì nascono scadenze, incassi e partenze.
5. **Porta i documenti pregressi** (facoltativo).
6. **Invita chi lavora con te** (facoltativo).

Le spunte non sono memorizzate: si ricavano contando i dati che ci sono, quindi
non possono mentire (DECISIONI 93). Il riquadro sparisce da solo quando tutti i
passi sono fatti, lo vede solo il titolare — gli altri ruoli non possono aprire
le pagine che i passi indicano — e si può nascondere prima, ritrovandolo in
**Impostazioni → Parametri**.

Gli elenchi vuoti dicono la stessa cosa nel punto in cui serve: clienti,
pratiche, preventivi e fatture offrono, accanto al comando per creare il primo,
quello per importare quello che c'è già.

---

## Trasloco da un altro gestionale

Un'agenzia non lascia il suo gestionale se non può portarsi dietro il lavoro.
Sei entità si importano da CSV, ognuna dalla propria pagina:

| Entità | Pagina | Modello |
| --- | --- | --- |
| Clienti | `/clienti/importa` | `/clienti/modello` |
| Passeggeri | `/passeggeri/importa` | `/passeggeri/modello` |
| Fornitori | `/fornitori/importa` | `/fornitori/modello` |
| Pratiche | `/pratiche/importa` | `/pratiche/modello` |
| Preventivi | `/preventivi/importa` | `/preventivi/modello` |
| Documenti pregressi | `/fatture/importa` | `/fatture/modello` |

**L'ordine conta.** Prima i clienti, poi tutto il resto: pratiche, preventivi e
documenti indicano il loro cliente con il nome, l'email, la partita IVA o il
codice fiscale, e una riga il cui cliente non è in anagrafica viene scartata con
scritto perché. Se due clienti rispondono allo stesso nome la riga viene
scartata anche allora: importare sul cliente sbagliato è peggio che non
importare, perché nessuno se ne accorge.

**Le intestazioni si riconoscono da sole.** Nessuno rinomina duemila colonne a
mano: ogni campo accetta più nomi («Partita IVA», «P.IVA», `partita_iva`), e le
parole con cui ogni programma scrive stati e tipi vengono tradotte
(«Prenotata» → confermata, «Biglietteria» → intermediazione, «Regime del
margine» → art. 74-ter). Una parola sconosciuta non fa cadere la riga: prende il
valore più comune. Le colonne che mancano prendono un ripiego, e dove si può lo
ricavano dal resto della riga — senza la colonna del tipo di vendita, chi ha un
costo d'acquisto organizza e chi no intermedia.

**Il modello si lascia reimportare.** Il file che si scarica da
`/<entità>/modello` porta le intestazioni riconosciute e righe di esempio
compilate; compilarlo e ricaricarlo funziona, e c'è un test che lo verifica
generando il modello e rileggendolo (DECISIONI 89).

**Prima si vede, poi si conferma.** Il file viene letto nel browser e mostrato
riga per riga con l'esito; la validazione che decide è quella del server, che di
ciò che arriva dal client non si fida mai. Reimportare lo stesso file non
duplica niente: ogni entità ha la sua chiave naturale (email o codici fiscali
per le anagrafiche, cliente + titolo + partenza per pratiche e preventivi, tipo
+ anno + numero per i documenti).

### I documenti pregressi

Le fatture e le note di credito già emesse dal gestionale precedente si
importano con il loro numero, il loro codice e la loro data. Tre cose da sapere
prima di premere, e le dice anche la pagina:

1. **Il numero resta quello di prima**, e la numerazione di questo gestionale
   riparte dal numero più alto importato: la prima fattura nuova non riusa un
   numero già speso.
2. **Non vengono ritrasmesse allo SdI.** Erano già state trasmesse dal
   gestionale di prima; rimandarle le depositerebbe due volte all'Agenzia delle
   Entrate. Il divieto sta sul database, non nell'interfaccia.
3. **Una riga per voce.** Più righe con lo stesso numero e la stessa data fanno
   un documento solo. La prima riga ne fissa la testata; una riga che la
   contraddice viene scartata da sola.

I documenti importati entrano nel registro IVA del mese della loro data di
emissione, e il registro lo segnala contando quanti documenti dell'anno arrivano
da un gestionale precedente. Se quei mesi sono già stati liquidati con il
gestionale di prima, si importano solo i documenti ancora da incassare
(DECISIONI 91).

Il file dei documenti accetta al massimo **300 righe** contro le 2000 delle
altre entità: ogni documento è una transazione a sé, e trecento sono il limite
del tempo di una funzione serverless. Tre anni di fatturato si importano un anno
per volta. Serve il permesso di **amministrazione**: importare documenti fiscali
non è «scrivere».

---

## Roadmap

| Fase | Contenuto | Stato |
| --- | --- | --- |
| 1 | Fondamenta: design system, layout, Supabase, migrazioni, auth, ruoli, RLS, seed | **completata** |
| 2 | Anagrafiche: clienti, passeggeri, fornitori (CRUD, ricerca, import CSV) | **completata** |
| 3 | Pratiche: righe di servizio, margine, stati, documenti, cronologia | **completata** |
| 4 | Incassi e scadenze: registrazione incassi, piani rateali, pagamenti fornitore, scadenzario | **completata** |
| 5 | Preventivi: varianti, PDF, invio, accettazione online, conversione | **completata** |
| 6 | Amministrazione: fatture, note di credito, 74-ter, registri, export | **completata** |
| 7 | Dashboard e report per operatore, destinazione, fornitore | **completata** |
| 8 | Agenda, attività, posta in uscita | **completata** |
| 9 | Rifinitura: accessibilità, prestazioni, E2E, mobile, manuale, rilascio | **completata** |

La roadmap è chiusa, e dopo di essa sono arrivati i moduli che servono a
vendere il gestionale a un'agenzia vera: fattura elettronica, copie di
sicurezza, pannello di piattaforma, abbonamenti, demo pubblica, trasloco da un
altro gestionale e percorso del primo giorno.

Ciò che resta fuori è scritto in `DECISIONI.md` con il motivo di ciascun rinvio.
In breve: la **trasmissione** allo SdI (il file XML si produce e si verifica, ma
consegnarlo richiede un intermediario accreditato — DECISIONI 79), l'**incasso**
degli abbonamenti (il webhook firmato è pronto e chiuso, manca il fornitore di
pagamenti — DECISIONI 86), l'esportazione in XLSX e l'aggiornamento in tempo
reale, questi ultimi due non pianificati per scelta.

## Licenza

Uso interno dell'agenzia committente.
