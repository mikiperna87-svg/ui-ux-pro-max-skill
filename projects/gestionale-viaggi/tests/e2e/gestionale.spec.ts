import { expect, type Page, test } from '@playwright/test'

/**
 * Percorsi autenticati.
 *
 * Girano contro il banco di prova locale (supabase/testing/local-api.mjs), che
 * espone la stessa superficie HTTP di Supabase sopra al Postgres con le
 * migrazioni e il seed reali: le policy RLS attraversate qui sono quelle vere.
 * Se l'ambiente punta a un progetto Supabase, funzionano allo stesso modo.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
  operatore: { email: 'operatore@orizzontiviaggi.it', password: 'Gestionale2026!' },
  amministrativo: { email: 'amministrativo@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

/** Gli indicatori della panoramica, come regione accessibile. */
const indicatori = (page: Page) => page.getByRole('region', { name: 'Indicatori del periodo' })

/**
 * Su schermo stretto la barra laterale è un pannello a scomparsa: per leggere
 * le voci di navigazione va aperto.
 */
async function apriNavigazione(page: Page) {
  const bottone = page.getByRole('button', { name: 'Apri il menu' })
  if (await bottone.isVisible()) {
    await bottone.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }
}

async function accedi(page: Page, chi: keyof typeof CREDENZIALI) {
  const { email, password } = CREDENZIALI[chi]
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

test.describe('Panoramica', () => {
  test('mostra gli indicatori dell’agenzia dopo l’accesso', async ({ page }) => {
    await accedi(page, 'titolare')

    await expect(page.getByRole('heading', { name: /Buongiorno, Giulia/ })).toBeVisible()
    await expect(indicatori(page).getByText('Venduto', { exact: true })).toBeVisible()

    // Gli importi sono formattati in euro con separatore delle migliaia.
    const venduto = indicatori(page)
      .locator('p')
      .filter({ hasText: /^\d{1,3}(\.\d{3})*,\d{2}\s?€$/ })
      .first()
    await expect(venduto).toBeVisible()
  })

  test('il titolare vede il margine', async ({ page }) => {
    await accedi(page, 'titolare')
    await expect(indicatori(page).getByText('Margine', { exact: true })).toBeVisible()
    await expect(indicatori(page).getByText(/sul venduto/)).toBeVisible()
  })

  test('il periodo si può cambiare e resta nell’indirizzo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.getByRole('link', { name: '90 giorni' }).click()
    await expect(page).toHaveURL(/periodo=90/)
    await expect(page.getByRole('link', { name: '90 giorni' })).toHaveAttribute('aria-current', 'true')
  })

  test('l’elenco delle partenze porta una data e uno stato leggibili', async ({ page }) => {
    await accedi(page, 'titolare')
    const sezione = page.getByRole('heading', { name: 'Partenze nei prossimi 30 giorni' })
    await expect(sezione).toBeVisible()
  })
})

test.describe('Ruoli', () => {
  test('l’operatore non vede la voce Impostazioni', async ({ page }) => {
    await accedi(page, 'operatore')
    await apriNavigazione(page)
    await expect(page.getByRole('link', { name: 'Panoramica' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Impostazioni' })).toHaveCount(0)
  })

  test('l’operatore che digita l’indirizzo delle impostazioni trova una pagina assente', async ({ page }) => {
    await accedi(page, 'operatore')
    await page.goto('/impostazioni')
    await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible()
  })

  test('l’amministrativo vede le scadenze fornitore, l’operatore no', async ({ page }) => {
    await accedi(page, 'amministrativo')
    await expect(page.getByRole('heading', { name: 'Pagamenti a fornitore in scadenza' })).toBeVisible()

    await page.getByRole('button', { name: /Profilo di/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'Esci', exact: true }).click()
    await page.waitForURL(/\/accedi/)

    await accedi(page, 'operatore')
    await expect(page.getByRole('heading', { name: 'Pagamenti a fornitore in scadenza' })).toHaveCount(0)
  })
})

test.describe('Impostazioni', () => {
  test('il titolare salva i dati dell’agenzia', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/impostazioni')

    const telefono = page.locator('input[name="phone"]')
    const nuovo = `+39 0332 ${Math.floor(100_000 + Math.random() * 899_999)}`
    await telefono.fill(nuovo)
    await page.getByRole('button', { name: 'Salva i dati' }).click()

    await expect(page.getByText('Dati dell’agenzia aggiornati.')).toBeVisible()
    await page.reload()
    await expect(page.locator('input[name="phone"]')).toHaveValue(nuovo)
  })

  test('gli utenti dell’agenzia compaiono con il loro ruolo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/impostazioni')
    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()

    await expect(page.getByText('Giulia Marchetti')).toBeVisible()
    await expect(page.getByText('Paolo Ferrero')).toBeVisible()
    await expect(page.getByText('Sara Bonomi')).toBeVisible()
  })

  test('i parametri delle scadenze si salvano in giorni e percentuali', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/impostazioni')
    await page.getByRole('tab', { name: 'Parametri' }).click()

    await page.locator('input[name="deposit_due_days"]').fill('4')
    await page.locator('input[name="deposit_percent"]').fill('35')
    await page.getByRole('button', { name: 'Salva i parametri' }).click()

    await expect(page.getByText('Parametri aggiornati.')).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: 'Parametri' }).click()
    await expect(page.locator('input[name="deposit_percent"]')).toHaveValue('35')
  })
})

test.describe('Comandi e tema', () => {
  test('la tavolozza dei comandi si apre con la tastiera e naviga', async ({ page }) => {
    await accedi(page, 'titolare')

    await page.keyboard.press('ControlOrMeta+k')
    const ricerca = page.getByRole('combobox')
    await expect(ricerca).toBeVisible()

    await ricerca.fill('impost')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/impostazioni/)
  })

  test('il tema scelto resta dopo il ricaricamento', async ({ page }) => {
    await accedi(page, 'titolare')

    await page.getByRole('button', { name: 'Cambia tema' }).click()
    // Il menu compare solo a idratazione avvenuta: aspettarlo evita clic a vuoto.
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'Scuro', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 10_000 })

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('l’uscita riporta al login e protegge di nuovo le pagine', async ({ page }) => {
    await accedi(page, 'titolare')

    await page.getByRole('button', { name: /Profilo di/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'Esci', exact: true }).click()
    await page.waitForURL(/\/accedi/)

    await page.goto('/')
    await expect(page).toHaveURL(/\/accedi/)
  })
})
