import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, AGENCY_B, seedTenants, USER_A_ADMIN, USER_B_OWNER } from './helpers'

/**
 * I documenti pregressi: le fatture che arrivano dal gestionale di prima.
 *
 * Tre cose devono reggere, e sono le tre che costano se cedono. Il numero di
 * origine si conserva, perché una fattura è il suo numero. Il contatore va
 * avanti, altrimenti la prima fattura nuova riusa un numero già speso e il
 * database la rifiuta — o peggio, non la rifiuta. E un documento importato non
 * si trasmette allo SdI: era già stato trasmesso, e rimandarlo deposita una
 * seconda fattura con lo stesso numero all'Agenzia delle Entrate.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

beforeAll(async () => {
  await seedTenants()
}, 60_000)

type Query = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>

/** Esegue il corpo come utente autenticato, in una transazione sempre annullata. */
async function come<T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn((sql, params) => client.query(sql, params))
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}

const RIGHE = JSON.stringify([
  { description: 'Pacchetto Lisbona', quantity: 1, unit_price_cents: 184000, cost_cents: 142000, vat_bps: 2200, vat_regime: 'art_74_ter' },
])

/**
 * L'anno su cui provare la numerazione.
 *
 * I dati dimostrativi e le prove dall'interfaccia vivono negli anni recenti e
 * restano nel database: un test che si aspetta un contatore a zero su quelli
 * passa solo la prima volta. Qui si usa un anno fuori mano, e tutte le attese
 * sono relative a quello che il contatore vale all'inizio.
 */
const ANNO_PROVA = 2019

async function contatore(q: Query, anno: number): Promise<number> {
  const esito = await q(
    `select coalesce(max(last_number), 0)::integer as ultimo
     from public.document_counters
     where agency_id = $1 and kind = 'fattura' and year = $2`,
    [AGENCY_A, anno],
  )
  return Number(esito.rows[0]!.ultimo)
}

async function cliente(q: Query, agency: string): Promise<string> {
  const esito = await q('select id from public.customers where agency_id = $1 order by id limit 1', [
    agency,
  ])
  return esito.rows[0]!.id as string
}

async function importa(
  q: Query,
  clienteId: string,
  opzioni: Partial<{
    kind: string
    year: number
    number: number
    code: string | null
    issue: string
    due: string | null
    status: string
    regime: string
    righe: string
  }> = {},
) {
  return q(
    `select * from public.import_legacy_invoice(
       $1, $2::app.invoice_kind, $3, $4, $5, $6::date, $7::date,
       $8::app.invoice_status, $9::app.vat_regime, $10, $11::jsonb)`,
    [
      clienteId,
      opzioni.kind ?? 'fattura',
      opzioni.year ?? 2025,
      opzioni.number ?? 417,
      opzioni.code === undefined ? '2025/0417' : opzioni.code,
      opzioni.issue ?? '2025-11-14',
      opzioni.due ?? '2025-12-14',
      opzioni.status ?? 'pagata',
      opzioni.regime ?? 'art_74_ter',
      'Importata dal gestionale precedente',
      opzioni.righe ?? RIGHE,
    ],
  )
}

describe('importazione di un documento pregresso', () => {
  it('conserva numero, anno, codice e data di emissione', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A))
      const fattura = esito.rows[0]!
      expect(fattura.number).toBe(417)
      expect(fattura.year).toBe(2025)
      expect(fattura.code).toBe('2025/0417')
      expect((fattura.issue_date as Date).toISOString().slice(0, 10)).toBe('2025-11-14')
      expect(fattura.status).toBe('pagata')
      expect(fattura.imported_at).not.toBeNull()
    })
  })

  it('calcola imponibile e imposta come per un documento nato qui', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A))
      const fattura = esito.rows[0]!
      // 74-ter: l'IVA si scorpora dal margine, 184000 - 142000 = 42000 lordi.
      expect(Number(fattura.total_cents)).toBe(184_000)
      expect(Number(fattura.vat_cents)).toBe(Math.round((42_000 * 2200) / 12_200))
      expect(Number(fattura.taxable_cents)).toBe(42_000 - Number(fattura.vat_cents))
    })
  })

  it('porta il contatore fino al numero importato', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const clienteId = await cliente(q, AGENCY_A)
      const partenza = await contatore(q, ANNO_PROVA)
      const numero = partenza + 5

      await importa(q, clienteId, {
        year: ANNO_PROVA,
        number: numero,
        code: `${ANNO_PROVA}/${String(numero).padStart(4, '0')}`,
        issue: `${ANNO_PROVA}-11-14`,
      })
      expect(await contatore(q, ANNO_PROVA)).toBe(numero)

      // La fattura successiva prende il numero dopo, non il primo libero: il
      // numero importato è speso.
      const nuova = await q(
        `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime, created_by)
         values ($1, 'fattura', $2, $4, 'emessa', 'ordinaria', $3) returning number`,
        [AGENCY_A, clienteId, USER_A_ADMIN, `${ANNO_PROVA}-12-01`],
      )
      expect(Number(nuova.rows[0]!.number)).toBe(numero + 1)
    })
  })

  // Il contatore non torna indietro: un file disordinato non deve far ripartire
  // la numerazione da un numero basso.
  it('non arretra il contatore su un numero più basso', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const clienteId = await cliente(q, AGENCY_A)
      const alto = (await contatore(q, ANNO_PROVA)) + 400
      const basso = alto - 300

      for (const numero of [alto, basso]) {
        await importa(q, clienteId, {
          year: ANNO_PROVA,
          number: numero,
          code: `${ANNO_PROVA}/${String(numero).padStart(4, '0')}`,
          issue: `${ANNO_PROVA}-11-14`,
        })
      }
      expect(await contatore(q, ANNO_PROVA)).toBe(alto)
    })
  })

  it('compone il codice quando il file non lo porta', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A), { code: null, number: 55 })
      expect(esito.rows[0]!.code).toBe('2025/0055')
    })
  })

  it('rifiuta due volte lo stesso numero', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const clienteId = await cliente(q, AGENCY_A)
      await importa(q, clienteId, { number: 417 })
      await expect(importa(q, clienteId, { number: 417, code: '2025/0417-bis' })).rejects.toThrow(
        /esiste già/i,
      )
    })
  })

  it('rifiuta lo stato bozza', async () => {
    await come(USER_A_ADMIN, async (q) => {
      await expect(
        importa(q, await cliente(q, AGENCY_A), { status: 'bozza' }),
      ).rejects.toThrow(/bozza/i)
    })
  })

  it('rifiuta un documento senza righe', async () => {
    await come(USER_A_ADMIN, async (q) => {
      await expect(importa(q, await cliente(q, AGENCY_A), { righe: '[]' })).rejects.toThrow(
        /almeno una riga/i,
      )
    })
  })

  it('rifiuta una data di emissione nel futuro', async () => {
    await come(USER_A_ADMIN, async (q) => {
      await expect(
        importa(q, await cliente(q, AGENCY_A), { issue: '2099-01-01', year: 2099 }),
      ).rejects.toThrow(/futuro/i)
    })
  })

  // Il cliente di un'altra agenzia non è visibile: la funzione non deve
  // scriverci sopra, e non deve nemmeno confermare che esista.
  it('non importa su un cliente di un’altra agenzia', async () => {
    const altroCliente = await come(USER_B_OWNER, (q) => cliente(q, AGENCY_B))
    await come(USER_A_ADMIN, async (q) => {
      await expect(importa(q, altroCliente)).rejects.toThrow(/non trovato/i)
    })
  })
})

describe('un documento importato non si trasmette', () => {
  it('rifiuta il passaggio a inviata allo SdI', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A))
      const id = esito.rows[0]!.id as string
      await expect(
        q(`update public.invoices set sdi_status = 'inviata' where id = $1`, [id]),
      ).rejects.toThrow(/non si ritrasmette/i)
    })
  })

  it('rifiuta anche il solo progressivo di invio', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A))
      const id = esito.rows[0]!.id as string
      await expect(
        q(`update public.invoices set sdi_progressivo = 'AAAAA' where id = $1`, [id]),
      ).rejects.toThrow(/progressivo/i)
    })
  })

  it('non lascia cancellare la provenienza', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const esito = await importa(q, await cliente(q, AGENCY_A))
      const id = esito.rows[0]!.id as string
      await expect(
        q('update public.invoices set imported_at = null where id = $1', [id]),
      ).rejects.toThrow(/provenienza/i)
    })
  })

  // La via più semplice per sottrarre una fattura vera alla trasmissione sarebbe
  // dichiararla importata.
  it('non lascia dichiarare importato un documento nato qui', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const clienteId = await cliente(q, AGENCY_A)
      const fattura = await q(
        `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime, created_by)
         values ($1, 'fattura', $2, current_date, 'bozza', 'ordinaria', $3) returning id`,
        [AGENCY_A, clienteId, USER_A_ADMIN],
      )
      await expect(
        q('update public.invoices set imported_at = now() where id = $1', [fattura.rows[0]!.id]),
      ).rejects.toThrow(/provenienza/i)
    })
  })
})

describe('il documento importato nel registro IVA', () => {
  it('compare nel mese della sua data di emissione', async () => {
    await come(USER_A_ADMIN, async (q) => {
      await importa(q, await cliente(q, AGENCY_A), { number: 901, code: '2025/0901', issue: '2025-11-14' })
      const registro = await q(
        `select sum(documents_count)::integer as documenti
         from public.vat_register
         where agency_id = $1 and year = 2025 and month = 11`,
        [AGENCY_A],
      )
      expect(Number(registro.rows[0]!.documenti)).toBeGreaterThanOrEqual(1)
    })
  })

  it('si distingue dai documenti nati qui', async () => {
    await come(USER_A_ADMIN, async (q) => {
      const importati = async () => {
        const esito = await q(
          `select count(*)::integer as quanti from public.invoices
           where agency_id = $1 and imported_at is not null and deleted_at is null`,
          [AGENCY_A],
        )
        return Number(esito.rows[0]!.quanti)
      }
      const prima = await importati()
      await importa(q, await cliente(q, AGENCY_A), {
        year: ANNO_PROVA,
        number: 902,
        code: `${ANNO_PROVA}/0902`,
        issue: `${ANNO_PROVA}-11-14`,
      })
      expect(await importati()).toBe(prima + 1)
    })
  })
})
