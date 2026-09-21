import { beforeAll, describe, expect, it } from 'vitest'
import {
  AGENCY_A,
  asUser,
  seedTenants,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_B_OWNER,
} from './helpers'

/**
 * I report, verificati contro il database reale con le policy attive.
 *
 * Un report sbagliato non va in errore: mostra un numero plausibile e lo
 * mostra per mesi. Qui ogni aggregato viene confrontato con la somma calcolata
 * a parte sulle stesse righe, e si controlla che la RLS continui a valere
 * dentro le funzioni — è l'unica cosa che impedisce a un'agenzia di leggere i
 * numeri di un'altra e a un operatore di leggere quelli dei colleghi.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

type Sessione = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

const PERIODO = ['2026-01-01', '2026-12-31'] as const
const numero = (value: unknown) => Number(value ?? 0)

/** Una pratica di prova nel periodo, con una riga di servizio. */
async function apriPratica(
  s: Sessione,
  {
    destinazione = 'Isole Lofoten',
    partenza = '2026-07-01',
    prezzo = 200_000,
    costo = 140_000,
  } = {},
): Promise<string> {
  const cliente = await s.query(`select id from public.customers where agency_id = $1 limit 1`, [
    AGENCY_A,
  ])
  const pratica = await s.query(
    `insert into public.bookings (agency_id, customer_id, title, destination,
                                 departure_date, return_date, pax_count, sale_type)
     values ($1, $2, 'Pratica di collaudo', $3, $4, ($4::date + 7), 2, 'organizzazione')
     returning id`,
    [AGENCY_A, cliente.rows[0]?.id, destinazione, partenza],
  )
  const bookingId = String(pratica.rows[0]?.id)

  await s.query(
    `insert into public.booking_services (agency_id, booking_id, service_type, description,
                                          quantity, unit_cost_cents, unit_price_cents, vat_bps, vat_regime)
     values ($1, $2, 'pacchetto', 'Pacchetto completo', 1, $3, $4, 2200, 'art_74_ter')`,
    [AGENCY_A, bookingId, costo, prezzo],
  )
  return bookingId
}

describe('report per operatore', () => {
  it('somma esattamente le pratiche del periodo, escluse le annullate', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const report = await s.query(
        `select coalesce(sum(revenue_cents), 0)::bigint as venduto,
                coalesce(sum(margin_cents), 0)::bigint as margine,
                coalesce(sum(bookings_count), 0)::bigint as pratiche
         from public.report_by_owner($1, $2)`,
        [...PERIODO],
      )
      const diretto = await s.query(
        `select coalesce(sum(f.revenue_cents), 0)::bigint as venduto,
                coalesce(sum(f.margin_cents), 0)::bigint as margine,
                count(*)::bigint as pratiche
         from public.bookings b
         join public.booking_financials f on f.booking_id = b.id
         where b.deleted_at is null
           and b.status <> 'annullata'
           and b.departure_date between $1 and $2`,
        [...PERIODO],
      )

      expect(report.rows[0]).toEqual(diretto.rows[0])
      expect(numero(report.rows[0]?.pratiche)).toBeGreaterThan(0)
    })
  })

  it('una pratica annullata si conta a parte e non gonfia il venduto', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const prima = await s.query(
        `select coalesce(sum(revenue_cents), 0)::bigint as venduto,
                coalesce(sum(cancelled_count), 0)::bigint as annullate
         from public.report_by_owner($1, $2)`,
        [...PERIODO],
      )

      const bookingId = await apriPratica(s, { prezzo: 500_000 })
      await s.query(
        `update public.bookings
         set status = 'annullata', cancellation_reason = 'Prova di report', cancelled_at = now()
         where id = $1`,
        [bookingId],
      )

      const dopo = await s.query(
        `select coalesce(sum(revenue_cents), 0)::bigint as venduto,
                coalesce(sum(cancelled_count), 0)::bigint as annullate
         from public.report_by_owner($1, $2)`,
        [...PERIODO],
      )

      expect(numero(dopo.rows[0]?.venduto)).toBe(numero(prima.rows[0]?.venduto))
      expect(numero(dopo.rows[0]?.annullate)).toBe(numero(prima.rows[0]?.annullate) + 1)
    })
  })

  it('il margine percentuale è quello del venduto della riga', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const righe = await s.query(
        `select revenue_cents, margin_cents, margin_bps
         from public.report_by_owner($1, $2)
         where revenue_cents > 0`,
        [...PERIODO],
      )

      expect(righe.rows.length).toBeGreaterThan(0)
      for (const riga of righe.rows) {
        const atteso = Math.round((numero(riga.margin_cents) * 10_000) / numero(riga.revenue_cents))
        expect(numero(riga.margin_bps)).toBe(atteso)
      }
    })
  })
})

describe('report per destinazione', () => {
  it('riunisce le grafie diverse della stessa meta', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const prima = await s.query(
        `select bookings_count, revenue_cents from public.report_by_destination($1, $2, 100)
         where lower(destination) = 'santorini e mykonos'`,
        [...PERIODO],
      )
      const partenza = numero(prima.rows[0]?.bookings_count)

      // Stessa meta, scritta in minuscolo e con uno spazio di troppo: per il
      // report deve restare una riga sola.
      await apriPratica(s, { destinazione: '  santorini e mykonos ', prezzo: 300_000 })

      const dopo = await s.query(
        `select destination, bookings_count, revenue_cents
         from public.report_by_destination($1, $2, 100)
         where lower(btrim(destination)) = 'santorini e mykonos'`,
        [...PERIODO],
      )

      expect(dopo.rows).toHaveLength(1)
      expect(numero(dopo.rows[0]?.bookings_count)).toBe(partenza + 1)
      // L'etichetta mostrata è la grafia usata più spesso, non l'ultima inserita.
      expect(dopo.rows[0]?.destination).toBe('Santorini e Mykonos')
      expect(numero(dopo.rows[0]?.revenue_cents)).toBe(
        numero(prima.rows[0]?.revenue_cents) + 300_000,
      )
    })
  })

  it('il totale delle destinazioni è il venduto del periodo', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const destinazioni = await s.query(
        `select coalesce(sum(revenue_cents), 0)::bigint as venduto
         from public.report_by_destination($1, $2, 1000)`,
        [...PERIODO],
      )
      const operatori = await s.query(
        `select coalesce(sum(revenue_cents), 0)::bigint as venduto
         from public.report_by_owner($1, $2)`,
        [...PERIODO],
      )

      expect(destinazioni.rows[0]).toEqual(operatori.rows[0])
    })
  })
})

describe('report per fornitore', () => {
  it('attribuisce a ciascuno le sue righe di servizio', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const riga = await s.query(
        `select supplier_id, cost_cents, revenue_cents, commission_cents, margin_cents
         from public.report_by_supplier($1, $2)
         order by cost_cents desc
         limit 1`,
        [...PERIODO],
      )
      const fornitore = riga.rows[0]
      expect(fornitore).toBeDefined()

      const diretto = await s.query(
        `select coalesce(sum(sv.total_cost_cents), 0)::bigint as costo,
                coalesce(sum(sv.total_price_cents), 0)::bigint as venduto,
                coalesce(sum(sv.commission_cents), 0)::bigint as commissioni
         from public.booking_services sv
         join public.bookings b on b.id = sv.booking_id
         where sv.deleted_at is null
           and sv.supplier_id = $3
           and b.deleted_at is null
           and b.status <> 'annullata'
           and b.departure_date between $1 and $2`,
        [...PERIODO, fornitore?.supplier_id],
      )

      expect(numero(fornitore?.cost_cents)).toBe(numero(diretto.rows[0]?.costo))
      expect(numero(fornitore?.revenue_cents)).toBe(numero(diretto.rows[0]?.venduto))
      expect(numero(fornitore?.margin_cents)).toBe(
        numero(diretto.rows[0]?.venduto) -
          numero(diretto.rows[0]?.costo) +
          numero(diretto.rows[0]?.commissioni),
      )
    })
  })

  it('il da pagare conta solo i pagamenti ancora aperti', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const righe = await s.query(
        `select supplier_id, due_cents, paid_cents from public.report_by_supplier($1, $2)`,
        [...PERIODO],
      )
      expect(righe.rows.length).toBeGreaterThan(0)

      for (const riga of righe.rows) {
        const diretto = await s.query(
          `select
             coalesce(sum(p.amount_cents) filter (where p.status in ('da_pagare', 'programmato')), 0)::bigint as aperti,
             coalesce(sum(p.amount_cents) filter (where p.status = 'pagato'), 0)::bigint as pagati
           from public.payments_out p
           join public.bookings b on b.id = p.booking_id
           where p.deleted_at is null
             and p.supplier_id = $3
             and b.deleted_at is null
             and b.status <> 'annullata'
             and b.departure_date between $1 and $2`,
          [...PERIODO, riga.supplier_id],
        )
        expect(numero(riga.due_cents)).toBe(numero(diretto.rows[0]?.aperti))
        expect(numero(riga.paid_cents)).toBe(numero(diretto.rows[0]?.pagati))
      }
    })
  })
})

describe('conversione dei preventivi', () => {
  it('misura gli accettati sugli inviati, non sui creati', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const righe = await s.query(
        `select quotes_count, sent_count, accepted_count, conversion_bps
         from public.report_quotes_by_owner('2025-01-01', '2026-12-31')`,
      )
      expect(righe.rows.length).toBeGreaterThan(0)

      for (const riga of righe.rows) {
        const inviati = numero(riga.sent_count)
        const attesa =
          inviati === 0 ? 0 : Math.round((numero(riga.accepted_count) * 10_000) / inviati)
        expect(numero(riga.conversion_bps)).toBe(attesa)
        expect(inviati).toBeLessThanOrEqual(numero(riga.quotes_count))
      }
    })
  })

  it('conta il preventivo nel giorno di Roma, non in quello di Greenwich', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const cliente = await s.query(`select id from public.customers where agency_id = $1 limit 1`, [
        AGENCY_A,
      ])
      // Le 23:30 del 31 dicembre a Greenwich sono le 00:30 del primo gennaio a
      // Roma: per l'agenzia questo preventivo è del 2027, e il report deve
      // dirlo come lo direbbe la segreteria.
      await s.query(
        `insert into public.quotes (agency_id, customer_id, title, destination, pax_count,
                                    status, created_at, sent_at)
         values ($1, $2, 'Preventivo di capodanno', 'Vienna', 2, 'inviato',
                 '2026-12-31T23:30:00Z', '2026-12-31T23:30:00Z')`,
        [AGENCY_A, cliente.rows[0]?.id],
      )

      const dicembre = await s.query(
        `select coalesce(sum(quotes_count), 0)::bigint as quanti
         from public.report_quotes_by_owner('2026-12-01', '2026-12-31')`,
      )
      const gennaio = await s.query(
        `select coalesce(sum(quotes_count), 0)::bigint as quanti
         from public.report_quotes_by_owner('2027-01-01', '2027-01-31')`,
      )

      expect(numero(dicembre.rows[0]?.quanti)).toBe(0)
      expect(numero(gennaio.rows[0]?.quanti)).toBe(1)
    })
  })
})

describe('mesi del periodo', () => {
  it('restituisce anche i mesi senza partenze', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const mesi = await s.query(`select * from public.report_monthly('2026-01-01', '2026-12-31')`)
      expect(mesi.rows).toHaveLength(12)
      expect(mesi.rows[0]?.month_start).toBeDefined()
      // Un mese vuoto vale zero, non manca: il grafico non deve saltare una barra.
      for (const mese of mesi.rows) {
        expect(numero(mese.revenue_cents)).toBeGreaterThanOrEqual(0)
      }
    })
  })
})

describe('confini fra agenzie e fra colleghi', () => {
  it('un’altra agenzia non vede nulla', async () => {
    await asUser(USER_B_OWNER, async (s) => {
      const operatori = await s.query(`select * from public.report_by_owner($1, $2)`, [...PERIODO])
      const destinazioni = await s.query(`select * from public.report_by_destination($1, $2, 100)`, [
        ...PERIODO,
      ])
      const fornitori = await s.query(`select * from public.report_by_supplier($1, $2)`, [...PERIODO])

      expect(operatori.rows).toHaveLength(0)
      expect(destinazioni.rows).toHaveLength(0)
      expect(fornitori.rows).toHaveLength(0)
    })
  })

  it('un operatore vede soltanto le proprie pratiche', async () => {
    const tutte = await asUser(USER_A_OWNER, async (s) => {
      const righe = await s.query(`select owner_id, revenue_cents from public.report_by_owner($1, $2)`, [
        ...PERIODO,
      ])
      return righe.rows
    })

    await asUser(USER_A_OPERATOR, async (s) => {
      const righe = await s.query(
        `select owner_id, owner_name, revenue_cents from public.report_by_owner($1, $2)`,
        [...PERIODO],
      )
      const suo = await s.query(
        `select id from public.memberships where agency_id = $1 and role = 'operatore' limit 1`,
        [AGENCY_A],
      )

      expect(tutte.length).toBeGreaterThan(1)
      expect(righe.rows).toHaveLength(1)
      expect(righe.rows[0]?.owner_id).toBe(suo.rows[0]?.id)
      expect(righe.rows[0]?.owner_name).toBe('Sara Bonomi')
    })
  })
})
