#!/usr/bin/env node
/**
 * Applica le migrazioni a un progetto Supabase ospitato, passando dalla
 * Management API invece che dalla porta Postgres.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-apply-api.mjs --ref <project-ref>
 *
 * --ref <ref>   il riferimento del progetto (si legge anche da SUPABASE_PROJECT_REF)
 * --forza       riapplica anche le migrazioni già registrate
 * --seed        applica supabase/seed.sql al termine. Crea l'agenzia
 *               dimostrativa «Orizzonti Viaggi» con i suoi quattro accessi,
 *               cancellandola e rifacendola se c'e' gia'. Non tocca nient'altro:
 *               le altre agenzie restano dove sono.
 * --prova       stampa che cosa farebbe, senza toccare niente
 *
 * Perché esiste, accanto a db-apply.mjs: la porta 5432 di un progetto Supabase
 * è spesso chiusa o raggiungibile solo via IPv6, mentre api.supabase.com
 * risponde sempre in HTTPS. Il registro `public.schema_migrations` è lo stesso,
 * quindi i due comandi si alternano senza confondersi.
 *
 * Le richieste passano da `curl` e non da fetch(): così il comando funziona
 * anche dietro un proxy aziendale, che è la situazione in cui serve di più.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const esegui = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const argv = process.argv.slice(2)
const args = new Set(argv)

function opzione(nome) {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}

const ref = opzione('--ref') ?? process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
const base = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com'

if (!ref) {
  console.error('✖ Serve il riferimento del progetto: --ref <project-ref> oppure SUPABASE_PROJECT_REF.')
  process.exit(1)
}

let cartella

/** Una query sul database del progetto. Ritorna le righe già decodificate. */
async function query(sql, etichetta) {
  const file = path.join(cartella, 'corpo.json')
  await writeFile(file, JSON.stringify({ query: sql }), 'utf8')

  const comando = [
    '-sS',
    '-X', 'POST',
    '-w', '\n%{http_code}',
    '-H', 'Content-Type: application/json',
    ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
    '--data-binary', `@${file}`,
    `${base}/v1/projects/${ref}/database/query`,
  ]

  const { stdout } = await esegui('curl', comando, { maxBuffer: 64 * 1024 * 1024 })
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
    throw new Error(`HTTP ${stato} su ${etichetta}\n${messaggio}`)
  }

  try {
    return JSON.parse(corpo)
  } catch {
    return []
  }
}

async function applicaFile(file, etichetta) {
  const sql = await readFile(file, 'utf8')
  await query(sql, etichetta)
  console.log(`· ${etichetta}`)
}

async function run() {
  cartella = await mkdtemp(path.join(tmpdir(), 'db-apply-api-'))
  try {
    if (args.has('--prova')) {
      const files = (await readdir(path.join(root, 'supabase/migrations')))
        .filter((f) => f.endsWith('.sql'))
        .sort()
      console.log(`Progetto: ${ref}`)
      console.log(`Migrazioni sul disco: ${files.length}`)
      files.forEach((f) => console.log(`  ${f}`))
      return
    }

    // Lo stesso registro di db-apply.mjs, con la RLS accesa e nessuna policy:
    // non è leggibile attraverso l'API, solo da chi possiede il database.
    await query(
      `create table if not exists public.schema_migrations (
         version     text primary key,
         applied_at  timestamptz not null default now()
       );
       alter table public.schema_migrations enable row level security;`,
      'registro delle migrazioni',
    )

    const righe = await query(
      'select version from public.schema_migrations',
      'lettura del registro',
    )
    const applicate = new Set(righe.map((riga) => riga.version))

    const migrationsDir = path.join(root, 'supabase/migrations')
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

    let saltate = 0
    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      if (!args.has('--forza') && applicate.has(version)) {
        saltate += 1
        continue
      }
      await applicaFile(path.join(migrationsDir, file), `supabase/migrations/${file}`)
      await query(
        `insert into public.schema_migrations (version) values ('${version}')
         on conflict (version) do nothing`,
        `registrazione di ${version}`,
      )
    }
    if (saltate > 0) console.log(`· ${saltate} migrazioni già applicate, saltate`)

    if (args.has('--seed')) {
      console.log('\n· applico il seed dimostrativo (cancella e rifà solo la sua agenzia)')
      await applicaFile(path.join(root, 'supabase/seed.sql'), 'supabase/seed.sql')
    }

    console.log('\nDatabase pronto.')
  } finally {
    if (cartella) await rm(cartella, { recursive: true, force: true })
  }
}

run().catch((errore) => {
  console.error(`\n✖ ${errore.message}`)
  process.exit(1)
})
