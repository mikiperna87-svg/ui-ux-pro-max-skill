import pg from 'pg'
import { expect, test, type Page } from '@playwright/test'

/**
 * Il percorso della fattura elettronica, dal pannello al file.
 *
 * È l'unico modo per verificare che le quattro parti — verifica, assegnazione
 * del progressivo, generazione e scarico — si tengano insieme: ciascuna ha i
 * suoi test, ma è la catena a dover funzionare.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

async function fatturaConRecapito(): Promise<{ id: string; totale: number } | null> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const esito = await client.query<{ id: string; total_cents: string }>(
      `select i.id, i.total_cents::text
       from public.invoices i
       join public.customers c on c.id = i.customer_id
       where i.status <> 'bozza'
         and i.kind = 'fattura'
         and i.deleted_at is null
         and c.sdi_code is not null
         and i.sdi_progressivo is null
       order by i.issue_date desc
       limit 1`,
    )
    const riga = esito.rows[0]
    return riga ? { id: riga.id, totale: Number(riga.total_cents) } : null
  } finally {
    await client.end()
  }
}

async function accedi(page: Page) {
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill('amministrativo@orizzontiviaggi.it')
  await page.locator('input[name="password"]:visible').fill('Gestionale2026!')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 30_000, waitUntil: 'commit' })
}

/** "1.234,56 €" → 123456 */
function centesimi(testo: string): number {
  const pulito = testo.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '')
  return Number(pulito)
}

test('dal pannello al file XML, con gli importi che tornano', async ({ page }) => {
  const fattura = await fatturaConRecapito()
  test.skip(fattura === null, 'Nessuna fattura con recapito da preparare')
  if (!fattura) return

  await accedi(page)
  await page.goto(`/fatture/${fattura.id}`)

  const pannello = page.getByRole('heading', { name: 'Fattura elettronica' })
  await expect(pannello).toBeVisible()

  const prepara = page.getByRole('button', { name: 'Prepara il file' })
  await expect(prepara).toBeEnabled()
  await prepara.click()

  // Il nome del file compare solo dopo l'assegnazione del progressivo.
  await expect(page.getByText(/^IT\d{11}_[0-9A-Z]{5}\.xml$/)).toBeVisible({ timeout: 30_000 })

  const risposta = await page.request.get(`/fatture/${fattura.id}/xml`)
  expect(risposta.status()).toBe(200)
  expect(risposta.headers()['content-type']).toContain('xml')

  const xml = await risposta.text()
  expect(xml).toContain('<p:FatturaElettronica versione="FPR12"')
  expect(xml).toContain('<TipoDocumento>TD01</TipoDocumento>')
  expect(xml).toContain('<RegimeFiscale>RF01</RegimeFiscale>')

  // Il totale dichiarato nel file è quello della fattura, al centesimo: se
  // divergessero, il documento telematico contraddirebbe quello cartaceo.
  const totale = xml.match(/<ImportoTotaleDocumento>([\d.]+)<\/ImportoTotaleDocumento>/)?.[1]
  expect(totale).toBeDefined()
  expect(Math.round(Number(totale) * 100)).toBe(fattura.totale)

  // E lo stesso totale è quello che il gestionale mostra a schermo.
  const aSchermo = await page.getByText(/Totale documento/).locator('..').innerText()
  expect(centesimi(aSchermo)).toBe(fattura.totale)
})

test('un secondo scarico dà lo stesso file, perché il nome identifica la fattura', async ({
  page,
}) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const esito = await client.query<{ id: string }>(
    `select id from public.invoices where sdi_progressivo is not null limit 1`,
  )
  await client.end()
  const id = esito.rows[0]?.id
  test.skip(!id, 'Nessuna fattura già preparata')
  if (!id) return

  await accedi(page)
  const primo = await page.request.get(`/fatture/${id}/xml`)
  const secondo = await page.request.get(`/fatture/${id}/xml`)
  expect(primo.status()).toBe(200)
  expect(await primo.text()).toBe(await secondo.text())
  expect(primo.headers()['content-disposition']).toBe(
    secondo.headers()['content-disposition'],
  )
})
