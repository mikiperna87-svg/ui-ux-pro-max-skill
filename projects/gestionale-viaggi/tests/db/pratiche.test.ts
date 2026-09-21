import { beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  AGENCY_A,
  AGENCY_B,
  asUser,
  seedTenants,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_B_OWNER,
} from './helpers'

/**
 * Conferma, annullamento e viste salvate verificati sul database reale, con le
 * policy attive: sono le operazioni che toccano più tabelle insieme, quindi
 * quelle in cui una transazione mancata si nota mesi dopo.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)


/** Apre una pratica di prova con una riga di servizio, dentro la transazione. */
async function apriPratica(
  session: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  { prezzo = 200_000, partenza = '2030-06-01' } = {},
): Promise<string> {
  // I parametri dell'agenzia si fissano qui dentro: la transazione viene
  // annullata a fine test, e la prova non dipende da quello che un altro test
  // ha impostato nel frattempo.
  await session.query(
    `update public.agency_settings
     set deposit_percent_bps = 3000, deposit_due_days = 3,
         balance_due_days_before_departure = 30
     where agency_id = $1`,
    [AGENCY_A],
  )

  const cliente = await session.query(
    `select id from public.customers where agency_id = $1 limit 1`,
    [AGENCY_A],
  )
  const pratica = await session.query(
    `insert into public.bookings (agency_id, customer_id, title, destination,
                                  departure_date, return_date, pax_count, sale_type)
     values ($1, $2, 'Pratica di collaudo', 'Isole Lofoten', $3, ($3::date + 7), 2, 'organizzazione')
     returning id`,
    [AGENCY_A, cliente.rows[0]?.id, partenza],
  )
  const bookingId = String(pratica.rows[0]?.id)

  await session.query(
    `insert into public.booking_services (agency_id, booking_id, service_type, description,
                                          quantity, unit_cost_cents, unit_price_cents, vat_bps, vat_regime)
     values ($1, $2, 'pacchetto', 'Pacchetto completo', 1, $3, $4, 2200, 'art_74_ter')`,
    [AGENCY_A, bookingId, Math.round(prezzo * 0.7), prezzo],
  )
  return bookingId
}

describe('numerazione delle pratiche', () => {
  it('assegna un codice progressivo senza buchi', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const uno = await apriPratica(s)
      const due = await apriPratica(s)
      const codici = await s.query(
        `select code, year, number from public.bookings where id = any($1) order by number`,
        [[uno, due]],
      )
      const [primo, secondo] = codici.rows as { code: string; year: number; number: number }[]
      expect(secondo!.number).toBe(primo!.number + 1)
      expect(primo!.code).toMatch(/^\d{4}\/\d{4}$/)
    })
  })
})

describe('conferma della pratica', () => {
  it('genera acconto, saldo e controllo documenti', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s, { prezzo: 200_000, partenza: '2030-06-01' })
      await s.query('select public.confirm_booking($1)', [bookingId])

      const rate = await s.query(
        `select kind, due_date::text, amount_cents::int as amount_cents from public.installments
         where booking_id = $1 and deleted_at is null order by sort_order`,
        [bookingId],
      )
      const righe = rate.rows as { kind: string; due_date: string; amount_cents: number }[]

      expect(righe.map((riga) => riga.kind)).toEqual(['acconto', 'saldo'])
      // Acconto del 30% sul venduto, saldo per differenza: insieme fanno il totale.
      expect(righe[0]!.amount_cents).toBe(60_000)
      expect(righe[0]!.amount_cents + righe[1]!.amount_cents).toBe(200_000)
      // Saldo 30 giorni prima della partenza, come da impostazioni dell'agenzia.
      expect(righe[1]!.due_date).toBe('2030-05-02')

      const task = await s.query(
        `select count(*)::int as n from public.tasks
         where booking_id = $1 and kind = 'verifica_documenti' and deleted_at is null`,
        [bookingId],
      )
      expect((task.rows[0] as { n: number }).n).toBe(1)
    })
  })

  it('riconfermare non duplica le scadenze: le allinea', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s, { prezzo: 100_000 })
      await s.query('select public.confirm_booking($1)', [bookingId])

      // Il prezzo cambia: la riconferma deve aggiornare gli importi, non affiancarne altri.
      await s.query(
        `update public.booking_services set unit_price_cents = 300000 where booking_id = $1`,
        [bookingId],
      )
      await s.query('select public.confirm_booking($1)', [bookingId])

      const rate = await s.query(
        `select kind, amount_cents::int as amount_cents from public.installments
         where booking_id = $1 and deleted_at is null order by sort_order`,
        [bookingId],
      )
      expect(rate.rows).toHaveLength(2)
      expect((rate.rows[0] as { amount_cents: number }).amount_cents).toBe(90_000)

      const task = await s.query(
        `select count(*)::int as n from public.tasks where booking_id = $1 and deleted_at is null`,
        [bookingId],
      )
      expect((task.rows[0] as { n: number }).n).toBe(1)
    })
  })

  it('riconfermare una pratica partita non la fa tornare indietro', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await s.query('select public.confirm_booking($1)', [bookingId])
      await s.query(`update public.bookings set status = 'partita' where id = $1`, [bookingId])

      await s.query('select public.confirm_booking($1)', [bookingId])

      const stato = await s.query(`select status::text from public.bookings where id = $1`, [
        bookingId,
      ])
      expect((stato.rows[0] as { status: string }).status).toBe('partita')
    })
  })

  it('rifiuta la conferma di una pratica senza importi', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const cliente = await s.query(
        `select id from public.customers where agency_id = $1 limit 1`,
        [AGENCY_A],
      )
      const vuota = await s.query(
        `insert into public.bookings (agency_id, customer_id, title, destination, sale_type)
         values ($1, $2, 'Senza servizi', 'Ovunque', 'intermediazione') returning id`,
        [AGENCY_A, cliente.rows[0]?.id],
      )
      await expect(
        s.query('select public.confirm_booking($1)', [vuota.rows[0]?.id]),
      ).rejects.toThrow(/almeno una riga di servizio/i)
    })
  })

  it('una pratica annullata non si può confermare', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await s.query('select public.cancel_booking($1, $2, $3)', [bookingId, 'Rinuncia', 0])
      await expect(s.query('select public.confirm_booking($1)', [bookingId])).rejects.toThrow(
        /annullata/i,
      )
    })
  })
})

describe('annullamento della pratica', () => {
  it('pretende un motivo', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await expect(
        s.query('select public.cancel_booking($1, $2, $3)', [bookingId, '  ', 0]),
      ).rejects.toThrow(/motivo/i)
    })
  })

  it('registra motivo e penale senza cancellare la pratica', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await s.query('select public.cancel_booking($1, $2, $3)', [
        bookingId,
        'Rinuncia del cliente per motivi di salute',
        25_000,
      ])

      const pratica = await s.query(
        `select status::text, cancellation_reason,
                cancellation_penalty_cents::int as cancellation_penalty_cents, deleted_at
         from public.bookings where id = $1`,
        [bookingId],
      )
      const riga = pratica.rows[0] as {
        status: string
        cancellation_reason: string
        cancellation_penalty_cents: number
        deleted_at: string | null
      }
      expect(riga.status).toBe('annullata')
      expect(riga.cancellation_penalty_cents).toBe(25_000)
      expect(riga.deleted_at).toBeNull()
    })
  })

  it('toglie le scadenze future e chiude i task aperti', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s, { partenza: '2030-09-01' })
      await s.query('select public.confirm_booking($1)', [bookingId])
      await s.query('select public.cancel_booking($1, $2, $3)', [bookingId, 'Volo cancellato', 0])

      const rate = await s.query(
        `select count(*)::int as n from public.installments
         where booking_id = $1 and deleted_at is null`,
        [bookingId],
      )
      expect((rate.rows[0] as { n: number }).n).toBe(0)

      const aperti = await s.query(
        `select count(*)::int as n from public.tasks
         where booking_id = $1 and status in ('aperto', 'in_corso') and deleted_at is null`,
        [bookingId],
      )
      expect((aperti.rows[0] as { n: number }).n).toBe(0)
    })
  })

  it('la penale non può essere negativa', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await expect(
        s.query('select public.cancel_booking($1, $2, $3)', [bookingId, 'Motivo valido', -100]),
      ).rejects.toThrow(/negativa/i)
    })
  })
})

describe('elenco delle pratiche e visibilità', () => {
  it('la vista porta cliente, margine e stato di pagamento', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s, { prezzo: 200_000 })
      const riga = await s.query(
        `select customer_name, revenue_cents::int as revenue_cents, cost_cents::int as cost_cents,
                margin_cents::int as margin_cents, payment_state::text,
                services_count, passengers_count
         from public.booking_list where id = $1`,
        [bookingId],
      )
      const dati = riga.rows[0] as {
        customer_name: string
        revenue_cents: number
        cost_cents: number
        margin_cents: number
        payment_state: string
        services_count: number
      }
      expect(dati.customer_name).toBeTruthy()
      expect(dati.revenue_cents).toBe(200_000)
      expect(dati.margin_cents).toBe(200_000 - dati.cost_cents)
      expect(dati.payment_state).toBe('non_pagata')
      expect(dati.services_count).toBe(1)
    })
  })

  it('gli importi sono interi, non stringhe: nessun numeric verso il client', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const riga = await s.query(
        `select pg_typeof(revenue_cents)::text as tipo_ricavi,
                pg_typeof(margin_cents)::text as tipo_margine
         from public.booking_list limit 1`,
      )
      const tipi = riga.rows[0] as { tipo_ricavi: string; tipo_margine: string }
      expect(tipi.tipo_ricavi).toBe('bigint')
      expect(tipi.tipo_margine).toBe('bigint')
    })
  })

  it('un operatore vede solo le pratiche di cui è titolare', async () => {
    const admin = await adminClient()
    const { rows } = await admin.query(
      `select count(*)::int as n from public.bookings
       where agency_id = $1 and deleted_at is null`,
      [AGENCY_A],
    )
    await admin.end()
    const totale = (rows[0] as { n: number }).n

    const viste = await asUser(USER_A_OPERATOR, async (s) => {
      const risultato = await s.query(`select count(*)::int as n from public.booking_list`)
      return (risultato.rows[0] as { n: number }).n
    })

    expect(viste).toBeGreaterThan(0)
    expect(viste).toBeLessThan(totale)
  })

  it('l’agenzia B non vede nessuna pratica dell’agenzia A', async () => {
    const viste = await asUser(USER_B_OWNER, async (s) => {
      const risultato = await s.query(`select count(*)::int as n from public.booking_list`)
      return (risultato.rows[0] as { n: number }).n
    })
    // L'agenzia B non ha pratiche proprie: se ne vedesse una, sarebbe di A.
    expect(viste).toBe(0)

    const propria = await asUser(USER_B_OWNER, async (s) => {
      const risultato = await s.query(
        `select count(*)::int as n from public.agencies where id = $1`,
        [AGENCY_B],
      )
      return (risultato.rows[0] as { n: number }).n
    })
    expect(propria).toBe(1)
  })

  it('l’agenzia B non può confermare una pratica dell’agenzia A', async () => {
    const admin = await adminClient()
    const { rows } = await admin.query(
      `select id from public.bookings where agency_id = $1 and deleted_at is null limit 1`,
      [AGENCY_A],
    )
    await admin.end()
    const bookingId = (rows[0] as { id: string }).id

    await asUser(USER_B_OWNER, async (s) => {
      await expect(s.query('select public.confirm_booking($1)', [bookingId])).rejects.toThrow(
        /non trovata/i,
      )
    })
  })
})

describe('viste salvate degli elenchi', () => {
  it('una vista personale non si vede fra i colleghi', async () => {
    const admin = await adminClient()
    const { rows } = await admin.query(
      `select id from public.memberships where agency_id = $1 and user_id = $2`,
      [AGENCY_A, USER_A_OWNER],
    )
    const membershipId = (rows[0] as { id: string }).id
    await admin.query(
      `insert into public.saved_views (agency_id, membership_id, entity, name, query)
       values ($1, $2, 'pratiche', 'Solo mie', 'stato=confermata')`,
      [AGENCY_A, membershipId],
    )
    await admin.end()

    const daTitolare = await asUser(USER_A_OWNER, async (s) => {
      const r = await s.query(`select count(*)::int as n from public.saved_views where name = 'Solo mie'`)
      return (r.rows[0] as { n: number }).n
    })
    const daOperatore = await asUser(USER_A_OPERATOR, async (s) => {
      const r = await s.query(`select count(*)::int as n from public.saved_views where name = 'Solo mie'`)
      return (r.rows[0] as { n: number }).n
    })

    expect(daTitolare).toBe(1)
    expect(daOperatore).toBe(0)

    const pulizia = await adminClient()
    await pulizia.query(`delete from public.saved_views where name = 'Solo mie'`)
    await pulizia.end()
  })

  it('una vista condivisa la vedono tutti in agenzia', async () => {
    const admin = await adminClient()
    await admin.query(
      `insert into public.saved_views (agency_id, membership_id, entity, name, query)
       values ($1, null, 'pratiche', 'Partenze imminenti', 'periodo=in_partenza')`,
      [AGENCY_A],
    )
    await admin.end()

    const daOperatore = await asUser(USER_A_OPERATOR, async (s) => {
      const r = await s.query(
        `select count(*)::int as n from public.saved_views where name = 'Partenze imminenti'`,
      )
      return (r.rows[0] as { n: number }).n
    })
    const daAltraAgenzia = await asUser(USER_B_OWNER, async (s) => {
      const r = await s.query(
        `select count(*)::int as n from public.saved_views where name = 'Partenze imminenti'`,
      )
      return (r.rows[0] as { n: number }).n
    })

    expect(daOperatore).toBe(1)
    expect(daAltraAgenzia).toBe(0)

    const pulizia = await adminClient()
    await pulizia.query(`delete from public.saved_views where name = 'Partenze imminenti'`)
    await pulizia.end()
  })

  it('un operatore non può creare una vista condivisa', async () => {
    await asUser(USER_A_OPERATOR, async (s) => {
      await expect(
        s.query(
          `insert into public.saved_views (agency_id, membership_id, entity, name, query)
           values ($1, null, 'pratiche', 'Tentativo', '')`,
          [AGENCY_A],
        ),
      ).rejects.toThrow(/row-level security/i)
    })
  })
})

describe('ricerca sulle pratiche', () => {
  it('trova ignorando accenti e maiuscole', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const bookingId = await apriPratica(s)
      await s.query(`update public.bookings set destination = 'Città del Capo' where id = $1`, [
        bookingId,
      ])
      const trovate = await s.query(
        `select count(*)::int as n from public.booking_list
         where id = $1 and search_text like '%citta del capo%'`,
        [bookingId],
      )
      expect((trovate.rows[0] as { n: number }).n).toBe(1)
    })
  })
})
