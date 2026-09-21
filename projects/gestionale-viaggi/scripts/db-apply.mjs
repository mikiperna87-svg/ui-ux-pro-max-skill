#!/usr/bin/env node
/**
 * Applica le migrazioni (e opzionalmente il seed) a un database Postgres.
 *
 *   node scripts/db-apply.mjs --reset --shim --seed
 *
 * --reset  ricrea da zero gli schemi public/app (e auth se --shim)
 * --shim   applica supabase/testing/00_local_auth_shim.sql (solo Postgres locale)
 * --seed   applica supabase/seed.sql al termine
 * --forza  riapplica anche le migrazioni già registrate
 * --adotta registra tutte le migrazioni come applicate SENZA eseguirle:
 *          serve una volta sola, su un database creato prima che esistesse il
 *          registro. Su un database a metà strada sarebbe una bugia, quindi
 *          non viene mai fatto da solo.
 *
 * Ogni migrazione applicata viene registrata in `public.schema_migrations`: al
 * giro successivo si salta, e il comando si può rilanciare su un database già
 * aggiornato senza rompere nulla. Senza questo registro la seconda messa in
 * produzione falliva sulla prima migrazione non idempotente — ed è il comando
 * che il manuale di rilascio indica di eseguire a ogni versione.
 *
 * La connessione si legge da DATABASE_URL (default: istanza locale di sviluppo).
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const args = new Set(process.argv.slice(2))

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

async function run() {
  // Le opzioni si verificano prima di toccare qualunque cosa: `--adotta`
  // registra le migrazioni senza eseguirle, e dopo un `--reset` lascerebbe un
  // database vuoto che si dichiara aggiornato.
  if (args.has('--adotta') && args.has('--reset')) {
    console.error('✖ --adotta non si combina con --reset: dopo un reset le migrazioni vanno eseguite.')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    if (args.has('--reset')) {
      await client.query(`
        drop schema if exists public cascade;
        drop schema if exists app cascade;
        create schema public;
      `)
      if (args.has('--shim')) {
        await client.query('drop schema if exists auth cascade;')
      }
      console.log('· schemi ricreati')
    }

    if (args.has('--shim')) {
      await applyFile(client, path.join(root, 'supabase/testing/00_local_auth_shim.sql'))
    }

    // Il registro vive in `public` perché deve esistere prima che le migrazioni
    // creino lo schema `app`. La RLS è accesa e non ha policy: nessuno può
    // leggerlo attraverso l'API: ci arriva solo chi possiede il database, cioè
    // questo script. È la stessa regola di ogni altra tabella pubblica, non
    // un'eccezione concessa a un dettaglio interno.
    await client.query(`
      create table if not exists public.schema_migrations (
        version     text primary key,
        applied_at  timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
    `)
    const applicate = new Set(
      (await client.query('select version from public.schema_migrations')).rows.map(
        (riga) => riga.version,
      ),
    )

    const migrationsDir = path.join(root, 'supabase/migrations')
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

    if (args.has('--adotta')) {
      for (const file of files) {
        await client.query(
          'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing',
          [file.replace(/\.sql$/, '')],
        )
      }
      console.log(`· ${files.length} migrazioni registrate come già applicate`)
      console.log('\nRegistro allineato.')
      return
    }

    let saltate = 0
    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      if (!args.has('--forza') && applicate.has(version)) {
        saltate += 1
        continue
      }
      await applyFile(client, path.join(migrationsDir, file))
      await client.query(
        'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing',
        [version],
      )
    }
    if (saltate > 0) console.log(`· ${saltate} migrazioni già applicate, saltate`)

    if (args.has('--seed')) {
      await applyFile(client, path.join(root, 'supabase/seed.sql'))
    }

    console.log('\nDatabase pronto.')
  } finally {
    await client.end()
  }
}

async function applyFile(client, filePath) {
  const sql = await readFile(filePath, 'utf8')
  const label = path.relative(root, filePath)
  try {
    await client.query(sql)
    console.log(`· ${label}`)
  } catch (error) {
    console.error(`\n✖ Errore in ${label}:\n${error.message}`)
    if (error.position) {
      const pos = Number(error.position)
      console.error(`  contesto: ...${sql.slice(Math.max(0, pos - 200), pos + 200)}...`)
    }
    throw error
  }
}

run().catch(() => process.exit(1))
