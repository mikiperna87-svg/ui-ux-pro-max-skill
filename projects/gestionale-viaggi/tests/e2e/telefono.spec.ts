import { expect, type Page, test } from '@playwright/test'

/**
 * Il gestionale su un telefono da 390 px.
 *
 * Due cose sole, ma misurate: che nessuna pagina si legga scorrendo di lato,
 * e che l'elenco più filtrato del gestionale mostri dei risultati senza
 * doverci scorrere sopra. Sono i due modi in cui un'interfaccia pensata al
 * computer tradisce chi la apre in agenzia con il telefono in mano.
 */
const CREDENZIALI = { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' }

test.describe('Telefono', () => {
  // Solo sul progetto "mobile": su schermo grande queste misure non dicono nulla.
  test.skip(({ viewport }) => (viewport?.width ?? 1280) > 500, 'solo su schermo stretto')

  async function accedi(page: Page) {
    await page.goto('/accedi')
    await page.locator('input[name="email"]:visible').fill(CREDENZIALI.email)
    await page.locator('input[name="password"]:visible').fill(CREDENZIALI.password)
    await page.getByRole('button', { name: 'Accedi' }).click()
    await page.waitForURL('/', { timeout: 30_000 })
  }

  /** Di quanto la pagina eccede la larghezza dello schermo. Zero, sempre. */
  async function eccesso(page: Page): Promise<number> {
    return page.evaluate(() => {
      const d = document.documentElement
      return d.scrollWidth - d.clientWidth
    })
  }

  const PAGINE: ReadonlyArray<[string, string, string | RegExp]> = [
    ['Panoramica', '/', 'Venduto'],
    ['Agenda', '/agenda?finestra=mese', 'Attività aperte'],
    ['Pratiche', '/pratiche', /di\s+\d+/],
    ['Preventivi', '/preventivi', /di\s+\d+/],
    ['Scadenzario', '/scadenzario', /Da incassare|Nessuna rata/],
    ['Fatture', '/fatture', /di\s+\d+|Nessuna fattura/],
    ['Registro IVA', '/registri', /Imponibile|Nessun documento/],
    ['Report', '/report?periodo=anno', 'Venduto'],
    ['Clienti', '/clienti', /di\s+\d+/],
    ['Passeggeri', '/passeggeri', /di\s+\d+|Nessun passeggero/],
    ['Fornitori', '/fornitori', /di\s+\d+|Nessun fornitore/],
    ['Impostazioni', '/impostazioni', 'Dati fiscali'],
  ]

  test('nessuna pagina si legge scorrendo di lato', async ({ page }) => {
    test.slow()
    await accedi(page)

    const fuori: Record<string, number> = {}
    for (const [nome, url, atteso] of PAGINE) {
      await page.goto(url)
      await expect(page.getByText(atteso).filter({ visible: true }).first()).toBeVisible({
        timeout: 20_000,
      })
      const quanto = await eccesso(page)
      if (quanto > 0) fuori[nome] = quanto
    }
    expect(fuori).toEqual({})
  })

  test('nemmeno una scheda di dettaglio o una finestra di dialogo', async ({ page }) => {
    await accedi(page)

    await page.goto('/pratiche')
    await page.locator('[data-riga]:visible').first().getByRole('link').first().click()
    await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await eccesso(page)).toBe(0)

    await page.goto('/agenda?finestra=mese')
    await expect(page.getByText('Attività aperte').filter({ visible: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Nuova attività' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await eccesso(page)).toBe(0)
  })

  test('i filtri stanno chiusi e dicono quanti sono attivi', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    await expect(page.locator('[data-riga]:visible').first()).toBeVisible({ timeout: 20_000 })

    // Chiusi: le tendine dei filtri non occupano lo schermo…
    const filtri = page.getByRole('button', { name: /^Filtri/ })
    await expect(filtri).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('combobox', { name: 'Stato' })).toBeHidden()

    // …e la prima riga si vede senza scorrere.
    const primaRiga = page.locator('[data-riga]:visible').first()
    const posizione = await primaRiga.boundingBox()
    const altezza = page.viewportSize()?.height ?? 844
    expect(posizione?.y ?? altezza).toBeLessThan(altezza)

    // La ricerca invece resta sempre a portata: è il comando che si usa per primo.
    await expect(page.getByRole('searchbox')).toBeVisible()

    // Aperti a comando.
    await filtri.click()
    await expect(filtri).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('combobox', { name: 'Stato' })).toBeVisible()

    // Con due filtri attivi il numero compare sul pulsante, anche da chiuso:
    // un elenco filtrato che non dice di esserlo si legge come un elenco vuoto.
    await page.goto('/pratiche?stato=confermata&pagamento=saldata')
    await expect(page.getByRole('button', { name: /^Filtri/ })).toContainText('2')
  })
})
