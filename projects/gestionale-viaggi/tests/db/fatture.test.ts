import { beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  AGENCY_A,
  asUser,
  seedTenants,
  USER_A_ADMIN,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_B_OWNER,
} from './helpers'

/**
 * Fatture, note di credito e registro IVA verificati sul database reale con le
 * policy attive.
 *
 * Qui non si tratta di comodità d'interfaccia: la numerazione delle fatture non
 * ammette buchi, un documento emesso non si modifica, e l'IVA del regime 74-ter
 * si calcola sul margine. Sono le tre cose che rendono il modulo utilizzabile
 * da un'agenzia vera, e vanno dimostrate.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

type Sessione = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

async function erroreAtteso(
  session: Sessione,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
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

/** Bozza di fattura con una riga, dentro la transazione del test. */
async function bozza(
  session: Sessione,
  {
    regime = 'art_74_ter',
    prezzo = 150_000,
    costo = 100_000,
    aliquota = 2200,
  }: { regime?: string; prezzo?: number; costo?: number; aliquota?: number } = {},
): Promise<string> {
  const cliente = await session.query(
    `select id from public.customers where agency_id = $1 order by created_at limit 1`,
    [AGENCY_A],
  )

  const fattura = await session.query(
    `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime)
     values ($1, 'fattura', $2, current_date, 'bozza', $3)
     returning id`,
    [AGENCY_A, cliente.rows[0]?.id, regime],
  )
  const id = String(fattura.rows[0]?.id)

  await session.query(
    `insert into public.invoice_items (agency_id, invoice_id, description, quantity,
                                       unit_price_cents, cost_cents, vat_bps, vat_regime, sort_order)
     values ($1, $2, 'Pacchetto turistico Lisbona', 1, $3, $4, $5, $6, 0)`,
    [AGENCY_A, id, prezzo, costo, aliquota, regime],
  )

  return id
}

describe('numerazione', () => {
  it('una bozza non ha numero e non consuma la numerazione', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)

      const prima = await session.query(
        `select code, number, year, status from public.invoices where id = $1`,
        [id],
      )
      expect(prima.rows[0]?.code).toBeNull()
      expect(prima.rows[0]?.number).toBeNull()
      expect(prima.rows[0]?.status).toBe('bozza')

      const contatore = await session.query(
        `select last_number from public.document_counters
         where agency_id = $1 and kind = 'fattura' and year = extract(year from current_date)::int`,
        [AGENCY_A],
      )
      const prossimo = Number(contatore.rows[0]?.last_number ?? 0)

      // La bozza viene scartata: il contatore non si muove, e il numero
      // successivo resta disponibile.
      await session.query(`select public.void_draft_invoice($1)`, [id])

      const dopo = await session.query(
        `select last_number from public.document_counters
         where agency_id = $1 and kind = 'fattura' and year = extract(year from current_date)::int`,
        [AGENCY_A],
      )
      expect(Number(dopo.rows[0]?.last_number ?? 0)).toBe(prossimo)
    })
  })

  it('l’emissione assegna numero e codice, e non rinumera se ripetuta', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)

      const emessa = await session.query(
        `select code, number, status from public.issue_invoice($1)`,
        [id],
      )
      expect(emessa.rows[0]?.status).toBe('emessa')
      expect(Number(emessa.rows[0]?.number)).toBeGreaterThan(0)
      expect(String(emessa.rows[0]?.code)).toMatch(/^\d{4}\/\d{4}$/)

      const ripetuta = await session.query(`select code, number from public.issue_invoice($1)`, [id])
      expect(ripetuta.rows[0]?.code).toBe(emessa.rows[0]?.code)
      expect(ripetuta.rows[0]?.number).toBe(emessa.rows[0]?.number)
    })
  })

  it('due fatture emesse di seguito prendono numeri consecutivi', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const prima = await session.query(`select number from public.issue_invoice($1)`, [
        await bozza(session),
      ])
      const seconda = await session.query(`select number from public.issue_invoice($1)`, [
        await bozza(session),
      ])

      expect(Number(seconda.rows[0]?.number)).toBe(Number(prima.rows[0]?.number) + 1)
    })
  })

  it('senza righe non si emette', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const cliente = await session.query(
        `select id from public.customers where agency_id = $1 limit 1`,
        [AGENCY_A],
      )
      const vuota = await session.query(
        `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime)
         values ($1, 'fattura', $2, current_date, 'bozza', 'ordinaria') returning id`,
        [AGENCY_A, cliente.rows[0]?.id],
      )

      const messaggio = await erroreAtteso(session, `select public.issue_invoice($1)`, [
        vuota.rows[0]?.id,
      ])
      expect(messaggio).toMatch(/almeno una riga/i)
    })
  })

  it('la data di emissione non può essere nel futuro', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)
      const messaggio = await erroreAtteso(
        session,
        `select public.issue_invoice($1, (current_date + 1))`,
        [id],
      )
      expect(messaggio).toMatch(/futuro/i)
    })
  })
})

describe('immutabilità del documento emesso', () => {
  it('una fattura emessa non cambia importi, cliente né data', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)
      await session.query(`select public.issue_invoice($1)`, [id])

      const importi = await erroreAtteso(
        session,
        `update public.invoices set total_cents = 1 where id = $1`,
        [id],
      )
      expect(importi).toMatch(/gi[àa] emesso/i)

      const data = await erroreAtteso(
        session,
        `update public.invoices set issue_date = current_date - 10 where id = $1`,
        [id],
      )
      expect(data).toMatch(/gi[àa] emesso/i)

      const eliminazione = await erroreAtteso(
        session,
        `update public.invoices set deleted_at = now() where id = $1`,
        [id],
      )
      expect(eliminazione).toMatch(/non si elimina/i)

      // Lo stato e l'invio invece si muovono: sono l'unica cosa che cambia
      // dopo l'emissione.
      const inviata = await session.query(`select status, sent_at from public.send_invoice($1)`, [id])
      expect(inviata.rows[0]?.status).toBe('inviata')
      expect(inviata.rows[0]?.sent_at).not.toBeNull()
    })
  })

  it('le righe di una fattura emessa non si toccano', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)
      await session.query(`select public.issue_invoice($1)`, [id])

      const modifica = await erroreAtteso(
        session,
        `update public.invoice_items set unit_price_cents = 1 where invoice_id = $1`,
        [id],
      )
      expect(modifica).toMatch(/non si modificano/i)

      const aggiunta = await erroreAtteso(
        session,
        `insert into public.invoice_items (agency_id, invoice_id, description, quantity,
                                           unit_price_cents, cost_cents, vat_bps, vat_regime)
         values ($1, $2, 'Riga aggiunta dopo', 1, 1000, 0, 2200, 'ordinaria')`,
        [AGENCY_A, id],
      )
      expect(aggiunta).toMatch(/non si modificano/i)

      const bozzaScartata = await erroreAtteso(session, `select public.void_draft_invoice($1)`, [id])
      expect(bozzaScartata).toMatch(/nota di credito/i)
    })
  })

  it('una bozza invece si modifica liberamente', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)

      await session.query(
        `update public.invoice_items set unit_price_cents = 200000 where invoice_id = $1`,
        [id],
      )
      const totali = await session.query(
        `select total_cents from public.invoices where id = $1`,
        [id],
      )
      expect(Number(totali.rows[0]?.total_cents)).toBe(200_000)
    })
  })
})

describe('regime art. 74-ter', () => {
  it('l’imposta si scorpora dal margine, non dal corrispettivo', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      // Corrispettivo 1.500, costo del viaggio 1.000: margine 500, IVA 22%
      // scorporata da 500 = 90,16; imponibile 409,84.
      const id = await bozza(session, { prezzo: 150_000, costo: 100_000 })

      const riga = await session.query(
        `select taxable_cents, vat_cents, margin_cents, gross_cents
         from public.invoice_item_list where invoice_id = $1`,
        [id],
      )
      expect(Number(riga.rows[0]?.gross_cents)).toBe(150_000)
      expect(Number(riga.rows[0]?.margin_cents)).toBe(50_000)
      expect(Number(riga.rows[0]?.vat_cents)).toBe(9016)
      expect(Number(riga.rows[0]?.taxable_cents)).toBe(40_984)

      const testata = await session.query(
        `select taxable_cents, vat_cents, total_cents from public.invoices where id = $1`,
        [id],
      )
      expect(Number(testata.rows[0]?.vat_cents)).toBe(9016)
      expect(Number(testata.rows[0]?.total_cents)).toBe(150_000)
    })
  })

  it('un margine nullo o negativo non genera imposta', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session, { prezzo: 100_000, costo: 120_000 })

      const riga = await session.query(
        `select taxable_cents, vat_cents from public.invoice_item_list where invoice_id = $1`,
        [id],
      )
      expect(Number(riga.rows[0]?.vat_cents)).toBe(0)
      expect(Number(riga.rows[0]?.taxable_cents)).toBe(0)
    })
  })

  it('in regime ordinario l’imposta si scorpora dal corrispettivo', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session, { regime: 'ordinaria', prezzo: 122_000, costo: 0 })

      const riga = await session.query(
        `select taxable_cents, vat_cents from public.invoice_item_list where invoice_id = $1`,
        [id],
      )
      expect(Number(riga.rows[0]?.taxable_cents)).toBe(100_000)
      expect(Number(riga.rows[0]?.vat_cents)).toBe(22_000)
    })
  })
})

describe('fattura dalla pratica', () => {
  it('una pratica in organizzazione porta le righe di servizio in 74-ter', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const pratica = await session.query(
        `select b.id, b.code from public.bookings b
         where b.agency_id = $1 and b.sale_type = 'organizzazione'
           and b.status in ('confermata','partita','rientrata') and b.deleted_at is null
         limit 1`,
        [AGENCY_A],
      )
      const bookingId = String(pratica.rows[0]?.id)

      const fattura = await session.query(
        `select id, status, vat_regime, booking_id from public.invoice_from_booking($1)`,
        [bookingId],
      )
      expect(fattura.rows[0]?.status).toBe('bozza')
      expect(fattura.rows[0]?.vat_regime).toBe('art_74_ter')
      expect(fattura.rows[0]?.booking_id).toBe(bookingId)

      const righe = await session.query(
        `select count(*)::int as n from public.invoice_items where invoice_id = $1`,
        [fattura.rows[0]?.id],
      )
      const servizi = await session.query(
        `select count(*)::int as n from public.booking_services
         where booking_id = $1 and deleted_at is null`,
        [bookingId],
      )
      expect(Number(righe.rows[0]?.n)).toBe(Number(servizi.rows[0]?.n))
    })
  })

  it('una pratica in intermediazione fattura la provvigione in IVA ordinaria', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const pratica = await session.query(
        `select id from public.bookings
         where agency_id = $1 and sale_type = 'intermediazione'
           and status in ('confermata','partita','rientrata') and deleted_at is null
         limit 1`,
        [AGENCY_A],
      )

      const fattura = await session.query(
        `select id, vat_regime from public.invoice_from_booking($1)`,
        [pratica.rows[0]?.id],
      )
      expect(fattura.rows[0]?.vat_regime).toBe('ordinaria')

      const righe = await session.query(
        `select description, vat_regime from public.invoice_items where invoice_id = $1`,
        [fattura.rows[0]?.id],
      )
      expect(righe.rows).toHaveLength(1)
      expect(String(righe.rows[0]?.description)).toMatch(/commissione di intermediazione/i)
      expect(righe.rows[0]?.vat_regime).toBe('ordinaria')
    })
  })

  it('una pratica in opzione o annullata non si fattura', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const opzione = await session.query(
        `select id from public.bookings where agency_id = $1 and status = 'opzione'
           and deleted_at is null limit 1`,
        [AGENCY_A],
      )

      if (opzione.rows.length > 0) {
        const messaggio = await erroreAtteso(
          session,
          `select public.invoice_from_booking($1)`,
          [opzione.rows[0]?.id],
        )
        expect(messaggio).toMatch(/pratica confermata/i)
      }

      const annullata = await session.query(
        `select id from public.bookings where agency_id = $1 and status = 'annullata'
           and deleted_at is null limit 1`,
        [AGENCY_A],
      )
      const messaggio = await erroreAtteso(session, `select public.invoice_from_booking($1)`, [
        annullata.rows[0]?.id,
      ])
      expect(messaggio).toMatch(/pratica confermata/i)
    })
  })

  it('gli incassi della pratica si attribuiscono alla fattura, fino a concorrenza', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const pratica = await session.query(
        `select b.id from public.bookings b
         where b.agency_id = $1 and b.status in ('confermata','partita','rientrata')
           and b.deleted_at is null
           and exists (select 1 from public.payments_in p where p.booking_id = b.id)
           and not exists (select 1 from public.invoices i
                           where i.booking_id = b.id and i.deleted_at is null)
         limit 1`,
        [AGENCY_A],
      )

      if (pratica.rows.length === 0) return

      const fattura = await session.query(
        `select id from public.invoice_from_booking($1)`,
        [pratica.rows[0]?.id],
      )
      const id = String(fattura.rows[0]?.id)
      await session.query(`select public.issue_invoice($1)`, [id])

      const riga = await session.query(
        `select total_cents, paid_cents, residual_cents, payment_state
         from public.invoice_list where id = $1`,
        [id],
      )
      // L'attribuzione non supera mai il totale del documento, e il residuo
      // non diventa negativo.
      expect(Number(riga.rows[0]?.paid_cents)).toBeLessThanOrEqual(
        Number(riga.rows[0]?.total_cents),
      )
      expect(Number(riga.rows[0]?.residual_cents)).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('note di credito', () => {
  it('ricalcano le righe della fattura con importi positivi e la citano', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)
      const emessa = await session.query(`select code from public.issue_invoice($1)`, [id])

      const nota = await session.query(
        `select id, kind, status, credit_note_of, notes
         from public.credit_note_for($1, 'Annullamento del viaggio')`,
        [id],
      )
      expect(nota.rows[0]?.kind).toBe('nota_credito')
      expect(nota.rows[0]?.status).toBe('bozza')
      expect(nota.rows[0]?.credit_note_of).toBe(id)
      expect(String(nota.rows[0]?.notes)).toMatch(/annullamento/i)

      const righe = await session.query(
        `select unit_price_cents from public.invoice_items where invoice_id = $1`,
        [nota.rows[0]?.id],
      )
      expect(Number(righe.rows[0]?.unit_price_cents)).toBe(150_000)

      // Emessa, la nota prende la propria numerazione col prefisso NC.
      const notaEmessa = await session.query(`select code from public.issue_invoice($1)`, [
        nota.rows[0]?.id,
      ])
      expect(String(notaEmessa.rows[0]?.code)).toMatch(/^NC\d{4}\/\d{4}$/)
      expect(notaEmessa.rows[0]?.code).not.toBe(emessa.rows[0]?.code)

      // Nell'elenco la nota entra col segno meno, e la fattura sa di essere stornata.
      const vista = await session.query(
        `select signed_total_cents from public.invoice_list where id = $1`,
        [nota.rows[0]?.id],
      )
      expect(Number(vista.rows[0]?.signed_total_cents)).toBe(-150_000)

      const stornata = await session.query(
        `select credited_cents from public.invoice_list where id = $1`,
        [id],
      )
      expect(Number(stornata.rows[0]?.credited_cents)).toBe(150_000)
    })
  })

  it('non si storna una bozza, non si storna una nota, e serve il motivo', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session)

      const suBozza = await erroreAtteso(
        session,
        `select public.credit_note_for($1, 'Motivo valido')`,
        [id],
      )
      expect(suBozza).toMatch(/ancora una bozza/i)

      await session.query(`select public.issue_invoice($1)`, [id])

      const senzaMotivo = await erroreAtteso(session, `select public.credit_note_for($1, ' ')`, [id])
      expect(senzaMotivo).toMatch(/motivo/i)

      const nota = await session.query(
        `select id from public.credit_note_for($1, 'Annullamento del viaggio')`,
        [id],
      )

      const doppia = await erroreAtteso(
        session,
        `select public.credit_note_for($1, 'Altro motivo')`,
        [id],
      )
      expect(doppia).toMatch(/esiste gi[àa]/i)

      await session.query(`select public.issue_invoice($1)`, [nota.rows[0]?.id])
      const suNota = await erroreAtteso(
        session,
        `select public.credit_note_for($1, 'Motivo valido')`,
        [nota.rows[0]?.id],
      )
      expect(suNota).toMatch(/su una fattura/i)
    })
  })
})

describe('registro IVA', () => {
  it('somma per mese, regime e aliquota, con le note di credito in negativo', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const id = await bozza(session, { regime: 'ordinaria', prezzo: 122_000, costo: 0 })
      await session.query(`select public.issue_invoice($1)`, [id])

      const prima = await session.query(
        `select taxable_cents, vat_cents, documents_count from public.vat_register
         where year = extract(year from current_date)::int
           and month = extract(month from current_date)::int
           and kind = 'fattura' and vat_regime = 'ordinaria' and vat_bps = 2200`,
      )
      const imponibilePrima = Number(prima.rows[0]?.taxable_cents ?? 0)

      const nota = await session.query(
        `select id from public.credit_note_for($1, 'Storno totale')`,
        [id],
      )
      await session.query(`select public.issue_invoice($1)`, [nota.rows[0]?.id])

      const riga = await session.query(
        `select taxable_cents, vat_cents from public.vat_register
         where year = extract(year from current_date)::int
           and month = extract(month from current_date)::int
           and kind = 'nota_credito' and vat_regime = 'ordinaria' and vat_bps = 2200`,
      )
      expect(Number(riga.rows[0]?.taxable_cents)).toBe(-100_000)
      expect(Number(riga.rows[0]?.vat_cents)).toBe(-22_000)

      // La riga delle fatture non è stata toccata dallo storno: sono due righe
      // distinte, ed è così che si legge un registro.
      const dopo = await session.query(
        `select taxable_cents from public.vat_register
         where year = extract(year from current_date)::int
           and month = extract(month from current_date)::int
           and kind = 'fattura' and vat_regime = 'ordinaria' and vat_bps = 2200`,
      )
      expect(Number(dopo.rows[0]?.taxable_cents)).toBe(imponibilePrima)
    })
  })

  it('le bozze non entrano nel registro', async () => {
    await asUser(USER_A_ADMIN, async (session) => {
      const prima = await session.query(
        `select coalesce(sum(documents_count), 0)::int as n from public.vat_register
         where year = extract(year from current_date)::int`,
      )

      await bozza(session, { regime: 'ordinaria', prezzo: 500_000, costo: 0 })

      const dopo = await session.query(
        `select coalesce(sum(documents_count), 0)::int as n from public.vat_register
         where year = extract(year from current_date)::int`,
      )
      expect(Number(dopo.rows[0]?.n)).toBe(Number(prima.rows[0]?.n))
    })
  })
})

describe('permessi e isolamento', () => {
  it('l’operatore non tocca la contabilità', async () => {
    await asUser(USER_A_OPERATOR, async (session) => {
      const cliente = await session.query(
        `select id from public.customers where agency_id = $1 limit 1`,
        [AGENCY_A],
      )

      const scrittura = await erroreAtteso(
        session,
        `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime)
         values ($1, 'fattura', $2, current_date, 'bozza', 'ordinaria')`,
        [AGENCY_A, cliente.rows[0]?.id],
      )
      expect(scrittura).not.toBe('')
    })
  })

  it('l’agenzia B non vede né emette i documenti dell’agenzia A', async () => {
    const creata = await asUser(USER_A_OWNER, async (session) => {
      const id = await bozza(session)
      await session.query(`select public.issue_invoice($1)`, [id])
      await session.query('commit')
      return id
    })

    try {
      await asUser(USER_B_OWNER, async (session) => {
        const elenco = await session.query(
          `select count(*)::int as n from public.invoice_list where id = $1`,
          [creata],
        )
        expect(Number(elenco.rows[0]?.n)).toBe(0)

        const righe = await session.query(
          `select count(*)::int as n from public.invoice_item_list where invoice_id = $1`,
          [creata],
        )
        expect(Number(righe.rows[0]?.n)).toBe(0)

        const storno = await erroreAtteso(
          session,
          `select public.credit_note_for($1, 'Tentativo da un''altra agenzia')`,
          [creata],
        )
        expect(storno).toMatch(/non trovata/i)

        const scrittura = await session.query(
          `update public.invoices set notes = 'Dirottata' where id = $1 returning id`,
          [creata],
        )
        expect(scrittura.rows).toHaveLength(0)
      })
    } finally {
      // Il documento è emesso, e i trigger di immutabilità — giustamente —
      // impediscono di cancellarlo. La pulizia di una fixture non è
      // un'operazione del prodotto: si fa da amministratore, sospendendo i
      // trigger per il tempo della cancellazione.
      const client = await adminClient()
      try {
        await client.query('set session_replication_role = replica')
        await client.query('delete from public.invoice_items where invoice_id = $1', [creata])
        await client.query('delete from public.activity_log where entity_id = $1', [creata])
        await client.query('delete from public.invoices where id = $1', [creata])
      } finally {
        await client.query('set session_replication_role = origin').catch(() => undefined)
        await client.end()
      }
    }
  })
})
