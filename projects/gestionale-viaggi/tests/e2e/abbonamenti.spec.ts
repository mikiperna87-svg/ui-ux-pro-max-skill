import { createHmac } from 'node:crypto'
import pg from 'pg'
import { expect, test } from '@playwright/test'

/**
 * Il webhook degli abbonamenti, provato dove vive: sopra HTTP.
 *
 * I test unitari coprono la firma; quello che non possono vedere è il
 * percorso. La prima versione di questo endpoint rispondeva 200 con dentro la
 * pagina di accesso, perché il middleware lo rimandava al login come
 * qualunque altra rotta: una macchina che parla a una macchina non ha una
 * sessione, e il fornitore di pagamenti avrebbe ricevuto un cortese sì senza
 * che nulla venisse aggiornato.
 */
const SEGRETO = process.env.WEBHOOK_ABBONAMENTI_SECRET ?? 'segreto-e2e'
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

function firma(corpo: string, segreto: string, epoca: number): string {
  return `t=${epoca},v1=${createHmac('sha256', segreto).update(`${epoca}.${corpo}`).digest('hex')}`
}

async function unAgenzia(): Promise<string | null> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const r = await client.query<{ id: string }>(
      'select id from public.agencies where deleted_at is null limit 1',
    )
    return r.rows[0]?.id ?? null
  } finally {
    await client.end()
  }
}

test.describe('webhook degli abbonamenti', () => {
  test('rifiuta tutto quello che non è firmato bene', async ({ request }) => {
    const id = await unAgenzia()
    test.skip(id === null, 'Nessuna agenzia')
    const corpo = JSON.stringify({ agency_id: id, plan_code: 'base', status: 'attivo' })
    const adesso = Math.floor(Date.now() / 1000)

    const casi: readonly [string, Record<string, string>, string][] = [
      ['senza firma', {}, corpo],
      ['firma di un altro segreto', { 'x-firma': firma(corpo, 'altro', adesso) }, corpo],
      ['firma scaduta', { 'x-firma': firma(corpo, SEGRETO, adesso - 1000) }, corpo],
      ['corpo alterato dopo la firma', { 'x-firma': firma(corpo, SEGRETO, adesso) }, `${corpo} `],
    ]

    for (const [nome, headers, body] of casi) {
      const risposta = await request.post('/api/abbonamenti/webhook', {
        headers: { 'content-type': 'application/json', ...headers },
        data: body,
      })
      expect(risposta.status(), nome).toBe(401)
    }
  })

  test('con la firma giusta aggiorna l’abbonamento', async ({ request }) => {
    const id = await unAgenzia()
    test.skip(id === null, 'Nessuna agenzia')
    const corpo = JSON.stringify({
      agency_id: id,
      plan_code: 'completo',
      status: 'attivo',
      valid_until: '2099-12-31',
    })
    const risposta = await request.post('/api/abbonamenti/webhook', {
      headers: {
        'content-type': 'application/json',
        'x-firma': firma(corpo, SEGRETO, Math.floor(Date.now() / 1000)),
      },
      data: corpo,
    })
    expect(risposta.status()).toBe(200)

    const client = new pg.Client({ connectionString })
    await client.connect()
    const r = await client.query('select plan_code, status from public.subscriptions where agency_id = $1', [id])
    await client.end()
    expect(r.rows[0]).toMatchObject({ plan_code: 'completo', status: 'attivo' })
  })

  test('un corpo firmato ma senza senso viene rifiutato con 400', async ({ request }) => {
    const corpo = JSON.stringify({ agency_id: 'non-un-uuid', plan_code: 'base', status: 'attivo' })
    const risposta = await request.post('/api/abbonamenti/webhook', {
      headers: {
        'content-type': 'application/json',
        'x-firma': firma(corpo, SEGRETO, Math.floor(Date.now() / 1000)),
      },
      data: corpo,
    })
    expect(risposta.status()).toBe(400)
  })
})
