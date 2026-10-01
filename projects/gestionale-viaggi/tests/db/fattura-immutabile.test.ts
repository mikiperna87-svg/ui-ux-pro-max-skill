import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { AGENCY_A, seedTenants, USER_A_ADMIN } from './helpers'

/**
 * Una fattura emessa non si riapre.
 *
 * Il controllo della 0013 proteggeva importi, numero, cliente e data, ma si
 * spegneva da solo appena il documento tornava in stato «bozza» — e nessuno
 * impediva di portarcelo. Dal modulo non si poteva, perché l'azione di
 * salvataggio filtra sulle bozze; attraverso l'API sì, perché la policy RLS
 * permette la scrittura sulla tabella a chi ha i permessi contabili.
 *
 * Questi test scrivono in SQL come farebbe quella chiamata.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

beforeAll(async () => {
  await seedTenants()
}, 60_000)

async function conFattura<T>(
  stato: string,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>, id: string) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    const cliente = await client.query<{ id: string }>(
      'select id from public.customers where agency_id = $1 limit 1',
      [AGENCY_A],
    )
    const fattura = await client.query<{ id: string }>(
      `insert into public.invoices (agency_id, kind, customer_id, issue_date, status, vat_regime, created_by)
       values ($1, 'fattura', $2, current_date, 'bozza', 'ordinaria', $3)
       returning id`,
      [AGENCY_A, cliente.rows[0]?.id, USER_A_ADMIN],
    )
    const id = fattura.rows[0]!.id
    await client.query(
      `insert into public.invoice_items (agency_id, invoice_id, description, quantity, unit_price_cents, vat_bps, vat_regime, created_by)
       values ($1, $2, 'Servizio di prova', 1, 10000, 2200, 'ordinaria', $3)`,
      [AGENCY_A, id, USER_A_ADMIN],
    )
    if (stato !== 'bozza') {
      await client.query('update public.invoices set status = $2::app.invoice_status where id = $1', [
        id,
        stato,
      ])
    }
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: USER_A_ADMIN, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn((sql, params) => client.query(sql, params), id)
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}

describe('una fattura emessa', () => {
  it('non torna in bozza', async () => {
    await expect(
      conFattura('emessa', async (q, id) => {
        await q("update public.invoices set status = 'bozza' where id = $1", [id])
      }),
    ).rejects.toThrow(/non torna in bozza/i)
  })

  it('non torna in bozza nemmeno passando da «pagata»', async () => {
    await expect(
      conFattura('pagata', async (q, id) => {
        await q("update public.invoices set status = 'bozza' where id = $1", [id])
      }),
    ).rejects.toThrow(/non torna in bozza/i)
  })

  it('può ancora avanzare di stato', async () => {
    const esito = await conFattura('emessa', async (q, id) => {
      const r = await q("update public.invoices set status = 'pagata' where id = $1", [id])
      return r.rowCount
    })
    expect(esito).toBe(1)
  })

  it('resta intoccabile negli importi', async () => {
    await expect(
      conFattura('emessa', async (q, id) => {
        await q('update public.invoices set total_cents = 1 where id = $1', [id])
      }),
    ).rejects.toThrow(/già emesso/i)
  })

  // Il vecchio percorso completo: riapri, svuota, elimina. Ora si ferma al
  // primo passo, e quindi anche le righe restano al loro posto.
  it('non si lascia svuotare passando per la bozza', async () => {
    await expect(
      conFattura('emessa', async (q, id) => {
        await q("update public.invoices set status = 'bozza' where id = $1", [id])
        await q('delete from public.invoice_items where invoice_id = $1', [id])
      }),
    ).rejects.toThrow(/non torna in bozza/i)
  })

  it('una bozza invece si modifica e si elimina', async () => {
    const esito = await conFattura('bozza', async (q, id) => {
      await q('update public.invoices set notes = $2 where id = $1', [id, 'modificata'])
      const r = await q('delete from public.invoice_items where invoice_id = $1', [id])
      return r.rowCount
    })
    expect(esito).toBe(1)
  })
})
