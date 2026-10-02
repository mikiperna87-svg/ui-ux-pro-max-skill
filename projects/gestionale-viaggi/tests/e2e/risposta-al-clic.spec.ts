import { expect, type Page, test } from '@playwright/test'

/**
 * La risposta al clic.
 *
 * Il router di Next tiene a schermo la pagina corrente finché la prossima non è
 * pronta. Senza un segnale, chi clicca una riga dell'elenco non vede niente per
 * centinaia di millisecondi e pensa che il gestionale non abbia ricevuto il
 * clic — misurato: 1094 ms di silenzio contro i 14 ms della voce di menu, che
 * una rotellina ha sempre avuto.
 *
 * La riga cliccata si dichiara occupata subito. Queste prove tengono il
 * comportamento e, soprattutto, i tre modi in cui potrebbe mentire: segnalando
 * righe che non c'entrano, restando accesa dopo il ritorno, o accendendosi su
 * un gesto che non è una navigazione.
 */
const CREDENZIALI = { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' }

async function accedi(page: Page) {
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(CREDENZIALI.email)
  await page.locator('input[name="password"]:visible').fill(CREDENZIALI.password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

const righe = (page: Page) => page.locator('[data-riga]:visible')
const inAttesa = (page: Page) => page.locator('[data-riga][data-attesa]:visible')

test.describe('Risposta al clic sulle righe', () => {
  test('la riga cliccata si dichiara occupata, e solo quella', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    const prima = righe(page).first()
    await expect(prima).toBeVisible()
    const quante = await righe(page).count()
    expect(quante).toBeGreaterThan(1)

    await prima.locator('a[href^="/pratiche/"]').first().click({ noWaitAfter: true })

    await expect(inAttesa(page)).toHaveCount(1)
    await expect(inAttesa(page).first()).toHaveAttribute('aria-busy', 'true')
  })

  test('il segnale non resta attaccato al ritorno', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    await expect(righe(page).first()).toBeVisible()
    await righe(page).first().locator('a[href^="/pratiche/"]').first().click()
    await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}/, { timeout: 30_000 })

    await page.goBack()
    await expect(righe(page).first()).toBeVisible()
    await expect(inAttesa(page)).toHaveCount(0)
  })

  // Selezionare una riga per un'azione di massa non porta da nessuna parte:
  // dire «sto caricando» sarebbe una bugia, e mostrarla sbiadita farebbe
  // pensare a un errore.
  test('selezionare una riga non è navigare', async ({ page }) => {
    await accedi(page)
    await page.goto('/clienti')
    await expect(righe(page).first()).toBeVisible()

    // Su schermo stretto l'elenco diventa schede e la selezione multipla non
    // esiste: lì non c'è niente da provare.
    const casella = righe(page).first().getByRole('checkbox').first()
    if ((await casella.count()) === 0) {
      test.skip(true, 'Su telefono l’elenco è a schede e non ha selezione multipla')
    }
    await expect(casella).toBeVisible()
    await casella.click()

    await expect(inAttesa(page)).toHaveCount(0)
  })

  // Lo stesso vale per gli elenchi che vivono dentro una scheda: il segnale sta
  // nel componente condiviso, quindi deve funzionare in tutti senza ritocchi.
  test('vale anche per l’elenco dei clienti', async ({ page }) => {
    await accedi(page)
    await page.goto('/clienti')
    await expect(righe(page).first()).toBeVisible()
    await righe(page).first().locator('a[href^="/clienti/"]').first().click({ noWaitAfter: true })
    await expect(inAttesa(page)).toHaveCount(1)
  })
})

/**
 * La barra in cima: l'unico segnale che vale per tutti i comandi, compresi i
 * cinquantaquattro pulsanti che portano a un'altra pagina e quelli che verranno
 * aggiunti domani.
 */
test.describe('Indicatore di navigazione', () => {
  const barra = (page: Page) => page.getByRole('status').filter({ hasText: 'Caricamento della pagina' })

  test('compare appena si clicca un comando che porta altrove', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    await expect(page.getByRole('heading', { name: 'Pratiche' })).toBeVisible()

    await page.getByRole('link', { name: /Nuova pratica/ }).click({ noWaitAfter: true })
    await expect(barra(page)).toBeAttached()
  })

  test('si spegne quando la pagina è arrivata', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    await page.getByRole('link', { name: /Nuova pratica/ }).click()
    await page.waitForURL(/\/pratiche\/nuova/, { timeout: 30_000 })
    await expect(barra(page)).toHaveCount(0)
  })

  // Un collegamento alla pagina in cui si è già non fa partire nessuna
  // navigazione: una barra che compare senza motivo è peggio di nessuna barra.
  test('non compare per un collegamento alla pagina corrente', async ({ page }) => {
    await accedi(page)
    await page.goto('/pratiche')
    await expect(page.getByRole('heading', { name: 'Pratiche' })).toBeVisible()

    // La voce di menu della sezione in cui siamo già. Su telefono la
    // navigazione principale sta dietro un pannello: la regola in prova vive
    // nel componente e non nell'impaginazione, quindi lì non si ripete.
    const voce = page
      .getByRole('navigation', { name: 'Navigazione principale' })
      .getByRole('link', { name: 'Pratiche', exact: true })
    if (!(await voce.isVisible().catch(() => false))) {
      test.skip(true, 'Su telefono la navigazione principale è dietro un pannello')
    }
    await voce.click({ noWaitAfter: true })
    await expect(barra(page)).toHaveCount(0)
  })
})
