#!/usr/bin/env node
/**
 * Interroga un progetto Supabase ospitato passando dalla Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-query-api.mjs --ref <ref> --sql "select 1"
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-query-api.mjs --ref <ref> --file verifica.sql
 *
 * --ref <ref>    il riferimento del progetto (si legge anche da SUPABASE_PROJECT_REF)
 * --sql <testo>  l'istruzione da eseguire
 * --file <path>  un file da eseguire, al posto di --sql
 * --scrivi       necessario per eseguire qualcosa che non sia una lettura
 * --json         stampa le righe come JSON invece che in tabella
 *
 * Perché esiste: dopo un rilascio bisogna poter guardare che cosa c'è davvero
 * sul database di produzione — una colonna arrivata, un conteggio, un dato da
 * correggere — e la porta 5432 di un progetto Supabase è spesso chiusa. Finora
 * l'unico modo era infilare la domanda in una migrazione, che la registra per
 * sempre nel registro come se fosse un cambio di schema.
 *
 * Il blocco `--scrivi` non è una formalità: una query scritta male su
 * produzione non si annulla, e il comando che la esegue deve dire a voce alta
 * che la sta scrivendo. Il riconoscimento è volutamente grossolano — qualunque
 * cosa non cominci per `select` o `with` è considerata una scrittura.
 *
 * Le richieste passano da `curl` e non da fetch(): così il comando funziona
 * anche dietro un proxy, che è la situazione in cui serve di più.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const esegui = promisify(execFile)
const argv = process.argv.slice(2)
const args = new Set(argv)

function opzione(nome) {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}

const ref = opzione('--ref') ?? process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
const base = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com'

/**
 * Vero quando l'istruzione è, con ogni evidenza, una sola lettura.
 *
 * `explain` e `explain analyze` davanti a una `select` restano letture: il
 * piano si misura eseguendo quella select e nient'altro. Davanti a una
 * `insert` no — `explain analyze insert` scrive per davvero — quindi il
 * prefisso si toglie e si guarda che cosa c'è sotto.
 */
export function soloLettura(sql) {
  let pulito = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .toLowerCase()

  // `explain`, con le sue opzioni fra parentesi oppure come parole sciolte.
  pulito = pulito.replace(/^explain\s*(\([^)]*\)\s*)?((analyze|analyse|verbose|costs|buffers|timing|summary|settings|wal|generic_plan|format\s+\w+|true|false|on|off|,)\s+)*/, '')

  return /^(select|with|table|values|show)\b/.test(pulito) &&
    !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|refresh|vacuum|reindex|call|do)\b/.test(pulito)
}

async function run() {
  if (!ref) {
    console.error('✖ Serve il riferimento del progetto: --ref <project-ref> oppure SUPABASE_PROJECT_REF.')
    process.exit(1)
  }

  const file = opzione('--file')
  const sql = file ? await readFile(path.resolve(file), 'utf8') : opzione('--sql')

  if (!sql || sql.trim() === '') {
    console.error('✖ Serve qualcosa da eseguire: --sql "<istruzione>" oppure --file <percorso>.')
    process.exit(1)
  }

  if (!soloLettura(sql) && !args.has('--scrivi')) {
    console.error('✖ Questa non è una lettura. Se è voluto, ripeti il comando con --scrivi.')
    process.exit(1)
  }

  const cartella = await mkdtemp(path.join(tmpdir(), 'db-query-api-'))
  try {
    const corpoFile = path.join(cartella, 'corpo.json')
    await writeFile(corpoFile, JSON.stringify({ query: sql }), 'utf8')

    const { stdout } = await esegui(
      'curl',
      [
        '-sS',
        '-X', 'POST',
        '-w', '\n%{http_code}',
        '-H', 'Content-Type: application/json',
        ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
        '--data-binary', `@${corpoFile}`,
        `${base}/v1/projects/${ref}/database/query`,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    )

    const taglio = stdout.lastIndexOf('\n')
    const corpo = stdout.slice(0, taglio)
    const stato = Number(stdout.slice(taglio + 1).trim())

    if (stato < 200 || stato >= 300) {
      let messaggio = corpo
      try {
        const json = JSON.parse(corpo)
        messaggio = json.message ?? json.error ?? corpo
      } catch {
        // Il corpo non era JSON: si mostra così com'è.
      }
      console.error(`✖ HTTP ${stato}\n${messaggio}`)
      process.exit(1)
    }

    let righe
    try {
      righe = JSON.parse(corpo)
    } catch {
      righe = []
    }

    if (args.has('--json')) {
      console.log(JSON.stringify(righe, null, 2))
    } else if (!Array.isArray(righe) || righe.length === 0) {
      console.log('(nessuna riga)')
    } else {
      console.table(righe)
    }
  } finally {
    await rm(cartella, { recursive: true, force: true })
  }
}

/**
 * Si esegue solo quando è questo il comando invocato.
 *
 * `soloLettura` è esportata perché la provano i test — è l'unica cosa fra un
 * comando scritto in fretta e il database di produzione — e un modulo che
 * all'import legge gli argomenti e parte non si può provare.
 */
const invocato =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invocato) {
  run().catch((errore) => {
    console.error(`✖ ${errore.message}`)
    process.exit(1)
  })
}
