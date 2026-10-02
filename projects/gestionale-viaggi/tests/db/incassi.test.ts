import { beforeAll, describe, expect, it } from 'vitest'
import {
  AGENCY_A,
  asUser,
  seedTenants,
  USER_A_ADMIN,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_B_OWNER,
} from './helpers'

/**
 * Incassi, scadenze e pagamenti ai fornitori verificati sul database reale con
 * le policy attive.
 *
 * Qui si muove denaro: l'attribuzione di un incasso alle scadenze, il divieto
 * di registrare due volte lo stesso movimento e la separazione fra agenzie non
 * sono dettagli d'interfaccia, sono il prodotto.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

type Sessione = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

/**
 * Esegue una query che deve fallire, dentro un punto di ripristino.
 *
 * In Postgres un errore abortisce l'intera transazione: senza savepoint il
 * primo controllo negativo renderebbe inutilizzabile il resto del test.
 * Restituisce il messaggio, così l'asserzione resta leggibile.
 */
async function erroreAtteso(session: Sessione, sql: string, params: unknown[] = []): Promise<string> {
  await session.query('savepoint prova')
  try {
    await session.query(sql, params)
    await session.query('release savepoint prova')
    return ''
  } catch (errore) {
    await session.query('rollback to savepoint prova')
    return errore instanceof Error ? errore.message : String(errore)
  }
}

/** Pratica confermata con acconto e saldo, dentro la transazione del test. */
async function praticaConfermata(
  session: Sessione,
  { prezzo = 100_000, partenza = '2030-06-01' } = {},
): Promise<string> {
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
     values ($1, $2, 'Pratica incassi', 'Reykjavik', $3, ($3::date + 7), 2, 'organizzazione')
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

  await session.query('select public.confirm_booking($1)', [bookingId])
  return bookingId
}

async function rate(session: Sessione, bookingId: string) {
  const esito = await session.query(
    `select kind, amount_cents::int as amount, covered_cents::int as covered,
            residual_cents::int as residual, state, is_late
     from public.installment_list where booking_id = $1 order by due_date`,
    [bookingId],
  )
  return esito.rows
}

describe('attribuzione degli incassi alle scadenze', () => {
  it('copre le scadenze in ordine di data', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)

      const prima = await rate(session, bookingId)
      expect(prima).toHaveLength(2)
      expect(prima[0]?.kind).toBe('acconto')
      expect(prima[0]?.amount).toBe(30_000)
      expect(prima[1]?.amount).toBe(70_000)
      expect(prima[0]?.covered).toBe(0)

      // Un incasso che copre l'acconto e sfiora il saldo.
      await session.query(
        `select public.record_payment_in($1, 40000, current_date, 'acconto', 'bonifico')`,
        [bookingId],
      )

      const dopo = await rate(session, bookingId)
      expect(dopo[0]?.covered).toBe(30_000)
      expect(dopo[0]?.residual).toBe(0)
      expect(dopo[0]?.state).toBe('saldata')
      expect(dopo[1]?.covered).toBe(10_000)
      expect(dopo[1]?.residual).toBe(60_000)
      expect(dopo[1]?.state).toBe('parziale')
    })
  })

  it('una scadenza passata e scoperta è in ritardo', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(
        `update public.installments set due_date = current_date - 10
         where booking_id = $1 and kind = 'acconto'`,
        [bookingId],
      )

      const righe = await rate(session, bookingId)
      const acconto = righe.find((riga) => riga.kind === 'acconto')
      expect(acconto?.state).toBe('scaduta')
      expect(acconto?.is_late).toBe(true)
    })
  })

  it('una scadenza coperta a metà resta in ritardo anche se si legge "parziale"', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(
        `update public.installments set due_date = current_date - 5
         where booking_id = $1 and kind = 'acconto'`,
        [bookingId],
      )
      await session.query(
        `select public.record_payment_in($1, 10000, current_date, 'acconto', 'contanti')`,
        [bookingId],
      )

      const acconto = (await rate(session, bookingId)).find((riga) => riga.kind === 'acconto')
      expect(acconto?.state).toBe('parziale')
      expect(acconto?.is_late).toBe(true)
    })
  })

  it('il quadro economico della pratica segue gli incassi', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(
        `select public.record_payment_in($1, 100000, current_date, 'saldo', 'bonifico')`,
        [bookingId],
      )

      const esito = await session.query(
        `select paid_cents::int as paid, balance_cents::int as balance, payment_state
         from public.booking_financials where booking_id = $1`,
        [bookingId],
      )
      expect(esito.rows[0]?.paid).toBe(100_000)
      expect(esito.rows[0]?.balance).toBe(0)
      expect(esito.rows[0]?.payment_state).toBe('saldata')
    })
  })
})

describe('registrazione di un incasso', () => {
  it('la stessa chiave di idempotenza non produce due incassi', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)

      await session.query(
        `select public.record_payment_in($1, 5000, current_date, 'acconto', 'pos', null, null, null, 'chiave-uguale')`,
        [bookingId],
      )
      await session.query(
        `select public.record_payment_in($1, 5000, current_date, 'acconto', 'pos', null, null, null, 'chiave-uguale')`,
        [bookingId],
      )

      const esito = await session.query(
        `select count(*)::int as quanti, coalesce(sum(amount_cents), 0)::int as totale
         from public.payments_in where booking_id = $1 and deleted_at is null`,
        [bookingId],
      )
      expect(esito.rows[0]?.quanti).toBe(1)
      expect(esito.rows[0]?.totale).toBe(5000)
    })
  })

  it('rifiuta importo zero, data futura e rimborso positivo', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)

      expect(
        await erroreAtteso(
          session,
          `select public.record_payment_in($1, 0, current_date, 'acconto', 'contanti')`,
          [bookingId],
        ),
      ).toMatch(/maggiore di zero/i)

      expect(
        await erroreAtteso(
          session,
          `select public.record_payment_in($1, 1000, current_date + 1, 'acconto', 'contanti')`,
          [bookingId],
        ),
      ).toMatch(/futuro/i)

      expect(
        await erroreAtteso(
          session,
          `select public.record_payment_in($1, 1000, current_date, 'rimborso', 'bonifico')`,
          [bookingId],
        ),
      ).toMatch(/negativo/i)
    })
  })

  it('un rimborso in negativo riapre il residuo', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(
        `select public.record_payment_in($1, 100000, current_date, 'saldo', 'bonifico')`,
        [bookingId],
      )
      await session.query(
        `select public.record_payment_in($1, -20000, current_date, 'rimborso', 'bonifico')`,
        [bookingId],
      )

      const esito = await session.query(
        `select paid_cents::int as paid, balance_cents::int as balance
         from public.booking_financials where booking_id = $1`,
        [bookingId],
      )
      expect(esito.rows[0]?.paid).toBe(80_000)
      expect(esito.rows[0]?.balance).toBe(20_000)
    })
  })

  it('chiude il promemoria della scadenza coperta', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      const rataAcconto = await session.query(
        `select id, due_date from public.installments
         where booking_id = $1 and kind = 'acconto'`,
        [bookingId],
      )
      await session.query(
        `insert into public.tasks (agency_id, booking_id, title, kind, status, due_at)
         values ($1, $2, 'Sollecito acconto', 'scadenza_acconto', 'aperto', now())`,
        [AGENCY_A, bookingId],
      )

      await session.query(
        `select public.record_payment_in($1, 30000, current_date, 'acconto', 'bonifico', $2)`,
        [bookingId, rataAcconto.rows[0]?.id],
      )

      const esito = await session.query(
        `select status from public.tasks where booking_id = $1 and kind = 'scadenza_acconto'`,
        [bookingId],
      )
      expect(esito.rows[0]?.status).toBe('completato')
    })
  })

  it('lo storno pretende un motivo e non cancella la riga', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      const incasso = await session.query(
        `select (public.record_payment_in($1, 30000, current_date, 'acconto', 'bonifico')).id as id`,
        [bookingId],
      )
      const paymentId = String(incasso.rows[0]?.id)

      expect(await erroreAtteso(session, `select public.void_payment_in($1, 'no')`, [paymentId])).toMatch(
        /motivo/i,
      )

      await session.query(`select public.void_payment_in($1, 'Bonifico tornato indietro')`, [
        paymentId,
      ])

      const esito = await session.query(
        `select deleted_at, notes from public.payments_in where id = $1`,
        [paymentId],
      )
      expect(esito.rows[0]?.deleted_at).not.toBeNull()
      expect(String(esito.rows[0]?.notes)).toContain('Bonifico tornato indietro')

      const quadro = await session.query(
        `select paid_cents::int as paid from public.booking_financials where booking_id = $1`,
        [bookingId],
      )
      expect(quadro.rows[0]?.paid).toBe(0)
    })
  })

  it('non si registra un incasso su una pratica annullata', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(`select public.cancel_booking($1, 'Cliente rinuncia', 0)`, [bookingId])

      await expect(
        session.query(
          `select public.record_payment_in($1, 1000, current_date, 'acconto', 'contanti')`,
          [bookingId],
        ),
      ).rejects.toThrow(/annullata/i)
    })
  })
})

describe('pagamenti ai fornitori', () => {
  async function conFornitore(session: Sessione, bookingId: string): Promise<void> {
    const fornitore = await session.query(
      `select id from public.suppliers where agency_id = $1 limit 1`,
      [AGENCY_A],
    )
    await session.query(
      `update public.booking_services
       set supplier_id = $2, supplier_due_date = current_date + 5
       where booking_id = $1`,
      [bookingId, fornitore.rows[0]?.id],
    )
  }

  it('nascono dalle righe di servizio e l’allineamento è ripetibile', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await conFornitore(session, bookingId)

      const primo = await session.query(`select public.sync_booking_payouts($1) as quanti`, [
        bookingId,
      ])
      expect(Number(primo.rows[0]?.quanti)).toBe(1)

      const secondo = await session.query(`select public.sync_booking_payouts($1) as quanti`, [
        bookingId,
      ])
      expect(Number(secondo.rows[0]?.quanti)).toBe(0)

      const esito = await session.query(
        `select amount_cents::int as importo, status, due_date
         from public.payout_list where booking_id = $1`,
        [bookingId],
      )
      expect(esito.rows).toHaveLength(1)
      expect(esito.rows[0]?.importo).toBe(70_000)
      expect(esito.rows[0]?.status).toBe('da_pagare')
    })
  })

  it('un pagamento già eseguito non viene riallineato', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await conFornitore(session, bookingId)
      await session.query(`select public.sync_booking_payouts($1)`, [bookingId])

      const pagamento = await session.query(
        `select id from public.payments_out where booking_id = $1`,
        [bookingId],
      )
      await session.query(
        `select public.set_payout_status($1, 'pagato', current_date, 'bonifico', 'BON-9', 'FT-1')`,
        [pagamento.rows[0]?.id],
      )

      // Il prezzo di costo cambia dopo il pagamento: il denaro è già uscito
      // per l'importo vecchio, e quella riga non si tocca.
      await session.query(
        `update public.booking_services set unit_cost_cents = 10000 where booking_id = $1`,
        [bookingId],
      )
      await session.query(`select public.sync_booking_payouts($1)`, [bookingId])

      const esito = await session.query(
        `select amount_cents::int as importo, status, paid_at, reference, supplier_invoice_number
         from public.payments_out where id = $1`,
        [pagamento.rows[0]?.id],
      )
      expect(esito.rows[0]?.importo).toBe(70_000)
      expect(esito.rows[0]?.status).toBe('pagato')
      expect(esito.rows[0]?.reference).toBe('BON-9')
      expect(esito.rows[0]?.supplier_invoice_number).toBe('FT-1')
    })
  })

  it('tornare "da pagare" cancella la data di pagamento', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await conFornitore(session, bookingId)
      await session.query(`select public.sync_booking_payouts($1)`, [bookingId])
      const pagamento = await session.query(
        `select id from public.payments_out where booking_id = $1`,
        [bookingId],
      )

      await session.query(`select public.set_payout_status($1, 'pagato', current_date)`, [
        pagamento.rows[0]?.id,
      ])
      await session.query(`select public.set_payout_status($1, 'da_pagare')`, [
        pagamento.rows[0]?.id,
      ])

      const esito = await session.query(
        `select status, paid_at from public.payments_out where id = $1`,
        [pagamento.rows[0]?.id],
      )
      expect(esito.rows[0]?.status).toBe('da_pagare')
      expect(esito.rows[0]?.paid_at).toBeNull()
    })
  })

  it('una riga di servizio cancellata porta via il pagamento non ancora eseguito', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await conFornitore(session, bookingId)
      await session.query(`select public.sync_booking_payouts($1)`, [bookingId])

      await session.query(
        `update public.booking_services set deleted_at = now() where booking_id = $1`,
        [bookingId],
      )
      await session.query(`select public.sync_booking_payouts($1)`, [bookingId])

      const esito = await session.query(
        `select count(*)::int as quanti from public.payout_list where booking_id = $1`,
        [bookingId],
      )
      expect(esito.rows[0]?.quanti).toBe(0)
    })
  })
})

describe('permessi e isolamento', () => {
  it('l’amministrativo può incassare', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await praticaConfermata(session)
      const esito = await session.query(
        `select (public.record_payment_in($1, 1000, current_date, 'acconto', 'contanti')).amount_cents::int as importo`,
        [id],
      )
      expect(esito.rows[0]?.importo).toBe(1000)
    })
  })

  it('l’operatore non può registrare incassi', async () => {
    const praticaId = await asUser(USER_A_OWNER, async (session) => {
      const esito = await session.query(
        `select id from public.bookings where agency_id = $1 and status = 'confermata'
         and deleted_at is null limit 1`,
        [AGENCY_A],
      )
      return String(esito.rows[0]?.id)
    })

    await asUser(USER_A_OPERATOR, async (session) => {
      await expect(
        session.query(
          `select public.record_payment_in($1, 1000, current_date, 'acconto', 'contanti')`,
          [praticaId],
        ),
      ).rejects.toThrow()
    })
  })

  it('un’agenzia non vede le scadenze né i pagamenti dell’altra', async () => {
    const quanteA = await asUser(USER_A_OWNER, async (session) => {
      const esito = await session.query(
        `select count(*)::int as quante from public.installment_list`,
      )
      return Number(esito.rows[0]?.quante)
    })
    expect(quanteA).toBeGreaterThan(0)

    await asUser(USER_B_OWNER, async (session) => {
      const rate = await session.query(`select count(*)::int as quante from public.installment_list`)
      const pagamenti = await session.query(`select count(*)::int as quanti from public.payout_list`)
      const incassi = await session.query(
        `select count(*)::int as quanti from public.payment_in_list`,
      )
      expect(Number(rate.rows[0]?.quante)).toBe(0)
      expect(Number(pagamenti.rows[0]?.quanti)).toBe(0)
      expect(Number(incassi.rows[0]?.quanti)).toBe(0)
    })
  })

  it('l’agenzia B non può incassare su una pratica dell’agenzia A', async () => {
    const praticaId = await asUser(USER_A_OWNER, async (session) => {
      const esito = await session.query(
        `select id from public.bookings where agency_id = $1 and deleted_at is null limit 1`,
        [AGENCY_A],
      )
      return String(esito.rows[0]?.id)
    })

    await asUser(USER_B_OWNER, async (session) => {
      await expect(
        session.query(
          `select public.record_payment_in($1, 1000, current_date, 'acconto', 'contanti')`,
          [praticaId],
        ),
      ).rejects.toThrow(/non trovata/i)
    })
  })
})

describe('registro delle operazioni economiche', () => {
  it('ogni incasso lascia una riga nel registro', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const bookingId = await praticaConfermata(session)
      await session.query(
        `select public.record_payment_in($1, 25000, current_date, 'acconto', 'bonifico')`,
        [bookingId],
      )

      const esito = await session.query(
        `select action, entity_type, summary from public.activity_log
         where agency_id = $1 and entity_type = 'payments_in'
         order by created_at desc limit 1`,
        [AGENCY_A],
      )
      expect(esito.rows[0]?.action).toBe('incasso')
      expect(String(esito.rows[0]?.summary)).toContain('250,00')
    })
  })
})
