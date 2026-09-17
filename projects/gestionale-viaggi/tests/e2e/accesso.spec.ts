import { expect, type Page, test } from '@playwright/test'

/**
 * I pannelli delle schede sono etichettati dai rispettivi selettori, quindi
 * getByLabel('Email') sarebbe ambiguo: qui puntiamo sempre al campo vero.
 */
const campoEmail = (page: Page) => page.locator('input[name="email"]:visible')
const campoPassword = (page: Page) => page.locator('input[name="password"]:visible')

test.describe('Percorso di accesso', () => {
  test('una rotta protetta rimanda al login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/accedi/)
    await expect(page.getByRole('heading', { name: 'Accedi al gestionale' })).toBeVisible()
  })

  test('conserva la destinazione richiesta', async ({ page }) => {
    await page.goto('/impostazioni')
    await expect(page).toHaveURL(/successivo=%2Fimpostazioni/)
  })

  test('si passa dall’accesso con password al link via email', async ({ page }) => {
    await page.goto('/accedi')

    await expect(campoPassword(page)).toBeVisible()

    await page.getByRole('tab', { name: 'Link via email' }).click()
    await expect(page.getByRole('button', { name: 'Inviami il link di accesso' })).toBeVisible()
    await expect(page.getByText(/link valido una sola volta/i)).toBeVisible()
  })

  test('mostra l’errore sotto al campo quando l’email non è valida', async ({ page }) => {
    await page.goto('/accedi')
    await campoEmail(page).fill('non-una-email')
    await campoPassword(page).fill('qualcosa')
    await page.getByRole('button', { name: 'Accedi' }).click()

    await expect(page.getByText('Indirizzo email non valido')).toBeVisible()
  })

  test('porta al recupero password e alla registrazione', async ({ page }) => {
    await page.goto('/accedi')

    await page.getByRole('link', { name: 'Password dimenticata?' }).click()
    await expect(page.getByRole('heading', { name: 'Recupera la password' })).toBeVisible()

    await page.goto('/accedi')
    await page.getByRole('link', { name: 'Crea un’agenzia' }).click()
    await expect(page.getByRole('heading', { name: 'Crea la tua agenzia' })).toBeVisible()
  })

  test('il recupero password non rivela se l’indirizzo esiste', async ({ page }) => {
    await page.goto('/recupera-password')
    await campoEmail(page).fill('chiunque@example.it')
    await page.getByRole('button', { name: 'Inviami le istruzioni' }).click()

    await expect(page.getByText(/Se l’indirizzo è registrato/)).toBeVisible()
  })
})

test.describe('Qualità dell’interfaccia', () => {
  test('segue la preferenza di sistema per chiaro e scuro', async ({ page }) => {
    /** I token sono in oklch: la prima componente è la luminosità (0 = nero, 1 = bianco). */
    const lightness = async () =>
      page.evaluate(() => {
        const value = getComputedStyle(document.body).backgroundColor
        const match = value.match(/oklch\(\s*([\d.]+)/)
        return match ? Number(match[1]) : Number.NaN
      })

    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/accedi')
    const chiaro = await lightness()

    await page.emulateMedia({ colorScheme: 'dark' })
    const scuro = await lightness()

    expect(chiaro).toBeGreaterThan(0.8)
    expect(scuro).toBeLessThan(0.3)
  })

  test('non scorre in orizzontale a 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/accedi')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('si compila da tastiera e il fuoco resta visibile', async ({ page }) => {
    await page.goto('/accedi')

    // Il campo email riceve il fuoco all'apertura, il Tab porta alla password.
    await expect(campoEmail(page)).toBeFocused()
    await page.keyboard.press('Tab')
    const password = campoPassword(page)
    await expect(password).toBeFocused()

    // Il contorno del fuoco esiste solo per la navigazione da tastiera
    // (:focus-visible), ed e' questo il caso che conta verificare.
    const outline = await password.evaluate((element) => {
      const style = getComputedStyle(element)
      return `${style.outlineStyle} ${style.outlineWidth}`
    })
    expect(outline).not.toBe('none 0px')

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Accedi' })).toBeFocused()
  })

  test('offre il collegamento per saltare al contenuto', async ({ page }) => {
    await page.goto('/accedi')
    const skip = page.getByRole('link', { name: 'Salta al contenuto' })

    // Il collegamento apre l'ordine di tabulazione: lo si raggiunge tornando
    // indietro dal campo che ha il fuoco iniziale.
    for (let step = 0; step < 6 && !(await skip.evaluate((el) => el === document.activeElement)); step += 1) {
      await page.keyboard.press('Shift+Tab')
    }

    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
  })
})
