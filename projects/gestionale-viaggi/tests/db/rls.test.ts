import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  AGENCY_A,
  AGENCY_B,
  asUser,
  seedTenants,
  USER_A_ADMIN,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_A_READONLY,
  USER_B_OWNER,
} from './helpers'

/**
 * Questi test dimostrano la promessa piu' importante del gestionale:
 * un utente dell'agenzia A non legge ne' scrive nulla dell'agenzia B.
 * Girano su un Postgres reale con le stesse policy che vanno in produzione.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

afterAll(async () => {
  const client = await adminClient()
  await client.query(`delete from public.agencies where id = '${AGENCY_B}'`)
  await client.end()
})

describe('isolamento fra agenzie', () => {
  it('il titolare di A vede le pratiche di A', async () => {
    const count = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>('select count(*)::text as n from public.bookings')
      return Number(result.rows[0]?.n)
    })
    expect(count).toBeGreaterThan(50)
  })

  it('il titolare di B non vede nessuna pratica di A', async () => {
    const rows = await asUser(USER_B_OWNER, async (s) => {
      const result = await s.query('select id from public.bookings where agency_id = $1', [AGENCY_A])
      return result.rowCount
    })
    expect(rows).toBe(0)
  })

  it('il titolare di B non vede i clienti di A', async () => {
    const rows = await asUser(USER_B_OWNER, async (s) => {
      const result = await s.query('select id from public.customers where agency_id = $1', [AGENCY_A])
      return result.rowCount
    })
    expect(rows).toBe(0)
  })

  it('il titolare di A non vede i clienti di B', async () => {
    const rows = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query('select id from public.customers where agency_id = $1', [AGENCY_B])
      return result.rowCount
    })
    expect(rows).toBe(0)
  })

  it('il titolare di B non puo creare una pratica dentro A', async () => {
    await expect(
      asUser(USER_B_OWNER, async (s) => {
        const customer = await s.query<{ id: string }>(
          'select id from public.customers where agency_id = $1 limit 1',
          [AGENCY_B],
        )
        await s.query(
          `insert into public.bookings (agency_id, customer_id, title, destination, departure_date)
           values ($1, $2, 'Tentativo di intrusione', 'Nessun luogo', current_date + 30)`,
          [AGENCY_A, customer.rows[0]?.id],
        )
      }),
    ).rejects.toThrow(/row-level security|violates/i)
  })

  it('il titolare di B non puo modificare una pratica di A', async () => {
    const affected = await asUser(USER_B_OWNER, async (s) => {
      const result = await s.query(
        `update public.bookings set title = 'Modificata da fuori' where agency_id = $1`,
        [AGENCY_A],
      )
      return result.rowCount
    })
    expect(affected).toBe(0)
  })

  it('il titolare di B non puo leggere il registro attivita di A', async () => {
    const rows = await asUser(USER_B_OWNER, async (s) => {
      const result = await s.query('select id from public.activity_log where agency_id = $1', [AGENCY_A])
      return result.rowCount
    })
    expect(rows).toBe(0)
  })

  it('senza autenticazione non si legge nulla', async () => {
    // Al ruolo anonimo non e' concesso neppure il SELECT sulle tabelle:
    // la richiesta si ferma prima ancora di arrivare alle policy.
    await expect(
      asUser(null, async (s) => {
        await s.query('select id from public.bookings')
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('ruoli dentro la stessa agenzia', () => {
  it('l operatore vede solo le proprie pratiche', async () => {
    const { visible, own } = await asUser(USER_A_OPERATOR, async (s) => {
      const all = await s.query<{ n: string }>('select count(*)::text as n from public.bookings')
      const mine = await s.query<{ n: string }>(
        `select count(*)::text as n from public.bookings
         where owner_id = app.current_membership_id($1)`,
        [AGENCY_A],
      )
      return { visible: Number(all.rows[0]?.n), own: Number(mine.rows[0]?.n) }
    })
    expect(own).toBeGreaterThan(0)
    expect(visible).toBe(own)
  })

  it('il titolare vede piu pratiche dell operatore', async () => {
    const asOwner = await asUser(USER_A_OWNER, async (s) => {
      const r = await s.query<{ n: string }>('select count(*)::text as n from public.bookings')
      return Number(r.rows[0]?.n)
    })
    const asOperator = await asUser(USER_A_OPERATOR, async (s) => {
      const r = await s.query<{ n: string }>('select count(*)::text as n from public.bookings')
      return Number(r.rows[0]?.n)
    })
    expect(asOwner).toBeGreaterThan(asOperator)
  })

  it('l operatore non puo registrare incassi (competenza amministrativa)', async () => {
    await expect(
      asUser(USER_A_OPERATOR, async (s) => {
        const booking = await s.query<{ id: string; customer_id: string }>(
          'select id, customer_id from public.bookings limit 1',
        )
        await s.query(
          `insert into public.payments_in (agency_id, booking_id, customer_id, kind, method, amount_cents)
           values ($1, $2, $3, 'acconto', 'contanti', 10000)`,
          [AGENCY_A, booking.rows[0]?.id, booking.rows[0]?.customer_id],
        )
      }),
    ).rejects.toThrow(/row-level security/i)
  })

  it('l amministrativo puo registrare incassi', async () => {
    const inserted = await asUser(USER_A_ADMIN, async (s) => {
      const booking = await s.query<{ id: string; customer_id: string }>(
        'select id, customer_id from public.bookings limit 1',
      )
      const result = await s.query(
        `insert into public.payments_in (agency_id, booking_id, customer_id, kind, method, amount_cents)
         values ($1, $2, $3, 'acconto', 'contanti', 10000) returning id`,
        [AGENCY_A, booking.rows[0]?.id, booking.rows[0]?.customer_id],
      )
      return result.rowCount
    })
    expect(inserted).toBe(1)
  })

  it('la sola lettura legge ma non scrive', async () => {
    const readable = await asUser(USER_A_READONLY, async (s) => {
      const result = await s.query<{ n: string }>('select count(*)::text as n from public.bookings')
      return Number(result.rows[0]?.n)
    })
    expect(readable).toBeGreaterThan(50)

    await expect(
      asUser(USER_A_READONLY, async (s) => {
        await s.query(
          `insert into public.customers (agency_id, kind, first_name, last_name)
           values ($1, 'privato', 'Test', 'Vietato')`,
          [AGENCY_A],
        )
      }),
    ).rejects.toThrow(/row-level security/i)
  })

  it('solo il titolare modifica le impostazioni dell agenzia', async () => {
    const asAdmin = await asUser(USER_A_ADMIN, async (s) => {
      const result = await s.query(
        'update public.agency_settings set deposit_due_days = 5 where agency_id = $1',
        [AGENCY_A],
      )
      return result.rowCount
    })
    expect(asAdmin).toBe(0)

    const asOwner = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query(
        'update public.agency_settings set deposit_due_days = 5 where agency_id = $1',
        [AGENCY_A],
      )
      return result.rowCount
    })
    expect(asOwner).toBe(1)
  })
})

describe('registro attivita immutabile', () => {
  it('un utente autenticato non tocca nemmeno una riga di log', async () => {
    // Nessuna policy di UPDATE/DELETE: le righe non sono neppure selezionabili
    // per la modifica, quindi la scrittura non ha effetto.
    const { updated, deleted } = await asUser(USER_A_OWNER, async (s) => {
      const u = await s.query(`update public.activity_log set summary = 'alterato' where agency_id = $1`, [AGENCY_A])
      const d = await s.query('delete from public.activity_log where agency_id = $1', [AGENCY_A])
      return { updated: u.rowCount, deleted: d.rowCount }
    })
    expect(updated).toBe(0)
    expect(deleted).toBe(0)
  })

  it('nemmeno con i privilegi di servizio si altera il log', async () => {
    // Il trigger protegge anche chi scavalca la RLS (service role, manutenzione).
    const client = await adminClient()
    try {
      await client.query('begin')
      await expect(
        client.query(`update public.activity_log set summary = 'alterato' where agency_id = $1`, [AGENCY_A]),
      ).rejects.toThrow(/immutabile/i)
    } finally {
      await client.query('rollback')
      await client.end()
    }
  })

  it('il log resta scrivibile in append per gli utenti dell agenzia', async () => {
    const inserted = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query(
        `select public.log_activity($1, 'modifica', 'bookings', null, 'PR-TEST', 'Verifica di scrittura') as id`,
        [AGENCY_A],
      )
      return result.rows[0]
    })
    expect(inserted).toBeTruthy()
  })
})
