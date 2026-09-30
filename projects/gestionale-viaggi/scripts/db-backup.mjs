#!/usr/bin/env node
/**
 * Copia di sicurezza del database, scaricata in HTTPS dalla Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-backup.mjs --ref <project-ref>
 *   node scripts/db-backup.mjs --url postgresql://...
 *
 * --ref <ref>       il riferimento del progetto (anche da SUPABASE_PROJECT_REF)
 * --url <stringa>   in alternativa: connessione Postgres diretta
 * --out <file>      dove scrivere (default: backup/gestionale-<data>.sql)
 * --senza-utenti    esclude auth.users e auth.identities
 * --righe <n>       righe per istruzione (default 500)
 *
 * Che cosa produce: un file .sql di soli dati. Lo schema non serve copiarlo,
 * perche' vive nelle migrazioni, che stanno in git e sono versionate meglio di
 * qualunque dump. Ripristinare vuol dire: database vuoto, `db:apply`, poi
 * questo file.
 *
 * I valori non vengono riscritti a mano come letterali SQL — un apostrofo, una
 * data con fuso, un array o un JSON basterebbero a rompere tutto. Viaggiano
 * come JSON e li riconverte Postgres con `json_populate_recordset`, che
 * conosce i tipi delle colonne meglio di questo script.
 *
 * Gli utenti: senza `auth.users` il ripristino ridà i dati ma nessuno riesce
 * piu' ad accedere. Per questo sono inclusi in modo predefinito — e per questo
 * il file va trattato come un segreto: contiene le impronte delle password.
 */
import { execFile } from 'node:child_process'
import pg from 'pg'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const esegui = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const argv = process.argv.slice(2)
const args = new Set(argv)

function opzione(nome, predefinito) {
  const i = argv.indexOf(nome)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : predefinito
}

const ref = opzione('--ref', process.env.SUPABASE_PROJECT_REF)
const url = opzione('--url', undefined)
const token = process.env.SUPABASE_ACCESS_TOKEN
const base = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com'
const perIstruzione = Number(opzione('--righe', '500'))
const conUtenti = !args.has('--senza-utenti')

if (!ref && !url) {
  console.error('✖ Serve --ref <project-ref> oppure --url <stringa di connessione>.')
  process.exit(1)
}

let cartellaTemporanea
let client

/**
 * Una lettura sul database.
 *
 * Due strade per la stessa domanda: la Management API quando la porta Postgres
 * non e' raggiungibile, la connessione diretta quando lo e'. Il resto dello
 * script non sa quale delle due sia in uso, e le due strade producono lo
 * stesso file — che e' l'unico modo per poter provare l'una e fidarsi
 * dell'altra.
 */
async function query(sql, etichetta) {
  if (url) {
    try {
      const esito = await client.query(sql)
      return esito.rows
    } catch (errore) {
      throw new Error(`${etichetta}: ${errore.message}`)
    }
  }
  return queryApi(sql, etichetta)
}

async function queryApi(sql, etichetta) {
  const file = path.join(cartellaTemporanea, 'corpo.json')
  await writeFile(file, JSON.stringify({ query: sql }), 'utf8')
  const comando = [
    '-sS', '-X', 'POST', '-w', '\n%{http_code}',
    '-H', 'Content-Type: application/json',
    ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
    '--data-binary', `@${file}`,
    `${base}/v1/projects/${ref}/database/query`,
  ]
  const { stdout } = await esegui('curl', comando, { maxBuffer: 256 * 1024 * 1024 })
  const taglio = stdout.lastIndexOf('\n')
  const corpo = stdout.slice(0, taglio)
  const stato = Number(stdout.slice(taglio + 1).trim())
  if (stato < 200 || stato >= 300) {
    let messaggio = corpo
    try {
      messaggio = JSON.parse(corpo).message ?? corpo
    } catch {
      // Non era JSON.
    }
    throw new Error(`HTTP ${stato} su ${etichetta}\n${messaggio}`)
  }
  return JSON.parse(corpo)
}

/**
 * Le tabelle da copiare, gia' in ordine di dipendenza.
 *
 * Postgres verifica le chiavi esterne riga per riga: inserire una pratica
 * prima del suo cliente fallisce. L'ordinamento topologico si fa qui e non a
 * mano, cosi' una tabella nuova non richiede di ricordarsi di aggiornare un
 * elenco.
 */
async function tabelleInOrdine() {
  const righe = await query(
    // L'API restituisce gli array di Postgres come testo ("{a,b}"): qui si
    // chiede direttamente JSON, che arriva come array vero.
    `select c.relname as tabella,
            coalesce(json_agg(distinct rc.relname) filter (where rc.relname is not null and rc.relname <> c.relname), '[]'::json) as dipende_da
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_constraint k on k.conrelid = c.oid and k.contype = 'f'
     left join pg_class rc on rc.oid = k.confrelid
     where n.nspname = 'public' and c.relkind = 'r'
     group by c.relname
     order by c.relname`,
    'elenco delle tabelle',
  )

  const dipendenze = new Map(righe.map((r) => [r.tabella, r.dipende_da.filter((d) => d !== null)]))
  const fatte = new Set()
  const ordine = []

  // Ordinamento topologico ingenuo. Non basta da solo: `bookings` e `quotes`
  // si puntano a vicenda, e un ciclo non ha un ordine valido. A far funzionare
  // il ripristino e' `set constraints all deferred` in testa al file (0019);
  // questo ordine serve a rendere il file leggibile e a far fallire prima le
  // eventuali violazioni vere.
  let cambiato = true
  while (cambiato) {
    cambiato = false
    for (const [tabella, da] of dipendenze) {
      if (fatte.has(tabella)) continue
      if (da.every((d) => fatte.has(d) || !dipendenze.has(d))) {
        fatte.add(tabella)
        ordine.push(tabella)
        cambiato = true
      }
    }
  }
  // Quello che resta sta in un ciclo: va in fondo in ordine alfabetico, e i
  // vincoli differiti se ne occupano.
  for (const tabella of dipendenze.keys()) if (!fatte.has(tabella)) ordine.push(tabella)

  return ordine
}

/** Le colonne scrivibili: quelle generate le ricalcola Postgres. */
async function colonne(schema, tabella) {
  const righe = await query(
    `select column_name
     from information_schema.columns
     where table_schema = '${schema}' and table_name = '${tabella}'
       and is_generated = 'NEVER' and identity_generation is null
     order by ordinal_position`,
    `colonne di ${schema}.${tabella}`,
  )
  return righe.map((r) => r.column_name)
}

/** Vero se la tabella esiste: il banco di prova locale non ha tutto `auth`. */
async function esiste(schema, tabella) {
  const righe = await query(
    `select to_regclass('${schema}.${tabella}') is not null as c`,
    `esistenza di ${schema}.${tabella}`,
  )
  return righe[0]?.c === true || righe[0]?.c === 't'
}

async function contaRighe(schema, tabella) {
  const righe = await query(`select count(*)::text as n from ${schema}.${tabella}`, `conteggio di ${tabella}`)
  return Number(righe[0]?.n ?? 0)
}

/** Una marca di dollar-quoting che non compaia nei dati. */
function marca(contenuto) {
  let i = 0
  let tag = '$dati$'
  while (contenuto.includes(tag)) {
    i += 1
    tag = `$dati${i}$`
  }
  return tag
}

async function copiaTabella(schema, tabella, pezzi) {
  const totale = await contaRighe(schema, tabella)
  if (totale === 0) {
    pezzi.push(`-- ${schema}.${tabella}: vuota\n`)
    return 0
  }

  const cols = await colonne(schema, tabella)
  const elenco = cols.map((c) => `"${c}"`).join(', ')
  pezzi.push(`\n-- ${schema}.${tabella}: ${totale} righe\n`)

  for (let scarto = 0; scarto < totale; scarto += perIstruzione) {
    const righe = await query(
      `select coalesce(json_agg(t), '[]'::json)::text as dati
       from (select * from ${schema}.${tabella} order by 1 limit ${perIstruzione} offset ${scarto}) t`,
      `${tabella} da ${scarto}`,
    )
    const json = righe[0]?.dati ?? '[]'
    if (json === '[]') continue
    const tag = marca(json)
    pezzi.push(
      `insert into ${schema}.${tabella} (${elenco})\n` +
        `select ${elenco} from json_populate_recordset(null::${schema}.${tabella}, ${tag}${json}${tag})\n` +
        `on conflict do nothing;\n`,
    )
  }
  return totale
}

async function run() {
  cartellaTemporanea = await mkdtemp(path.join(tmpdir(), 'db-backup-'))
  if (url) {
    client = new pg.Client({ connectionString: url })
    await client.connect()
  }
  try {
    const quando = new Date().toISOString().replace(/[:.]/g, '-')
    const destinazione = path.resolve(
      root,
      opzione('--out', path.join('backup', `gestionale-${quando}.sql`)),
    )
    await mkdir(path.dirname(destinazione), { recursive: true })

    const migrazioni = await query(
      'select version from public.schema_migrations order by version',
      'registro delle migrazioni',
    )

    const pezzi = [
      `-- Copia di sicurezza di ${ref ?? 'database locale'}\n`,
      `-- Presa il ${new Date().toISOString()}\n`,
      `-- Migrazioni al momento della copia: ${migrazioni.map((m) => m.version).join(', ')}\n`,
      '--\n',
      '-- Ripristino: database vuoto, `npm run db:apply`, poi questo file.\n',
      '-- Lo schema non e\u2019 qui dentro: vive nelle migrazioni, che stanno in git.\n',
      conUtenti
        ? '--\n-- ATTENZIONE: contiene auth.users, cioe\u2019 le impronte delle password.\n-- Trattalo come una credenziale.\n'
        : '--\n-- Senza utenti: dopo il ripristino nessuno riesce ad accedere finche\u2019 non\n-- vengono ricreati gli account.\n',
      '\nbegin;\n',
      '-- I controlli sulle chiavi esterne si fanno alla fine della transazione:\n',
      '-- `bookings` e `quotes` si riferiscono a vicenda, e nessun ordine di\n',
      '-- inserimento le accontenta entrambe (vedi migrazione 0019).\n',
      'set constraints all deferred;\n',
    ]

    let righeTotali = 0

    const saltate = []
    if (conUtenti) {
      for (const tabella of ['users', 'identities']) {
        if (await esiste('auth', tabella)) {
          righeTotali += await copiaTabella('auth', tabella, pezzi)
        } else {
          // Va detto e scritto nel file: una tabella mancante in silenzio
          // diventa una copia incompleta di cui nessuno sa niente finche' non
          // serve davvero.
          saltate.push(`auth.${tabella}`)
          pezzi.push(`-- auth.${tabella}: assente su questo database, non copiata\n`)
        }
      }
    }

    const tabelle = await tabelleInOrdine()
    for (const tabella of tabelle) {
      righeTotali += await copiaTabella('public', tabella, pezzi)
    }

    pezzi.push('\ncommit;\n')
    await writeFile(destinazione, pezzi.join(''), 'utf8')

    const peso = (await readFile(destinazione)).length
    console.log(`· ${tabelle.length + (conUtenti ? 2 : 0)} tabelle, ${righeTotali} righe`)
    console.log(`· ${(peso / 1024 / 1024).toFixed(2)} MB`)
    console.log(`\nCopia scritta in ${path.relative(root, destinazione)}`)
    if (saltate.length > 0) {
      console.log(`· non copiate perché assenti: ${saltate.join(', ')}`)
    }
    if (conUtenti) {
      console.log('Contiene le impronte delle password: tienila dove terresti una chiave.')
    }
  } finally {
    if (client) await client.end().catch(() => undefined)
    if (cartellaTemporanea) await rm(cartellaTemporanea, { recursive: true, force: true })
  }
}

run().catch((errore) => {
  console.error(`\n✖ ${errore.message}`)
  process.exit(1)
})
