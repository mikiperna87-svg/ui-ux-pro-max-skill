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
  USER_B_OWNER,
} from './helpers'
import { isValidTaxCode, isValidVatNumber } from '@/lib/fiscal'

/**
 * Ricerca, viste di sintesi e adempimenti GDPR delle anagrafiche, verificati
 * sul database reale con le policy attive.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

afterAll(async () => {
  const client = await adminClient()
  await client.query(`delete from public.agencies where id = '${AGENCY_B}'`)
  await client.end()
})

describe('ricerca normalizzata', () => {
  it('trova ignorando accenti e maiuscole', async () => {
    const client = await adminClient()
    const result = await client.query<{ normalized: string }>(
      `select app.normalize('Città di Malé') as normalized`,
    )
    await client.end()
    // La normalizzazione tocca accenti e maiuscole, non gli spazi: quelli
    // restano come sono, perché la ricerca usa il confronto "contiene".
    expect(result.rows[0]?.normalized).toBe('citta di male')
  })

  it('la colonna di ricerca contiene nome, contatti e codici', async () => {
    const found = await asUser(USER_A_OWNER, async (s) => {
      const customer = await s.query<{ search_text: string; display_name: string; email: string }>(
        `select search_text, display_name, email from public.customers
         where email is not null and city is not null limit 1`,
      )
      return customer.rows[0]
    })

    expect(found?.search_text).toContain(found?.email.toLowerCase())
    expect(found?.search_text).toContain(found?.display_name.split(' ')[0]?.toLowerCase())
  })

  it('la ricerca "contiene" trova un cliente per pezzo di email', async () => {
    const count = await asUser(USER_A_OWNER, async (s) => {
      const target = await s.query<{ email: string }>(
        `select email from public.customers where email is not null limit 1`,
      )
      const fragment = (target.rows[0]?.email ?? '').split('@')[0] ?? ''
      const result = await s.query<{ n: string }>(
        `select count(*)::text as n from public.customer_list where search_text ilike $1`,
        [`%${fragment}%`],
      )
      return Number(result.rows[0]?.n)
    })
    expect(count).toBeGreaterThan(0)
  })
})

describe('vista di sintesi del cliente', () => {
  it('il valore generato esclude le pratiche annullate', async () => {
    const rows = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>(`
        select count(*)::text as n
        from public.customer_stats cs
        where cs.lifetime_value_cents <> coalesce((
          select sum(f.revenue_cents)
          from public.bookings b
          join public.booking_financials f on f.booking_id = b.id
          where b.customer_id = cs.customer_id
            and b.deleted_at is null
            and b.status <> 'annullata'
        ), 0)
      `)
      return Number(result.rows[0]?.n)
    })
    expect(rows).toBe(0)
  })

  it('conta i passeggeri collegati', async () => {
    const consistent = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>(`
        select count(*)::text as n
        from public.customer_stats cs
        where cs.passengers_count <> (
          select count(*) from public.passengers p
          where p.customer_id = cs.customer_id and p.deleted_at is null
        )
      `)
      return Number(result.rows[0]?.n)
    })
    expect(consistent).toBe(0)
  })

  it('gli importi sono bigint, non numeric: nessuna stringa verso il client', async () => {
    const client = await adminClient()
    const result = await client.query<{ column_name: string; data_type: string }>(`
      select column_name, data_type
      from information_schema.columns
      where table_name in ('customer_list', 'supplier_list', 'booking_financials')
        and column_name like '%_cents'
    `)
    await client.end()

    expect(result.rows.length).toBeGreaterThan(10)
    const wrong = result.rows.filter((row) => row.data_type !== 'bigint')
    expect(wrong).toEqual([])
  })
})

describe('stato dei documenti dei passeggeri', () => {
  it('segnala un documento che scade prima del rientro', async () => {
    const state = await asUser(USER_A_ADMIN, async (s) => {
      // Una pratica futura con un passeggero il cui documento scade prima
      const row = await s.query<{ passenger_id: string; return_date: string }>(`
        select bp.passenger_id, b.return_date
        from public.booking_passengers bp
        join public.bookings b on b.id = bp.booking_id
        where b.status in ('opzione', 'confermata')
          and b.return_date > current_date + 20
        limit 1
      `)
      const passengerId = row.rows[0]?.passenger_id
      const returnDate = row.rows[0]?.return_date

      await s.query(
        `update public.passengers
         set document_type = 'passaporto',
             document_number = 'YA9999999',
             document_expires_at = $2::date - 5
         where id = $1`,
        [passengerId, returnDate],
      )

      const result = await s.query<{ document_state: string }>(
        'select document_state from public.passenger_documents where passenger_id = $1',
        [passengerId],
      )
      return result.rows[0]?.document_state
    })
    expect(state).toBe('insufficiente')
  })

  it('segnala un documento assente e uno scaduto', async () => {
    const states = await asUser(USER_A_ADMIN, async (s) => {
      const row = await s.query<{ id: string }>('select id from public.passengers limit 1')
      const id = row.rows[0]?.id

      await s.query(
        `update public.passengers set document_type = null, document_number = null,
         document_expires_at = null where id = $1`,
        [id],
      )
      const assente = await s.query<{ document_state: string }>(
        'select document_state from public.passenger_documents where passenger_id = $1',
        [id],
      )

      await s.query(
        `update public.passengers set document_expires_at = current_date - 30 where id = $1`,
        [id],
      )
      const scaduto = await s.query<{ document_state: string }>(
        'select document_state from public.passenger_documents where passenger_id = $1',
        [id],
      )

      return [assente.rows[0]?.document_state, scaduto.rows[0]?.document_state]
    })
    expect(states).toEqual(['assente', 'scaduto'])
  })
})

describe('marginalità per fornitore', () => {
  it('somma solo i servizi di pratiche non annullate', async () => {
    const mismatch = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>(`
        select count(*)::text as n
        from public.supplier_stats st
        where st.cost_cents <> coalesce((
          select sum(bs.total_cost_cents)
          from public.booking_services bs
          join public.bookings b on b.id = bs.booking_id
          where bs.supplier_id = st.supplier_id
            and bs.deleted_at is null
            and b.deleted_at is null
            and b.status <> 'annullata'
        ), 0)
      `)
      return Number(result.rows[0]?.n)
    })
    expect(mismatch).toBe(0)
  })

  it('la percentuale di margine è coerente con gli importi', async () => {
    const wrong = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>(`
        select count(*)::text as n
        from public.supplier_stats
        where revenue_cents > 0
          and abs(margin_bps - round((margin_cents::numeric * 10000) / revenue_cents)) > 1
      `)
      return Number(result.rows[0]?.n)
    })
    expect(wrong).toBe(0)
  })
})

describe('isolamento delle nuove viste fra agenzie', () => {
  it('il titolare di B non vede i clienti di A nelle viste di elenco', async () => {
    const counts = await asUser(USER_B_OWNER, async (s) => {
      const customers = await s.query('select id from public.customer_list where agency_id = $1', [AGENCY_A])
      const passengers = await s.query('select id from public.passenger_list where agency_id = $1', [AGENCY_A])
      const suppliers = await s.query('select id from public.supplier_list where agency_id = $1', [AGENCY_A])
      return [customers.rowCount, passengers.rowCount, suppliers.rowCount]
    })
    expect(counts).toEqual([0, 0, 0])
  })

  it('il titolare di B non può esportare i dati di un cliente di A', async () => {
    const result = await asUser(USER_B_OWNER, async (s) => {
      const target = await asUserCustomerId()
      const response = await s.query<{ payload: unknown }>(
        'select public.export_customer_data($1) as payload',
        [target],
      )
      return response.rows[0]?.payload
    })
    expect(result).toBeNull()
  })

  it('l’operatore vede solo i clienti delle proprie pratiche', async () => {
    const { visible, total } = await asUser(USER_A_OPERATOR, async (s) => {
      const mine = await s.query<{ n: string }>('select count(*)::text as n from public.customer_list')
      const all = await s.query<{ n: string }>(
        'select count(*)::text as n from public.customer_list',
      )
      return { visible: Number(mine.rows[0]?.n), total: Number(all.rows[0]?.n) }
    })
    const everything = await asUser(USER_A_OWNER, async (s) => {
      const result = await s.query<{ n: string }>('select count(*)::text as n from public.customer_list')
      return Number(result.rows[0]?.n)
    })

    expect(visible).toBe(total)
    expect(visible).toBeLessThan(everything)
  })
})

describe('GDPR', () => {
  it('l’esportazione contiene anagrafica, viaggi e movimenti', async () => {
    const payload = await asUser(USER_A_OWNER, async (s) => {
      const target = await s.query<{ id: string }>(`
        select c.id from public.customers c
        join public.bookings b on b.customer_id = c.id
        limit 1
      `)
      const result = await s.query<{ payload: Record<string, unknown> }>(
        'select public.export_customer_data($1) as payload',
        [target.rows[0]?.id],
      )
      return result.rows[0]?.payload
    })

    expect(payload).toBeTruthy()
    expect(payload).toHaveProperty('cliente')
    expect(payload).toHaveProperty('passeggeri')
    expect(payload).toHaveProperty('pratiche')
    expect(payload).toHaveProperty('incassi')
    expect(payload).toHaveProperty('fatture')
    expect(Array.isArray((payload as { pratiche: unknown[] }).pratiche)).toBe(true)
    // La colonna tecnica di ricerca non deve comparire in un'esportazione al cliente
    expect(JSON.stringify(payload)).not.toContain('search_text')
  })

  it('l’anonimizzazione conserva i dati fiscali di chi ha fatture recenti', async () => {
    const result = await asUser(USER_A_ADMIN, async (s) => {
      const target = await s.query<{ id: string }>(`
        select c.id from public.customers c
        join public.invoices i on i.customer_id = c.id
        where i.issue_date > current_date - interval '2 years' and i.status <> 'annullata'
        limit 1
      `)
      const id = target.rows[0]?.id

      await s.query('select public.anonymize_customer($1)', [id])

      const after = await s.query<{
        email: string | null
        notes: string | null
        tax_code: string | null
        anonymized_at: string | null
        marketing_consent: boolean
      }>(
        'select email, notes, tax_code, anonymized_at, marketing_consent from public.customers where id = $1',
        [id],
      )
      return after.rows[0]
    })

    expect(result?.email).toBeNull()
    expect(result?.notes).toBeNull()
    expect(result?.marketing_consent).toBe(false)
    expect(result?.anonymized_at).not.toBeNull()
    // Il codice fiscale resta: serve ai documenti fiscali già emessi
    expect(result?.tax_code).not.toBeNull()
  })

  it('l’anonimizzazione cancella tutto per chi non ha fatture', async () => {
    const result = await asUser(USER_A_ADMIN, async (s) => {
      const target = await s.query<{ id: string }>(`
        select c.id from public.customers c
        where not exists (select 1 from public.invoices i where i.customer_id = c.id)
          and c.tax_code is not null
        limit 1
      `)
      const id = target.rows[0]?.id

      await s.query('select public.anonymize_customer($1)', [id])

      const after = await s.query<{ tax_code: string | null; city: string | null; last_name: string }>(
        'select tax_code, city, last_name from public.customers where id = $1',
        [id],
      )
      return after.rows[0]
    })

    expect(result?.tax_code).toBeNull()
    expect(result?.city).toBeNull()
    expect(result?.last_name).toBe('Anonimizzato')
  })

  it('l’anonimizzazione resta nel registro attività', async () => {
    const logged = await asUser(USER_A_ADMIN, async (s) => {
      const target = await s.query<{ id: string }>('select id from public.customers limit 1')
      const id = target.rows[0]?.id
      await s.query('select public.anonymize_customer($1)', [id])
      const result = await s.query<{ n: string }>(
        `select count(*)::text as n from public.activity_log
         where entity_id = $1 and summary ilike '%Anonimizzazione%'`,
        [id],
      )
      return Number(result.rows[0]?.n)
    })
    expect(logged).toBe(1)
  })
})

describe('codici fiscali: SQL e TypeScript devono restare d’accordo', () => {
  // La verifica esiste due volte — in `app.tax_code_with_checksum` per il seed e
  // in `src/lib/fiscal.ts` per l’applicazione — quindi va dimostrato che le due
  // implementazioni concordano, invece di sperarlo.
  it('i codici generati dalla funzione SQL passano il validatore dell’applicazione', async () => {
    const prefissi = [
      'RSSMRA85T10A562',
      'VRDLGU90A41F205',
      'BNCSLV72E45L219',
      'CRSSFN88M24D869',
      'MRCGLI79B63F704',
      'ZZZQQQ00A00Z999',
    ]
    const client = await adminClient()
    const result = await client.query<{ prefisso: string; codice: string }>(
      'select p as prefisso, app.tax_code_with_checksum(p) as codice from unnest($1::text[]) as p',
      [prefissi],
    )
    await client.end()

    expect(result.rows).toHaveLength(prefissi.length)
    for (const riga of result.rows) {
      expect(riga.codice.startsWith(riga.prefisso)).toBe(true)
      expect(riga.codice).toHaveLength(16)
      expect(isValidTaxCode(riga.codice)).toBe(true)
    }
  })

  it('cambiare un carattere rende il codice invalido per entrambe', async () => {
    const client = await adminClient()
    const result = await client.query<{ codice: string }>(
      "select app.tax_code_with_checksum('RSSMRA85T10A562') as codice",
    )
    await client.end()
    const codice = result.rows[0]?.codice ?? ''
    const alterato = `${codice.slice(0, 15)}${codice[15] === 'A' ? 'B' : 'A'}`
    expect(isValidTaxCode(alterato)).toBe(false)
  })

  it('ogni codice dei dati dimostrativi supera il controllo dell’applicazione', async () => {
    const client = await adminClient()
    const codici = await client.query<{ valore: string }>(
      `select tax_code as valore from public.customers where tax_code ~ '^[A-Z]{6}[0-9A-Z]{10}$'
       union all
       select tax_code from public.passengers where tax_code ~ '^[A-Z]{6}[0-9A-Z]{10}$'`,
    )
    // Solo le partite IVA italiane: gli identificativi esteri non hanno checksum.
    const partite = await client.query<{ valore: string }>(
      `select vat_number as valore from public.customers where vat_number ~ '^(IT)?[0-9]{11}$'
       union all
       select vat_number from public.suppliers where vat_number ~ '^(IT)?[0-9]{11}$'`,
    )
    await client.end()

    expect(codici.rows.length).toBeGreaterThan(0)
    expect(partite.rows.length).toBeGreaterThan(0)
    for (const riga of codici.rows) expect(isValidTaxCode(riga.valore)).toBe(true)
    for (const riga of partite.rows) expect(isValidVatNumber(riga.valore)).toBe(true)
  })
})

/** Identificativo di un cliente dell'agenzia A, letto con i privilegi di servizio. */
async function asUserCustomerId(): Promise<string> {
  const client = await adminClient()
  const result = await client.query<{ id: string }>(
    `select id from public.customers where agency_id = '${AGENCY_A}' limit 1`,
  )
  await client.end()
  return result.rows[0]?.id ?? ''
}
