#!/usr/bin/env node
/**
 * Avvia (o riavvia) lo stack di sviluppo locale: Postgres e il banco di prova
 * Supabase. Serve perché su questa macchina i due processi non sono servizi di
 * sistema e un riavvio del contenitore li lascia spenti; controllarli a mano
 * prima di ogni verifica era la parte più facile da dimenticare.
 *
 *   node scripts/dev-stack.mjs
 */
import { execFileSync, spawn } from 'node:child_process'
import net from 'node:net'

const PG_PORT = 54329
const API_PORT = 54321
const PGDATA = process.env.PGDATA_LOCALE ?? '/var/lib/postgresql/tadata'
const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'

function inAscolto(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(700)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

if (await inAscolto(PG_PORT)) {
  console.log(`· Postgres già in ascolto sulla porta ${PG_PORT}`)
} else {
  execFileSync('su', [
    'postgres',
    '-c',
    `${PG_BIN}/pg_ctl -D ${PGDATA} -o '-p ${PG_PORT}' -l /tmp/pg.log start`,
  ])
  console.log(`· Postgres avviato sulla porta ${PG_PORT}`)
}

if (await inAscolto(API_PORT)) {
  console.log(`· Banco di prova già in ascolto sulla porta ${API_PORT}`)
} else {
  const child = spawn(process.execPath, ['supabase/testing/local-api.mjs'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  // Un attimo per legarsi alla porta, poi si verifica davvero.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  if (!(await inAscolto(API_PORT))) {
    console.error('Il banco di prova non risponde: controlla supabase/testing/local-api.mjs')
    process.exit(1)
  }
  console.log(`· Banco di prova avviato sulla porta ${API_PORT}`)
}

console.log('Stack di sviluppo pronto.')
