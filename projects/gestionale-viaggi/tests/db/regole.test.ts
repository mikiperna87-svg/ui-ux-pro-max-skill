import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, AGENCY_A, asUser, USER_A_ADMIN, USER_A_OWNER } from './helpers'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

const openClients: pg.Client[] = []

afterAll(async () => {
  await Promise.all(openClients.map((client) => client.end().catch(() => undefined)))
})

async function newClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  openClients.push(client)
  return client
}

describe('numerazione dei documenti', () => {
  it('assegna numeri consecutivi nello stesso anno', async () => {
    const numbers = await asUser(USER_A_OWNER, async (s) => {
      const customer = await s.query<{ id: string }>('select id from public.customers limit 1')
      const created: number[] = []
      for (let index = 0; index < 3; index += 1) {
        const result = await s.query<{ number: number; code: string }>(
          `insert into public.bookings (agency_id, customer_id, title, destination, departure_date)
           values ($1, $2, 'Pratica di prova', 'Lisbona', date '2030-05-10')
           returning number, code`,
          [AGENCY_A, customer.rows[0]?.id],
        )
        created.push(result.rows[0]?.number ?? 0)
      }
      return created
    })
    expect(numbers[1]).toBe((numbers[0] ?? 0) + 1)
    expect(numbers[2]).toBe((numbers[1] ?? 0) + 1)
  })

  it('formatta il riferimento come ANNO/NNNN', async () => {
    const code = await asUser(USER_A_OWNER, async (s) => {
      const customer = await s.query<{ id: string }>('select id from public.customers limit 1')
      const result = await s.query<{ code: string }>(
        `insert into public.bookings (agency_id, customer_id, title, destination, departure_date)
         values ($1, $2, 'Pratica di prova', 'Oslo', date '2031-02-03')
         returning code`,
        [AGENCY_A, customer.rows[0]?.id],
      )
      return result.rows[0]?.code
    })
    expect(code).toMatch(/^2031\/\d{4}$/)
  })

  it('non lascia buchi quando una transazione viene annullata', async () => {
    // asUser annulla sempre la transazione: il contatore torna indietro con essa.
    const first = await asUser(USER_A_OWNER, async (s) => {
      const customer = await s.query<{ id: string }>('select id from public.customers limit 1')
      const result = await s.query<{ number: number }>(
        `insert into public.bookings (agency_id, customer_id, title, destination, departure_date)
         values ($1, $2, 'Annullata', 'Praga', date '2032-06-01') returning number`,
        [AGENCY_A, customer.rows[0]?.id],
      )
      return result.rows[0]?.number
    })

    const second = await asUser(USER_A_OWNER, async (s) => {
      const customer = await s.query<{ id: string }>('select id from public.customers limit 1')
      const result = await s.query<{ number: number }>(
        `insert into public.bookings (agency_id, customer_id, title, destination, departure_date)
         values ($1, $2, 'Successiva', 'Praga', date '2032-06-01') returning number`,
        [AGENCY_A, customer.rows[0]?.id],
      )
      return result.rows[0]?.number
    })

    expect(second).toBe(first)
  })

  it('due transazioni concorrenti non ottengono lo stesso numero', async () => {
    const a = await newClient()
    const b = await newClient()

    await a.query('begin')
    const firstResult = await a.query<{ n: number }>(
      `select app.next_document_number($1, 'pratica', 2035) as n`,
      [AGENCY_A],
    )
    const first = firstResult.rows[0]?.n ?? 0

    await b.query('begin')
    // Questa chiamata resta in attesa del lock di riga finche' A non chiude.
    const pending = b.query<{ n: number }>(
      `select app.next_document_number($1, 'pratica', 2035) as n`,
      [AGENCY_A],
    )

    await a.query('commit')
    const secondResult = await pending
    const second = secondResult.rows[0]?.n ?? 0
    await b.query('rollback')

    expect(second).toBe(first + 1)

    const cleanup = await adminClient()
    await cleanup.query(`delete from public.document_counters where agency_id = $1 and year = 2035`, [AGENCY_A])
    await cleanup.end()
  })
})

describe('margine della pratica', () => {
  it('vale ricavi meno costi piu commissioni, per ogni pratica', async () => {
    const rows = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ discrepanze: string }>(`
        select count(*)::text as discrepanze
        from public.booking_financials f
        where f.margin_cents <> (f.revenue_cents - f.cost_cents + f.commission_cents)
      `)
      return Number(result.rows[0]?.discrepanze)
    })
    expect(rows).toBe(0)
  })

  it('si aggiorna appena cambia una riga di servizio', async () => {
    const { before, after } = await asUser(USER_A_OWNER, async (s) => {
      const booking = await s.query<{ id: string }>(
        `select b.id from public.bookings b
         join public.booking_services s on s.booking_id = b.id
         limit 1`,
      )
      const bookingId = booking.rows[0]?.id
      const start = await s.query<{ margin_cents: string }>(
        'select margin_cents from public.booking_financials where booking_id = $1',
        [bookingId],
      )
      await s.query(
        `update public.booking_services set unit_price_cents = unit_price_cents + 10000
         where booking_id = $1 and sort_order = 1`,
        [bookingId],
      )
      const end = await s.query<{ margin_cents: string }>(
        'select margin_cents from public.booking_financials where booking_id = $1',
        [bookingId],
      )
      return { before: Number(start.rows[0]?.margin_cents), after: Number(end.rows[0]?.margin_cents) }
    })
    expect(after).toBeGreaterThan(before)
  })

  it('la percentuale di margine e coerente con gli importi', async () => {
    const wrong = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>(`
        select count(*)::text as n
        from public.booking_financials
        where revenue_cents > 0
          and abs(margin_bps - round((margin_cents::numeric * 10000) / revenue_cents)) > 1
      `)
      return Number(result.rows[0]?.n)
    })
    expect(wrong).toBe(0)
  })
})

describe('stato di pagamento derivato', () => {
  it('una pratica interamente incassata risulta saldata', async () => {
    const state = await asUser(USER_A_ADMIN, async (s) => {
      const booking = await s.query<{ booking_id: string; balance_cents: string }>(
        `select booking_id, balance_cents from public.booking_financials
         where revenue_cents > 0 and payment_state <> 'saldata' limit 1`,
      )
      const bookingId = booking.rows[0]?.booking_id
      await s.query(
        `insert into public.payments_in (agency_id, booking_id, kind, method, amount_cents)
         values ($1, $2, 'saldo', 'bonifico', $3)`,
        [AGENCY_A, bookingId, Number(booking.rows[0]?.balance_cents)],
      )
      const result = await s.query<{ payment_state: string }>(
        'select payment_state from public.booking_financials where booking_id = $1',
        [bookingId],
      )
      return result.rows[0]?.payment_state
    })
    expect(state).toBe('saldata')
  })

  it('una rata scaduta e non coperta mette la pratica in ritardo', async () => {
    const state = await asUser(USER_A_ADMIN, async (s) => {
      // Una pratica con solo l'acconto versato: c'e' ancora denaro da incassare.
      const booking = await s.query<{ booking_id: string; revenue_cents: string }>(
        `select booking_id, revenue_cents from public.booking_financials
         where payment_state = 'acconto_versato' limit 1`,
      )
      const bookingId = booking.rows[0]?.booking_id
      const plan = await s.query<{ id: string }>(
        `insert into public.installment_plans (agency_id, booking_id, source)
         values ($1, $2, 'manuale')
         on conflict (booking_id) do update set source = 'manuale'
         returning id`,
        [AGENCY_A, bookingId],
      )
      await s.query('delete from public.installments where booking_id = $1', [bookingId])
      await s.query(
        `insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents)
         values ($1, $2, $3, 'saldo', current_date - 10, $4)`,
        [AGENCY_A, plan.rows[0]?.id, bookingId, Number(booking.rows[0]?.revenue_cents)],
      )
      const result = await s.query<{ payment_state: string }>(
        'select payment_state from public.booking_financials where booking_id = $1',
        [bookingId],
      )
      return result.rows[0]?.payment_state
    })
    expect(state).toBe('in_ritardo')
  })

  it('una pratica saldata non diventa in ritardo per una rata residua', async () => {
    // Se il cliente ha pagato tutto, una rata a piano non ancora chiusa non e'
    // un ritardo: lo stato guarda al denaro incassato, non alla forma del piano.
    const state = await asUser(USER_A_ADMIN, async (s) => {
      const booking = await s.query<{ booking_id: string }>(
        `select booking_id from public.booking_financials where payment_state = 'saldata' limit 1`,
      )
      const bookingId = booking.rows[0]?.booking_id
      const plan = await s.query<{ id: string }>(
        `insert into public.installment_plans (agency_id, booking_id, source)
         values ($1, $2, 'manuale')
         on conflict (booking_id) do update set source = 'manuale'
         returning id`,
        [AGENCY_A, bookingId],
      )
      await s.query(
        `insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents)
         values ($1, $2, $3, 'rata', current_date - 10, 5000)`,
        [AGENCY_A, plan.rows[0]?.id, bookingId],
      )
      const result = await s.query<{ payment_state: string }>(
        'select payment_state from public.booking_financials where booking_id = $1',
        [bookingId],
      )
      return result.rows[0]?.payment_state
    })
    expect(state).toBe('saldata')
  })
})

describe('regime IVA', () => {
  it('in regime ordinario scorpora l IVA dal corrispettivo', async () => {
    const client = await adminClient()
    const result = await client.query<{ iva: string; imponibile: string }>(
      `select app.line_vat_cents(122000, 0, 2200, 'ordinaria') as iva,
              app.line_taxable_cents(122000, 0, 2200, 'ordinaria') as imponibile`,
    )
    await client.end()
    expect(Number(result.rows[0]?.iva)).toBe(22_000)
    expect(Number(result.rows[0]?.imponibile)).toBe(100_000)
  })

  it('in regime 74-ter calcola l IVA sul margine, non sul corrispettivo', async () => {
    const client = await adminClient()
    // Corrispettivo 3.000 €, costi del viaggio 2.500 €: il margine e' 500 €,
    // l'IVA e' 500 * 22 / 122 = 90,16 €.
    const result = await client.query<{ iva: string; imponibile: string }>(
      `select app.line_vat_cents(300000, 250000, 2200, 'art_74_ter') as iva,
              app.line_taxable_cents(300000, 250000, 2200, 'art_74_ter') as imponibile`,
    )
    await client.end()
    expect(Number(result.rows[0]?.iva)).toBe(9016)
    expect(Number(result.rows[0]?.imponibile)).toBe(40_984)
  })

  it('in 74-ter un margine negativo non genera IVA a credito', async () => {
    const client = await adminClient()
    const result = await client.query<{ iva: string; imponibile: string }>(
      `select app.line_vat_cents(200000, 250000, 2200, 'art_74_ter') as iva,
              app.line_taxable_cents(200000, 250000, 2200, 'art_74_ter') as imponibile`,
    )
    await client.end()
    expect(Number(result.rows[0]?.iva)).toBe(0)
    expect(Number(result.rows[0]?.imponibile)).toBe(0)
  })

  it('le operazioni esenti non generano IVA', async () => {
    const client = await adminClient()
    const result = await client.query<{ iva: string; imponibile: string }>(
      `select app.line_vat_cents(45000, 0, 0, 'esente_art_10') as iva,
              app.line_taxable_cents(45000, 0, 0, 'esente_art_10') as imponibile`,
    )
    await client.end()
    expect(Number(result.rows[0]?.iva)).toBe(0)
    expect(Number(result.rows[0]?.imponibile)).toBe(45_000)
  })

  it('i totali della fattura seguono le righe', async () => {
    const totals = await asUser(USER_A_ADMIN, async (s) => {
      // Una bozza, non una fattura emessa: dalla 0013 un documento emesso non
      // accetta più righe, ed è proprio la regola che si vuole rispettare qui.
      const cliente = await s.query<{ id: string }>(
        `select id from public.customers where agency_id = $1 limit 1`,
        [AGENCY_A],
      )
      const invoice = await s.query<{ id: string }>(
        `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime)
         values ($1, 'fattura', $2, current_date, 'bozza', 'ordinaria')
         returning id`,
        [AGENCY_A, cliente.rows[0]?.id],
      )
      const invoiceId = invoice.rows[0]?.id
      await s.query(
        `insert into public.invoice_items (agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents, vat_bps, vat_regime, sort_order)
         values ($1, $2, 'Diritti di agenzia', 1, 6100, 0, 2200, 'ordinaria', 99)`,
        [AGENCY_A, invoiceId],
      )
      const result = await s.query<{ taxable_cents: string; vat_cents: string; total_cents: string }>(
        'select taxable_cents, vat_cents, total_cents from public.invoices where id = $1',
        [invoiceId],
      )
      const check = await s.query<{ taxable: string; vat: string; total: string }>(
        `select
           sum(app.line_taxable_cents(gross_cents, cost_cents, vat_bps, vat_regime))::text as taxable,
           sum(app.line_vat_cents(gross_cents, cost_cents, vat_bps, vat_regime))::text as vat,
           sum(gross_cents)::text as total
         from public.invoice_items where invoice_id = $1 and deleted_at is null`,
        [invoiceId],
      )
      return { stored: result.rows[0], computed: check.rows[0] }
    })

    expect(totals.stored?.taxable_cents).toBe(totals.computed?.taxable)
    expect(totals.stored?.vat_cents).toBe(totals.computed?.vat)
    expect(totals.stored?.total_cents).toBe(totals.computed?.total)
  })
})
