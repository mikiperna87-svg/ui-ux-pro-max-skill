import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, AGENCY_B, seedTenants, USER_A_OWNER, USER_B_OWNER } from './helpers'

/**
 * `agencies.deleted_at` esisteva da sempre e non la guardava nessuno: si poteva
 * marcare un'agenzia come cancellata e i suoi membri continuavano a entrare e a
 * scrivere. La 0017 sposta il controllo dentro `current_agency_ids()` e
 * `current_role()`, cioe' la porta da cui passa ogni policy.
 *
 * Qui la cancellazione e la lettura avvengono sulla stessa connessione e nella
 * stessa transazione, annullata alla fine: l'agenzia A deve sparire per i suoi,
 * e l'agenzia B non deve accorgersi di niente.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

type Leggi = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<pg.QueryResult<T>>

beforeAll(async () => {
  await seedTenants()
}, 60_000)

/** Cancella A, poi legge impersonando `utente`. Tutto in una transazione annullata. */
async function conAgenziaCancellata<T>(
  agenzia: string,
  utente: string,
  fn: (leggi: Leggi) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    await client.query('update public.agencies set deleted_at = now() where id = $1', [agenzia])
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: utente, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn((sql, params) => client.query(sql, params))
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}

describe('agenzia cancellata', () => {
  it('sparisce dalle agenzie viste dal suo titolare', async () => {
    const righe = await conAgenziaCancellata(AGENCY_A, USER_A_OWNER, async (leggi) => {
      const esito = await leggi('select id from public.agencies')
      return esito.rowCount
    })
    expect(righe).toBe(0)
  })

  it('porta con se i dati: il titolare non legge piu una sola pratica', async () => {
    const righe = await conAgenziaCancellata(AGENCY_A, USER_A_OWNER, async (leggi) => {
      const esito = await leggi('select id from public.bookings')
      return esito.rowCount
    })
    expect(righe).toBe(0)
  })

  it('toglie anche i clienti, che passano da una policy diversa', async () => {
    const righe = await conAgenziaCancellata(AGENCY_A, USER_A_OWNER, async (leggi) => {
      const esito = await leggi('select id from public.customers')
      return esito.rowCount
    })
    expect(righe).toBe(0)
  })

  it('toglie il ruolo, quindi anche la scrittura', async () => {
    const ruolo = await conAgenziaCancellata(AGENCY_A, USER_A_OWNER, async (leggi) => {
      const esito = await leggi<{ ruolo: string | null }>(
        'select app.current_role($1)::text as ruolo',
        [AGENCY_A],
      )
      return esito.rows[0]?.ruolo ?? null
    })
    expect(ruolo).toBeNull()
  })

  it('non tocca le altre agenzie', async () => {
    const righe = await conAgenziaCancellata(AGENCY_A, USER_B_OWNER, async (leggi) => {
      const esito = await leggi('select id from public.customers where agency_id = $1', [AGENCY_B])
      return esito.rowCount
    })
    expect(righe).toBeGreaterThan(0)
  })
})
