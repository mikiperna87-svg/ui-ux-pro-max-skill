#!/usr/bin/env node
/**
 * Applica le migrazioni (e opzionalmente il seed) a un database Postgres.
 *
 *   node scripts/db-apply.mjs --reset --shim --seed
 *
 * --reset  ricrea da zero gli schemi public/app (e auth se --shim)
 * --shim   applica supabase/testing/00_local_auth_shim.sql (solo Postgres locale)
 * --seed   applica supabase/seed.sql al termine
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

    const migrationsDir = path.join(root, 'supabase/migrations')
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      await applyFile(client, path.join(migrationsDir, file))
    }

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
