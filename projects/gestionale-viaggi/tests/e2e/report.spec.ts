import { expect, type Page, test } from '@playwright/test'

/**
 * I report: periodo, viste, confronto e esportazione.
 *
 * Il valore di questa pagina sta nel fatto che i numeri seguono il periodo
 * scelto e che ciascuno vede solo ciò che gli compete. Sono le due cose che
 * questi test verificano davvero; il resto è che la pagina non si rompa
 * passando da una vista all'altra, su schermo grande e su telefono.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
  operatore: { email: 'operatore@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

async function accedi(page: Page, chi: keyof typeof CREDENZIALI) {
  const { email, password } = CREDENZIALI[chi]
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

/** Il testo davvero a schermo: tabella e schede convivono nel DOM. */
function visibile(page: Page, testo: string) {
  return page.getByText(testo).filter({ visible: true })
}

/** Attende che il corpo sospeso sia arrivato: gli indicatori sono i primi. */
async function attendiIndicatori(page: Page) {
  await expect(page.getByText('Venduto', { exact: true }).first()).toBeVisible()
}

test.describe('Report', () => {
  test('mostra indicatori, andamento e tabella degli operatori', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/report?periodo=anno')
    await attendiIndicatori(page)

    await expect(page.getByRole('heading', { name: 'Report', level: 1 })).toBeVisible()
    await expect(page.getByText(/per data di partenza/)).toBeVisible()
    await expect(page.getByText('Andamento del periodo')).toBeVisible()

    // Il confronto con il periodo precedente accompagna ogni indicatore.
    await expect(page.getByText(/sul periodo precedente/).first()).toBeVisible()

    // Gli operatori dell'agenzia di prova: su schermo grande la riga della
    // tabella, sul telefono la scheda. Entrambe stanno nel DOM, quindi si
    // filtra su ciò che è davvero visibile.
    await expect(visibile(page, 'Giulia Marchetti').first()).toBeVisible()
    await expect(page.getByText('Preventivi creati nel periodo')).toBeVisible()
  })

  test('il periodo scelto cambia le date del report', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/report?periodo=anno')
    await attendiIndicatori(page)

    await page.getByRole('link', { name: 'Anno scorso' }).click()
    await page.waitForURL(/periodo=scorso/, { timeout: 20_000 })
    await expect(page.getByText(/Dal 01\/01\/2025 al 31\/12\/2025/)).toBeVisible()

    await page.getByRole('link', { name: 'Mese corrente' }).click()
    await page.waitForURL(/periodo=mese/, { timeout: 20_000 })
    await expect(page.getByText(/Dal 01\/01\/2025 al 31\/12\/2025/)).toBeHidden()
  })

  test('accetta un periodo scritto a mano e lo mantiene cambiando vista', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/report?periodo=anno')
    await attendiIndicatori(page)

    await page.getByText('Periodo personalizzato').click()
    await page.locator('input[name="da"]:visible').fill('2026-03-01')
    await page.locator('input[name="a"]:visible').fill('2026-06-30')
    await page.getByRole('button', { name: 'Applica' }).click()

    await page.waitForURL(/da=2026-03-01/, { timeout: 20_000 })
    await expect(page.getByText(/Dal 01\/03\/2026 al 30\/06\/2026/)).toBeVisible()

    // Il periodo viaggia con il collegamento della vista: non si perde.
    await page.getByRole('link', { name: 'Destinazioni' }).click()
    await page.waitForURL(/vista=destinazioni/, { timeout: 20_000 })
    await expect(page.getByText(/Dal 01\/03\/2026 al 30\/06\/2026/)).toBeVisible()
  })

  test('passa fra operatori, destinazioni e fornitori', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/report?periodo=anno&vista=destinazioni')
    await attendiIndicatori(page)
    await expect(page.getByText(/Dove vanno i clienti/)).toBeVisible()
    await expect(visibile(page, 'Santorini e Mykonos').first()).toBeVisible()

    await page.goto('/report?periodo=anno&vista=fornitori')
    await attendiIndicatori(page)
    await expect(page.getByText(/quanto resta da pagargli/)).toBeVisible()
    await expect(visibile(page, 'Mediterranea Tour').first()).toBeVisible()
  })

  test('esporta la vista corrente in un file leggibile da Excel', async ({ page }) => {
    await accedi(page, 'titolare')

    const risposta = await page.request.get(
      '/report/esporta?vista=operatori&da=2026-01-01&a=2026-12-31',
    )
    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-type']).toContain('text/csv')
    expect(risposta.headers()['content-disposition']).toContain('report-operatori-2026-01-01')

    const testo = await risposta.text()
    expect(testo).toContain('Operatore;Pratiche;Passeggeri;Venduto')
    expect(testo).toContain('Giulia Marchetti')
    // Nello stesso file, in coda, il blocco dei preventivi.
    expect(testo).toContain('Preventivi creati;Inviati;Accettati')

    const fornitori = await page.request.get(
      '/report/esporta?vista=fornitori&da=2026-01-01&a=2026-12-31',
    )
    expect(fornitori.status()).toBe(200)
    expect(await fornitori.text()).toContain('Fornitore;Tipo;Righe di servizio')
  })

  test('un operatore trova solo le proprie pratiche', async ({ page }) => {
    await accedi(page, 'operatore')
    await page.goto('/report?periodo=anno')
    await attendiIndicatori(page)

    await expect(visibile(page, 'Sara Bonomi').first()).toBeVisible()
    await expect(visibile(page, 'Giulia Marchetti')).toHaveCount(0)
  })
})
