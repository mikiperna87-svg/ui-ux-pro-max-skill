import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, seedTenants, USER_A_OWNER, USER_B_OWNER } from './helpers'

/**
 * Due promesse, verificate sul database.
 *
 * La prima: chi amministra la piattaforma vede le agenzie ma non i loro dati.
 * Un pannello di amministrazione è il posto più naturale dove l'isolamento fra
 * agenzie si rompe, e qui si dimostra che non si rompe.
 *
 * La seconda: un'agenzia sospesa resta leggibile. Chi ha smesso di pagare deve
 * poter esportare i propri dati; smette solo di scriverne di nuovi.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'
const AMMINISTRATORE = '99999999-9999-4999-8999-999999999999'

beforeAll(async () => {
  await seedTenants()
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `insert into auth.users (id, email) values ($1, 'piattaforma@example.com')
       on conflict (id) do nothing`,
      [AMMINISTRATORE],
    )
    await client.query(
      `insert into public.platform_admins (user_id, note) values ($1, 'test')
       on conflict (user_id) do nothing`,
      [AMMINISTRATORE],
    )
  } finally {
    await client.end()
  }
}, 60_000)

/** Esegue impersonando un utente, in una transazione sempre annullata. */
async function come<T>(
  utente: string,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
  preparazione?: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<void>,
): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    if (preparazione) await preparazione((sql, params) => client.query(sql, params))
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

describe('amministratore della piattaforma', () => {
  it('vede tutte le agenzie con i loro conteggi', async () => {
    const righe = await come(AMMINISTRATORE, async (q) => {
      const r = await q('select id, name, members, customers, bookings from public.platform_agencies')
      return r.rows
    })
    expect(righe.length).toBeGreaterThanOrEqual(2)
    const a = righe.find((r) => r.id === AGENCY_A)
    expect(Number(a?.customers)).toBeGreaterThan(0)
  })

  // Il punto dell'intero modulo: i conteggi sì, il contenuto no.
  it('non legge un solo cliente, una sola pratica, una sola fattura', async () => {
    const conteggi = await come(AMMINISTRATORE, async (q) => {
      const c = await q('select count(*)::text as n from public.customers')
      const b = await q('select count(*)::text as n from public.bookings')
      const i = await q('select count(*)::text as n from public.invoices')
      return [c.rows[0].n, b.rows[0].n, i.rows[0].n]
    })
    expect(conteggi).toEqual(['0', '0', '0'])
  })

  it('vede i membri per sapere chi contattare', async () => {
    const righe = await come(AMMINISTRATORE, async (q) => {
      const r = await q('select email, role from public.platform_members where agency_id = $1', [
        AGENCY_A,
      ])
      return r.rows
    })
    expect(righe.length).toBeGreaterThan(0)
    expect(righe.some((r) => r.role === 'titolare')).toBe(true)
  })

  it('un titolare qualunque non vede il pannello', async () => {
    const righe = await come(USER_A_OWNER, async (q) => {
      const r = await q('select id from public.platform_agencies')
      return r.rowCount
    })
    expect(righe).toBe(0)
  })

  it('un titolare non può sospendere nessuno', async () => {
    await expect(
      come(USER_B_OWNER, async (q) => {
        await q('select public.suspend_agency($1, $2)', [AGENCY_A, 'tentativo'])
      }),
    ).rejects.toThrow(/amministratore/i)
  })

  it('la sospensione va motivata', async () => {
    await expect(
      come(AMMINISTRATORE, async (q) => {
        await q('select public.suspend_agency($1, $2)', [AGENCY_A, '   '])
      }),
    ).rejects.toThrow(/motivata/i)
  })
})

describe('agenzia sospesa', () => {
  const sospendi = async (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => {
    await q('update public.agencies set suspended_at = now(), suspension_reason = $2 where id = $1', [
      AGENCY_A,
      'abbonamento scaduto',
    ])
  }

  it('continua a leggere i propri dati', async () => {
    const righe = await come(
      USER_A_OWNER,
      async (q) => {
        const r = await q('select id from public.customers')
        return r.rowCount
      },
      sospendi,
    )
    expect(righe).toBeGreaterThan(0)
  })

  it('non può più scrivere', async () => {
    await expect(
      come(
        USER_A_OWNER,
        async (q) => {
          await q(
            `insert into public.customers (agency_id, kind, last_name, country)
             values ($1, 'privato', 'Sospeso', 'IT')`,
            [AGENCY_A],
          )
        },
        sospendi,
      ),
    ).rejects.toThrow()
  })

  it('perde anche i permessi di amministrazione contabile', async () => {
    const permessi = await come(
      USER_A_OWNER,
      async (q) => {
        const r = await q(
          'select app.can_write($1) as scrive, app.is_owner($1) as titolare, app.can_manage_accounting($1) as contabile',
          [AGENCY_A],
        )
        return r.rows[0]
      },
      sospendi,
    )
    expect(permessi).toEqual({ scrive: false, titolare: false, contabile: false })
  })

  it('senza sospensione i permessi restano quelli di prima', async () => {
    const permessi = await come(USER_A_OWNER, async (q) => {
      const r = await q(
        'select app.can_write($1) as scrive, app.is_owner($1) as titolare',
        [AGENCY_A],
      )
      return r.rows[0]
    })
    expect(permessi).toEqual({ scrive: true, titolare: true })
  })
})
