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
| **Clienti** | Elenco con ricerca insensibile ad accenti e maiuscole, filtri, ordinamento, colonne configurabili, selezione multipla, esportazione CSV e importazione guidata · scheda con valore generato, margine, viaggi, passeggeri, consensi e cronologia · esportazione e anonimizzazione GDPR |
| **Passeggeri** | Anagrafica separata dai clienti, con documento di viaggio, scadenze e filtro su chi non è in regola |
| **Fornitori** | Tipo, condizioni di pagamento, commissione predefinita, regime IVA, IBAN · acquistato, margine generato, da pagare e prossima scadenza · disattivazione senza perdita dello storico |

Il database contiene già l'intero modello dati (incassi, piani rateali, fatture,
documenti, task, audit) con le relative policy di sicurezza: le fasi successive
aggiungono le interfacce, non lo schema.

## Stack

- **Next.js 15** (App Router, React Server Components, Server Actions) + TypeScript strict
- **Supabase**: Postgres, Auth, Row Level Security, Storage
- **Tailwind CSS v4** con design token in `src/app/globals.css` + primitive Radix personalizzate
- **Zod** per la validazione condivisa, **date-fns** con locale italiano
- **Vitest** + Testing Library per unità e componenti, **Playwright** per i percorsi end-to-end

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
| `npm run dev:api` | Banco di prova Supabase per lo sviluppo locale |
| `npm run dev:stack` | Accende Postgres e il banco di prova se sono spenti |
| `npm run start:e2e` | Server di produzione con i limiti di accesso alzati |

Dopo ogni migrazione va rigenerato il file dei tipi: così un campo rinominato
rompe la compilazione invece della produzione.

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

---

## Distribuzione su Vercel

1. Collega il repository a Vercel e imposta come *Root Directory* la cartella
   `projects/gestionale-viaggi`.
2. Inserisci le variabili d'ambiente di `.env.example` (senza `DATABASE_URL`, che
   serve solo agli script).
3. Imposta `NEXT_PUBLIC_SITE_URL` sull'indirizzo definitivo e aggiungilo fra i
   *Redirect URLs* di Supabase.
4. Le migrazioni si applicano al database di produzione prima del rilascio
   (`npm run db:apply` con `DATABASE_URL` di produzione, oppure `supabase db push`).

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
| 8 | Agenda, task, notifiche email | da fare |
| 9 | Rifinitura: accessibilità, prestazioni, E2E, mobile, manuale, rilascio | da fare |

## Licenza

Uso interno dell'agenzia committente.
