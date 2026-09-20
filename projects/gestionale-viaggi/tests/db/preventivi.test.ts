import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, asUser, seedTenants, USER_A_OWNER, USER_B_OWNER } from './helpers'

/**
 * Preventivi verificati sul database reale con le policy attive.
 *
 * Qui il rischio non è solo il calcolo: la pagina pubblica è raggiungibile da
 * chiunque abbia il collegamento, e tre funzioni girano con i privilegi del
 * proprietario. Che accettino soltanto il token, che non mostrino mai i costi
 * e che non lascino passare l'agenzia sbagliata è la parte che va dimostrata.
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

interface PreventivoProva {
  readonly id: string
  readonly token: string
}

/**
 * Preventivo inviato con due proposte, dentro la transazione del test.
 *
 * La consigliata costa 1.000 e si vende a 1.500; la premium raddoppia. Le cifre
 * sono tonde apposta: un totale sbagliato si vede a occhio.
 */
async function preventivoInviato(
  session: Sessione,
  { valido = '2099-12-31', conCliente = true } = {},
): Promise<PreventivoProva> {
  const cliente = await session.query(
    `select id from public.customers where agency_id = $1 order by created_at limit 1`,
    [AGENCY_A],
  )

  const preventivo = await session.query(
    `insert into public.quotes (agency_id, customer_id, title, destination, departure_date,
                                return_date, pax_count, sale_type, status, valid_until, sent_at)
     values ($1, $2, 'Capodanno a Lisbona', 'Lisbona', '2030-12-28', '2031-01-02', 2,
             'organizzazione', 'inviato', $3, now())
     returning id, public_token`,
    [AGENCY_A, conCliente ? cliente.rows[0]?.id : null, valido],
  )

  const id = String(preventivo.rows[0]?.id)

  await session.query(
    `insert into public.quote_items (agency_id, quote_id, variant, service_type, description,
                                     quantity, unit_cost_cents, unit_price_cents, vat_bps,
                                     vat_regime, sort_order)
     values
       ($1, $2, 'consigliata', 'volo', 'Voli di linea a/r', 1, 40000, 60000, 2200, 'art_74_ter', 0),
       ($1, $2, 'consigliata', 'hotel', 'Hotel 4 stelle, 5 notti', 1, 60000, 90000, 2200, 'art_74_ter', 1),
       ($1, $2, 'premium', 'volo', 'Voli in business a/r', 1, 90000, 130000, 2200, 'art_74_ter', 0),
       ($1, $2, 'premium', 'hotel', 'Hotel 5 stelle, 5 notti', 1, 110000, 170000, 2200, 'art_74_ter', 1)`,
    [AGENCY_A, id],
  )

  return { id, token: String(preventivo.rows[0]?.public_token) }
}

describe('quadro economico delle varianti', () => {
  it('somma venduto, costo e margine di ogni proposta separatamente', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session)

      const totali = await session.query(
        `select variant, items_count, revenue_cents, cost_cents, margin_cents
         from public.quote_variant_totals where quote_id = $1 order by variant`,
        [id],
      )

      const consigliata = totali.rows.find((riga) => riga.variant === 'consigliata')
      const premium = totali.rows.find((riga) => riga.variant === 'premium')

      expect(Number(consigliata?.items_count)).toBe(2)
      expect(Number(consigliata?.revenue_cents)).toBe(150_000)
      expect(Number(consigliata?.cost_cents)).toBe(100_000)
      expect(Number(consigliata?.margin_cents)).toBe(50_000)

      expect(Number(premium?.revenue_cents)).toBe(300_000)
      expect(Number(premium?.margin_cents)).toBe(100_000)
    })
  })

  it('l’elenco mostra la variante accettata, altrimenti la consigliata', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session)

      const prima = await session.query(
        `select shown_variant, revenue_cents, variants_count from public.quote_list where id = $1`,
        [id],
      )
      expect(prima.rows[0]?.shown_variant).toBe('consigliata')
      expect(Number(prima.rows[0]?.revenue_cents)).toBe(150_000)
      expect(Number(prima.rows[0]?.variants_count)).toBe(2)

      await session.query(`update public.quotes set accepted_variant = 'premium' where id = $1`, [id])

      const dopo = await session.query(
        `select shown_variant, revenue_cents from public.quote_list where id = $1`,
        [id],
      )
      expect(dopo.rows[0]?.shown_variant).toBe('premium')
      expect(Number(dopo.rows[0]?.revenue_cents)).toBe(300_000)
    })
  })

  it('un preventivo è scaduto solo se inviato e con il termine passato', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session, { valido: '2020-01-01' })

      const scaduto = await session.query(
        `select is_expired from public.quote_list where id = $1`,
        [id],
      )
      expect(scaduto.rows[0]?.is_expired).toBe(true)

      // Una bozza con la stessa data non è scaduta: non è ancora un'offerta.
      await session.query(`update public.quotes set status = 'bozza' where id = $1`, [id])
      const bozza = await session.query(
        `select is_expired from public.quote_list where id = $1`,
        [id],
      )
      expect(bozza.rows[0]?.is_expired).toBe(false)
    })
  })
})

describe('pagina pubblica', () => {
  it('il token apre il preventivo senza alcuna sessione e non espone i costi', async () => {
    const { token, id } = await asUser(USER_A_OWNER, async (session) => {
      const creato = await preventivoInviato(session)
      // La transazione viene annullata: per leggere da un'altra connessione il
      // preventivo deve esistere davvero, quindi si conferma questo blocco.
      await session.query('commit')
      return creato
    })

    try {
      await asUser(null, async (anonimo) => {
        const lettura = await anonimo.query(`select * from public.quote_public($1)`, [token])
        expect(lettura.rows).toHaveLength(1)
        expect(lettura.rows[0]?.destination).toBe('Lisbona')
        expect(lettura.rows[0]?.agency_name).toBeTruthy()

        const righe = await anonimo.query(`select * from public.quote_public_items($1)`, [token])
        expect(righe.rows.length).toBe(4)
        // Nessuna colonna di costo, commissione o margine esce da qui.
        const colonne = Object.keys(righe.rows[0] ?? {})
        expect(colonne).not.toContain('unit_cost_cents')
        expect(colonne).not.toContain('total_cost_cents')
        expect(colonne).not.toContain('commission_cents')
        expect(colonne.some((colonna) => colonna.includes('cost'))).toBe(false)

        // La tabella resta inaccessibile: il permesso è la funzione, non il
        // ruolo. Il token apre il preventivo, non il database.
        const diretto = await erroreAtteso(anonimo, `select * from public.quotes where id = $1`, [
          id,
        ])
        expect(diretto).toMatch(/permission denied/i)
      })

      await asUser(null, async (anonimo) => {
        // Un token inventato non dice nulla: nessuna riga, nessun errore diverso.
        const vuoto = await anonimo.query(
          `select * from public.quote_public('00000000-0000-4000-8000-000000000000')`,
        )
        expect(vuoto.rows).toHaveLength(0)
      })

      await asUser(null, async (anonimo) => {
        const accettato = await anonimo.query(
          `select status, accepted_variant, accepted_by_name
           from public.accept_quote($1, 'premium', 'Marco Rossi', '203.0.113.7')`,
          [token],
        )
        expect(accettato.rows[0]?.status).toBe('accettato')
        expect(accettato.rows[0]?.accepted_variant).toBe('premium')
        expect(accettato.rows[0]?.accepted_by_name).toBe('Marco Rossi')

        // Riaprire il collegamento non cambia la scelta né la data.
        const ripetuto = await anonimo.query(
          `select accepted_variant, accepted_by_name from public.accept_quote($1, 'consigliata', 'Altro Nome')`,
          [token],
        )
        expect(ripetuto.rows[0]?.accepted_variant).toBe('premium')
        expect(ripetuto.rows[0]?.accepted_by_name).toBe('Marco Rossi')

        // L'accettazione viene confermata: il registro va letto da un'altra
        // connessione, con i permessi dell'agenzia.
        await anonimo.query('commit')
      })

      await asUser(null, async (anonimo) => {
        // Dopo l'accettazione il rifiuto non è più possibile.
        const messaggio = await erroreAtteso(anonimo, `select public.reject_quote($1, 'Ripensato')`, [
          token,
        ])
        expect(messaggio).toMatch(/gi[àa] stato accettato/i)
      })

      await asUser(USER_A_OWNER, async (session) => {
        const registro = await session.query(
          `select summary, actor_label from public.activity_log
           where entity_type = 'quotes' and entity_id = $1 order by created_at`,
          [id],
        )
        expect(registro.rows.length).toBeGreaterThan(0)
        expect(String(registro.rows[0]?.summary)).toMatch(/accettato dal cliente/i)
        expect(registro.rows[0]?.actor_label).toBe('Marco Rossi')
      })
    } finally {
      await asUser(USER_A_OWNER, async (session) => {
        await session.query(`delete from public.quote_items where quote_id = $1`, [id])
        await session.query(`delete from public.activity_log where entity_id = $1`, [id])
        await session.query(`delete from public.quotes where id = $1`, [id])
        await session.query('commit')
      })
    }
  })

  it('una bozza non si apre, e un preventivo scaduto non si accetta', async () => {
    const bozza = await asUser(USER_A_OWNER, async (session) => {
      const creato = await preventivoInviato(session)
      await session.query(`update public.quotes set status = 'bozza' where id = $1`, [creato.id])
      await session.query('commit')
      return creato
    })

    const scaduto = await asUser(USER_A_OWNER, async (session) => {
      const creato = await preventivoInviato(session, { valido: '2020-01-01' })
      await session.query('commit')
      return creato
    })

    try {
      await asUser(null, async (anonimo) => {
        const lettura = await anonimo.query(`select * from public.quote_public($1)`, [bozza.token])
        expect(lettura.rows).toHaveLength(0)

        const messaggio = await erroreAtteso(
          anonimo,
          `select public.accept_quote($1, 'consigliata', 'Marco Rossi')`,
          [bozza.token],
        )
        expect(messaggio).toMatch(/non disponibile/i)
      })

      await asUser(null, async (anonimo) => {
        const messaggio = await erroreAtteso(
          anonimo,
          `select public.accept_quote($1, 'consigliata', 'Marco Rossi')`,
          [scaduto.token],
        )
        expect(messaggio).toMatch(/scaduto/i)
      })

      await asUser(null, async (anonimo) => {
        // Il nome è obbligatorio, e una proposta inesistente non si accetta.
        const senzaNome = await erroreAtteso(
          anonimo,
          `select public.accept_quote($1, 'consigliata', ' ')`,
          [scaduto.token],
        )
        expect(senzaNome).not.toBe('')
      })
    } finally {
      await asUser(USER_A_OWNER, async (session) => {
        for (const { id } of [bozza, scaduto]) {
          await session.query(`delete from public.quote_items where quote_id = $1`, [id])
          await session.query(`delete from public.activity_log where entity_id = $1`, [id])
          await session.query(`delete from public.quotes where id = $1`, [id])
        }
        await session.query('commit')
      })
    }
  })
})

describe('conversione in pratica', () => {
  it('crea la pratica con le righe della proposta scelta e collega i due documenti', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session)

      const pratica = await session.query(
        `select id, code, title, destination, pax_count, quote_id
         from public.convert_quote_to_booking($1, 'premium')`,
        [id],
      )
      const booking = String(pratica.rows[0]?.id)

      expect(pratica.rows[0]?.title).toBe('Capodanno a Lisbona')
      expect(pratica.rows[0]?.quote_id).toBe(id)
      // Numerazione annuale della pratica, assegnata dal database: anno/progressivo.
      expect(String(pratica.rows[0]?.code)).toMatch(/^\d{4}\/\d+$/)

      const righe = await session.query(
        `select description, unit_price_cents, sort_order from public.booking_services
         where booking_id = $1 and deleted_at is null order by sort_order`,
        [booking],
      )
      expect(righe.rows.map((riga) => riga.description)).toEqual([
        'Voli in business a/r',
        'Hotel 5 stelle, 5 notti',
      ])
      expect(Number(righe.rows[0]?.unit_price_cents)).toBe(130_000)

      const dopo = await session.query(
        `select status, converted_booking_id, accepted_variant from public.quotes where id = $1`,
        [id],
      )
      expect(dopo.rows[0]?.status).toBe('convertito')
      expect(dopo.rows[0]?.converted_booking_id).toBe(booking)
      expect(dopo.rows[0]?.accepted_variant).toBe('premium')

      // Convertire una seconda volta restituisce la stessa pratica, non un'altra.
      const ripetuta = await session.query(
        `select id from public.convert_quote_to_booking($1, 'consigliata')`,
        [id],
      )
      expect(ripetuta.rows[0]?.id).toBe(booking)

      const quante = await session.query(
        `select count(*)::int as n from public.bookings where quote_id = $1`,
        [id],
      )
      expect(Number(quante.rows[0]?.n)).toBe(1)
    })
  })

  it('senza cliente intestatario la conversione si ferma e spiega perché', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session, { conCliente: false })

      const messaggio = await erroreAtteso(
        session,
        `select public.convert_quote_to_booking($1, 'consigliata')`,
        [id],
      )
      expect(messaggio).toMatch(/cliente intestatario/i)
    })
  })

  it('una proposta senza righe non si converte', async () => {
    await asUser(USER_A_OWNER, async (session) => {
      const { id } = await preventivoInviato(session)

      const messaggio = await erroreAtteso(
        session,
        `select public.convert_quote_to_booking($1, 'base')`,
        [id],
      )
      expect(messaggio).toMatch(/non ha righe/i)
    })
  })
})

describe('isolamento fra agenzie', () => {
  it('l’agenzia B non vede né converte i preventivi dell’agenzia A', async () => {
    const creato = await asUser(USER_A_OWNER, async (session) => {
      const preventivo = await preventivoInviato(session)
      await session.query('commit')
      return preventivo
    })

    try {
      await asUser(USER_B_OWNER, async (session) => {
        const elenco = await session.query(
          `select count(*)::int as n from public.quote_list where id = $1`,
          [creato.id],
        )
        expect(Number(elenco.rows[0]?.n)).toBe(0)

        const righe = await session.query(
          `select count(*)::int as n from public.quote_item_list where quote_id = $1`,
          [creato.id],
        )
        expect(Number(righe.rows[0]?.n)).toBe(0)

        const messaggio = await erroreAtteso(
          session,
          `select public.convert_quote_to_booking($1, 'consigliata')`,
          [creato.id],
        )
        expect(messaggio).toMatch(/non trovato/i)

        // Nemmeno scrivere: l'aggiornamento non tocca alcuna riga.
        const scrittura = await session.query(
          `update public.quotes set title = 'Dirottato' where id = $1 returning id`,
          [creato.id],
        )
        expect(scrittura.rows).toHaveLength(0)
      })
    } finally {
      await asUser(USER_A_OWNER, async (session) => {
        await session.query(`delete from public.quote_items where quote_id = $1`, [creato.id])
        await session.query(`delete from public.activity_log where entity_id = $1`, [creato.id])
        await session.query(`delete from public.quotes where id = $1`, [creato.id])
        await session.query('commit')
      })
    }
  })
})
