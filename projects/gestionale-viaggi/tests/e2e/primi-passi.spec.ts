import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * Il primo giorno di un'agenzia nuova.
 *
 * Un gestionale vuoto non si giudica dalle funzioni che ha: si giudica da quanto
 * ci vuole a far succedere la prima cosa utile. Queste prove partono da
 * un'agenzia appena registrata — niente clienti, niente pratiche, niente dati
 * fiscali — e verificano che il percorso guidato ci sia, dica il vero e porti
 * dove promette.
 */
const PASSWORD = 'Gestionale2026!'

/** Registra un'agenzia nuova e vuota, e resta dentro come sua titolare. */
async function agenziaNuova(page: Page, nome: string): Promise<string> {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}${nome}`

  await page.goto('/registrati')
  const codice = page.locator('input[name="codice"]')
  if (await codice.count()) await codice.fill(process.env.CODICE_REGISTRAZIONE ?? '')
  await page.fill('input[name="agencyName"]', `Agenzia Nuova ${marca}`)
  await page.fill('input[name="fullName"]', `Titolare ${marca}`)
  await page.fill('input[name="email"]', `titolare.${marca}@example.it`)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  return marca
}

test.describe('Primi passi', () => {
  test('un’agenzia appena nata trova il percorso guidato, non sei zeri', async ({ page }, info) => {
    await agenziaNuova(page, info.project.name)

    await expect(page.getByText('Primi passi', { exact: true })).toBeVisible()
    await expect(page.getByText(/0 di 6 fatti/)).toBeVisible()

    // I passi necessari, in ordine, ognuno con il suo comando.
    for (const comando of [
      'Vai alle impostazioni',
      'Importa i clienti',
      'Importa i fornitori',
      'Importa le pratiche',
    ]) {
      await expect(page.getByRole('link', { name: comando })).toBeVisible()
    }
  })

  test('il comando del primo passo porta dove dice', async ({ page }, info) => {
    await agenziaNuova(page, info.project.name)
    await page.getByRole('link', { name: 'Importa i clienti' }).click()
    await expect(page.getByRole('heading', { name: 'Importa clienti' })).toBeVisible()
  })

  // La spunta non è memorizzata: si ricava dai dati. Importare un cliente deve
  // bastare a farla comparire, senza che nessuno la metta a mano.
  test('il passo si spunta da solo quando il dato c’è', async ({ page }, info) => {
    const marca = await agenziaNuova(page, info.project.name)

    await page.goto('/clienti/importa')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'clienti.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        ['Cognome;Nome;Email;Consenso privacy', `Primo-${marca};Anna;anna.${marca}@example.it;Sì`].join('\n'),
        'utf8',
      ),
    })
    await expect(page.getByRole('heading', { name: 'Anteprima' })).toBeVisible()
    await page.getByRole('button', { name: 'Importa 1 riga' }).click()
    await expect(page.locator('#contenuto').getByText(/1 riga importate?/)).toBeVisible()

    await page.goto('/')
    await expect(page.getByText(/1 di 6 fatti/)).toBeVisible()
    // Il passo dei clienti non offre più il comando: offre la spunta.
    await expect(page.getByRole('link', { name: 'Importa i clienti' })).toHaveCount(0)
  })

  test('si nasconde su richiesta e si ritrova dalle impostazioni', async ({ page }, info) => {
    await agenziaNuova(page, info.project.name)

    await page.getByRole('button', { name: 'Nascondi i primi passi' }).click()
    await expect(page.getByText('Primi passi', { exact: true })).toHaveCount(0)

    await page.goto('/impostazioni')
    await page.getByRole('tab', { name: 'Parametri' }).click()
    await page.getByRole('button', { name: 'Mostra di nuovo i primi passi' }).click()
    // La conferma è anche il punto di sincronismo: navigare prima che l'azione
    // sia finita la interrompe, e la prova racconterebbe un difetto che non c'è.
    await expect(page.getByText(/di nuovo in panoramica/)).toBeVisible()

    await page.goto('/')
    await expect(page.getByText('Primi passi', { exact: true })).toBeVisible()
  })

  // Un operatore non deve vedere un percorso che non può percorrere: i suoi
  // comandi portano alle impostazioni e all'importazione dei documenti, due
  // pagine che per lui non esistono.
  test('non compare a chi non può configurare l’agenzia', async ({ page }) => {
    await page.goto('/accedi')
    await page.locator('input[name="email"]:visible').fill('operatore@orizzontiviaggi.it')
    await page.locator('input[name="password"]:visible').fill(PASSWORD)
    await page.getByRole('button', { name: 'Accedi' }).click()
    await page.waitForURL('/', { timeout: 30_000 })

    await expect(page.getByText('Primi passi', { exact: true })).toHaveCount(0)
  })
})

/**
 * Il riquadro dei primi passi non è coperto dall'audit generale: quello entra
 * nell'agenzia dimostrativa, che ha già tutto fatto e quindi non lo mostra.
 * L'unico stato in cui compare è un'agenzia appena nata, e si verifica qui.
 */
test.describe('Accessibilità dei primi passi', () => {
  const REGOLE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

  for (const tema of ['light', 'dark'] as const) {
    test(`nessuna violazione nel tema ${tema === 'light' ? 'chiaro' : 'scuro'}`, async ({
      page,
    }, info) => {
      await agenziaNuova(page, info.project.name)
      const url = new URL(page.url())
      await page.context().addCookies([
        { name: 'gv-tema', value: tema, domain: url.hostname, path: '/' },
      ])
      await page.goto('/')
      await expect(page.getByText('Primi passi', { exact: true })).toBeVisible()

      const esito = await new AxeBuilder({ page }).withTags(REGOLE).analyze()
      const violazioni = esito.violations.map((v) => ({
        regola: v.id,
        gravita: v.impact,
        elementi: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }))
      expect(violazioni, JSON.stringify(violazioni, null, 2)).toEqual([])
    })
  }
})
