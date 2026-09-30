import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, seedTenants, USER_A_OWNER } from './helpers'

/**
 * I limiti del piano e la scadenza, verificati dove vengono applicati.
 *
 * Stanno nel database e non nell'applicazione perché nell'applicazione
 * sarebbero più facili da scrivere e più facili da dimenticare: basterebbe una
 * query nuova, un'importazione, uno script di manutenzione. Qui valgono per
 * chiunque scriva, comunque scriva — ed è così che questi test li provano,
 * scrivendo direttamente in SQL senza passare da nessuna pagina.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

beforeAll(async () => {
  await seedTenants()
}, 60_000)

async function conAbbonamento<T>(
  piano: string,
  stato: string,
  scadenza: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into public.subscriptions (agency_id, plan_code, status, valid_until)
       values ($1, $2, $3::app.subscription_status, $4)
       on conflict (agency_id) do update
         set plan_code = excluded.plan_code, status = excluded.status, valid_until = excluded.valid_until`,
      [AGENCY_A, piano, stato, scadenza],
    )
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: USER_A_OWNER, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn((sql, params) => client.query(sql, params))
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}

const permessi = async (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => {
  const r = await q('select app.can_write($1) as scrive, app.is_owner($1) as titolare', [AGENCY_A])
  return r.rows[0]
}

describe('stato dell’abbonamento', () => {
  it('in prova si scrive', async () => {
    const p = await conAbbonamento('prova', 'prova', null, permessi)
    expect(p).toEqual({ scrive: true, titolare: true })
  })

  it('attivo e senza scadenza si scrive', async () => {
    const p = await conAbbonamento('completo', 'attivo', null, permessi)
    expect(p).toEqual({ scrive: true, titolare: true })
  })

  it('scaduto non si scrive', async () => {
    const p = await conAbbonamento('completo', 'scaduto', null, permessi)
    expect(p).toEqual({ scrive: false, titolare: false })
  })

  it('annullato non si scrive', async () => {
    const p = await conAbbonamento('completo', 'annullato', null, permessi)
    expect(p).toEqual({ scrive: false, titolare: false })
  })

  // La data conta anche se lo stato dice ancora «attivo»: uno stato che nessuno
  // ha aggiornato non deve tenere aperta la porta.
  it('attivo ma con la data passata non si scrive', async () => {
    const p = await conAbbonamento('completo', 'attivo', '2020-01-01', permessi)
    expect(p).toEqual({ scrive: false, titolare: false })
  })

  it('attivo con la data futura si scrive', async () => {
    const p = await conAbbonamento('completo', 'attivo', '2099-12-31', permessi)
    expect(p).toEqual({ scrive: true, titolare: true })
  })

  it('si continua a leggere anche da scaduti', async () => {
    const righe = await conAbbonamento('completo', 'scaduto', null, async (q) => {
      const r = await q('select id from public.customers')
      return r.rowCount
    })
    expect(righe).toBeGreaterThan(0)
  })

  // Un'installazione per una sola agenzia non ha abbonamenti, e non deve
  // smettere di funzionare perché una tabella è vuota.
  it('senza riga di abbonamento tutto funziona come prima', async () => {
    const client = new pg.Client({ connectionString })
    await client.connect()
    try {
      await client.query('begin')
      await client.query('delete from public.subscriptions where agency_id = $1', [AGENCY_A])
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: USER_A_OWNER, role: 'authenticated' }),
      ])
      await client.query('set local role authenticated')
      const r = await client.query('select app.can_write($1) as scrive', [AGENCY_A])
      expect(r.rows[0]).toEqual({ scrive: true })
    } finally {
      await client.query('rollback').catch(() => {})
      await client.end()
    }
  })
})

describe('limiti del piano', () => {
  it('il piano Base ferma il quarto utente', async () => {
    // Il seed dell'agenzia A ha già quattro membri attivi: il piano Base ne
    // prevede tre, quindi un inserimento in più deve essere rifiutato.
    await expect(
      conAbbonamento('base', 'attivo', '2099-12-31', async (q) => {
        await q(
          `insert into public.memberships (agency_id, user_id, full_name, email, role)
           values ($1, gen_random_uuid(), 'Uno Di Troppo', 'troppo@example.com', 'operatore')`,
          [AGENCY_A],
        )
      }),
    ).rejects.toThrow(/al massimo 3 utenti/i)
  })

  it('il piano Completo non ferma nessuno', async () => {
    const esito = await conAbbonamento('completo', 'attivo', '2099-12-31', async (q) => {
      // La membership punta a un utente vero: il vincolo verso `auth.users`
      // vale anche qui, e un uuid a caso verrebbe respinto prima del trigger,
      // facendo passare il test per il motivo sbagliato.
      await q('set local role postgres')
      const utente = await q(
        `insert into auth.users (id, email) values (gen_random_uuid(), 'nuovo@example.com')
         returning id`,
      )
      await q('set local role authenticated')
      const r = await q(
        `insert into public.memberships (agency_id, user_id, full_name, email, role)
         values ($1, $2, 'Nuovo Operatore', 'nuovo@example.com', 'operatore')
         returning id`,
        [AGENCY_A, utente.rows[0].id],
      )
      return r.rowCount
    })
    expect(esito).toBe(1)
  })

  it('il limite delle pratiche è per anno solare', async () => {
    const messaggio = await conAbbonamento('base', 'attivo', '2099-12-31', async (q) => {
      const r = await q('select max_bookings from app.subscription_of($1)', [AGENCY_A])
      return r.rows[0]?.max_bookings
    })
    expect(messaggio).toBe(500)
  })
})
