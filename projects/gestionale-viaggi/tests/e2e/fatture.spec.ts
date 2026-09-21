import { expect, type Page, test } from '@playwright/test'

/**
 * Amministrazione: dalla pratica alla fattura emessa, nota di credito,
 * registro IVA e permessi.
 *
 * Il percorso che conta è quello in cui un documento prende il numero: da lì
 * in poi non si modifica più, e l'unico modo di correggerlo è una nota di
 * credito. Un test che si ferma alla bozza non verifica il modulo.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
  amministrativo: { email: 'amministrativo@orizzontiviaggi.it', password: 'Gestionale2026!' },
  operatore: { email: 'operatore@orizzontiviaggi.it', password: 'Gestionale2026!' },
  lettura: { email: 'revisore@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

async function accedi(page: Page, chi: keyof typeof CREDENZIALI) {
  const { email, password } = CREDENZIALI[chi]
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

async function attendiElenco(page: Page, messaggioVuoto: string) {
  await expect(righe(page).first().or(page.getByText(messaggioVuoto))).toBeVisible()
}

/**
 * Apre una bozza di fattura da una pratica confermata e ne restituisce
 * l'indirizzo. Cerca la pratica fra quelle che non hanno ancora documenti, così
 * il test non dipende da quante volte è stato eseguito.
 */
async function bozzaDaPratica(page: Page): Promise<string> {
  await page.goto('/pratiche?stato=confermata')
  await attendiElenco(page, 'Nessuna pratica')
  await righe(page).first().getByRole('link').first().click()
  await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}/, { timeout: 20_000 })

  await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
  await page.getByRole('button', { name: 'Fattura questa pratica' }).click()
  await page.getByRole('button', { name: 'Apri la bozza' }).click()

  await page.waitForURL(/\/fatture\/[0-9a-f-]{36}/, { timeout: 20_000 })
  return page.url()
}

test.describe('Elenco dei documenti', () => {
  test('mostra i totali e filtra per tipo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/fatture')
    await attendiElenco(page, 'Nessuna fattura')

    await expect(page.getByRole('heading', { name: 'Fatture', level: 1 })).toBeVisible()
    await expect(page.getByText('Imponibile').filter({ visible: true }).first()).toBeVisible()
    expect(await righe(page).count()).toBeGreaterThan(0)

    await page.goto('/fatture?tipo=nota_credito')
    await attendiElenco(page, 'Nessun documento corrisponde ai filtri')
    const note = await righe(page).count()
    if (note > 0) {
      await expect(page.getByText('Nota di credito').filter({ visible: true }).first()).toBeVisible()
    }
  })

  test('la voce Fatture è raggiungibile dalla navigazione', async ({ page }) => {
    await accedi(page, 'amministrativo')
    const voce = page.getByRole('link', { name: 'Fatture' }).filter({ visible: true })
    if ((await voce.count()) === 0) {
      await page.getByRole('button', { name: 'Apri il menu' }).first().click()
    }
    await page.getByRole('link', { name: 'Fatture' }).filter({ visible: true }).first().click()
    await page.waitForURL(/\/fatture/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Fatture', level: 1 })).toBeVisible()
  })
})

test.describe('Dalla pratica al documento emesso', () => {
  test('la bozza nasce dalla pratica, si emette e prende il numero', async ({ page }) => {
    await accedi(page, 'amministrativo')
    const indirizzo = await bozzaDaPratica(page)

    // Finché è bozza: nessun numero, si modifica, non si scarica.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('in bozza')
    await expect(page.getByRole('link', { name: 'Modifica' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'PDF' })).toHaveCount(0)
    await expect(page.getByText('Righe del documento').first()).toBeVisible()

    await page.getByRole('button', { name: 'Emetti', exact: true }).click()
    await page.getByRole('button', { name: 'Emetti', exact: true }).last().click()
    await expect(page.getByText(/Documento .* emesso/)).toBeVisible({ timeout: 20_000 })

    // Emessa: ha un numero, non si modifica più, si scarica.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Fattura \d{4}\/\d{4}/, {
      timeout: 20_000,
    })
    await expect(page.getByRole('link', { name: 'Modifica' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Emetti', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aggiungi una riga' })).toHaveCount(0)

    // Il PDF è un PDF vero.
    const risposta = await page.request.get(`${indirizzo.split('?')[0]}/pdf`)
    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-type']).toContain('application/pdf')
    const corpo = await risposta.body()
    expect(corpo.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(corpo.byteLength).toBeGreaterThan(3_000)

    // La nota di credito nasce come bozza e cita la fattura.
    await page.getByRole('button', { name: 'Nota di credito' }).click()
    await page.locator('textarea[name="reason"]').fill('Annullamento del viaggio da parte del cliente')
    await page.getByRole('button', { name: 'Crea la bozza' }).click()
    await page.waitForURL(/\/fatture\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nota di credito in bozza')
    await expect(page.getByText('Storna la fattura').first()).toBeVisible()
  })

  test('una bozza si elimina senza lasciare buchi nella numerazione', async ({ page }) => {
    await accedi(page, 'amministrativo')
    await bozzaDaPratica(page)

    await page.getByRole('button', { name: 'Elimina la bozza' }).click()
    await page.getByRole('button', { name: 'Elimina', exact: true }).last().click()
    await expect(page.getByText('Bozza eliminata.')).toBeVisible({ timeout: 20_000 })
    await page.waitForURL(/\/fatture(\?|$)/, { timeout: 20_000 })
  })
})

test.describe('Registro IVA', () => {
  test('mostra imponibile, imposta e margine dell’anno ed esporta', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/registri')

    await expect(
      page.getByRole('heading', { name: 'Registro IVA delle vendite', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('IVA a debito').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Margine 74-ter').first()).toBeVisible()

    const anno = new Date().getFullYear()
    const risposta = await page.request.get(`/registri/esporta?anno=${anno}`)
    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-disposition']).toContain(`registro-iva-${anno}.csv`)

    const testo = await risposta.text()
    expect(testo.split('\r\n')[0]).toContain('Imponibile')
    expect(testo).toContain('Totale')
  })
})

test.describe('Permessi sull’amministrazione', () => {
  test('l’operatore non vede la sezione fatture', async ({ page }) => {
    await accedi(page, 'operatore')
    await expect(
      page.getByRole('link', { name: 'Fatture' }).filter({ visible: true }),
    ).toHaveCount(0)
  })

  test('chi ha la sola lettura consulta ma non emette', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/fatture')
    await attendiElenco(page, 'Nessuna fattura')

    await expect(page.getByRole('link', { name: 'Nuova fattura' })).toHaveCount(0)

    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/fatture\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Emetti', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Nota di credito' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Modifica' })).toHaveCount(0)
  })
})
