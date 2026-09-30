#!/usr/bin/env node
/**
 * La prova del ripristino: copia, azzera, rimette, confronta.
 *
 *   node scripts/db-restore-check.mjs --url postgresql://... --sono-sicuro
 *
 * Una copia di sicurezza che non e' mai stata ripristinata non e' una copia di
 * sicurezza: e' un file. Questo comando chiude il cerchio — prende una copia
 * del database indicato, lo svuota, lo ricostruisce da migrazioni piu' copia, e
 * verifica che ogni tabella abbia ritrovato le sue righe.
 *
 * **Distrugge il database su cui gira.** Per questo vuole `--sono-sicuro`, e
 * per questo rifiuta qualunque connessione che non sia locale: la prova si fa
 * sul banco, non in produzione.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const esegui = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const args = new Set(argv)

function opzione(nome, predefinito) {
  const i = argv.indexOf(nome)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : predefinito
}

const url = opzione('--url', process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres')

if (!args.has('--sono-sicuro')) {
  console.error('✖ Questo comando svuota il database indicato. Aggiungi --sono-sicuro se è quello che vuoi.')
  process.exit(1)
}

// Il guardrail non è una formalità: un ripristino di prova lanciato per errore
// su un database vero cancellerebbe tutto quello che la copia non contiene.
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('✖ La prova si fa solo su un database locale. Ricevuto un indirizzo remoto.')
  process.exit(1)
}

async function conteggi(client) {
  const tabelle = await client.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  )
  const out = new Map()
  for (const { t } of tabelle.rows) {
    const r = await client.query(`select count(*)::text as n from public."${t}"`)
    out.set(t, Number(r.rows[0].n))
  }
  return out
}

async function run() {
  const cartella = await mkdtemp(path.join(tmpdir(), 'ripristino-'))
  const copia = path.join(cartella, 'copia.sql')

  try {
    let client = new pg.Client({ connectionString: url })
    await client.connect()
    const prima = await conteggi(client)
    const righePrima = [...prima.values()].reduce((a, b) => a + b, 0)
    await client.end()
    console.log(`· partenza: ${prima.size} tabelle, ${righePrima} righe`)

    await esegui('node', [path.join(here, 'db-backup.mjs'), '--url', url, '--out', copia], {
      maxBuffer: 256 * 1024 * 1024,
    })
    const peso = (await readFile(copia)).length
    console.log(`· copia presa: ${(peso / 1024 / 1024).toFixed(2)} MB`)

    await esegui('node', [path.join(here, 'db-apply.mjs'), '--reset', '--shim'], {
      env: { ...process.env, DATABASE_URL: url },
      maxBuffer: 64 * 1024 * 1024,
    })
    console.log('· database azzerato e migrazioni riapplicate')

    client = new pg.Client({ connectionString: url })
    await client.connect()
    const vuoto = await conteggi(client)
    const righeVuoto = [...vuoto.values()].reduce((a, b) => a + b, 0)
    // Il registro delle migrazioni si ricrea da solo: è l'unica riga attesa.
    console.log(`· dopo l'azzeramento: ${righeVuoto} righe`)

    await client.query(await readFile(copia, 'utf8'))
    console.log('· copia riapplicata')

    const dopo = await conteggi(client)
    await client.end()

    const divergenze = []
    for (const [tabella, attese] of prima) {
      const trovate = dopo.get(tabella) ?? 0
      if (trovate !== attese) divergenze.push(`${tabella}: attese ${attese}, trovate ${trovate}`)
    }

    if (divergenze.length > 0) {
      console.error(`\n✖ Il ripristino non è completo:\n  ${divergenze.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`\nRipristino completo: ${prima.size} tabelle, ${righePrima} righe ritrovate.`)
  } finally {
    await rm(cartella, { recursive: true, force: true })
  }
}

run().catch((errore) => {
  console.error(`\n✖ ${errore.message}`)
  process.exit(1)
})
