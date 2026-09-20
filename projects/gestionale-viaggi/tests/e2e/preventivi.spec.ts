import { expect, type Page, test } from '@playwright/test'

/**
 * Preventivi: costruzione delle proposte, invio, risposta del cliente dalla
 * pagina pubblica e conversione in pratica.
 *
 * Il percorso che conta è quello che attraversa il confine: l'agenzia scrive,
 * qualcuno senza account legge e risponde, l'agenzia ritrova la risposta. Un
 * test che si ferma prima del collegamento pubblico non verifica il modulo.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
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

function unico(prefisso: string): string {
  return `${prefisso}-${Date.now().toString(36)}`
}

function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

async function attendiElenco(page: Page, messaggioVuoto: string) {
  await expect(righe(page).first().or(page.getByText(messaggioVuoto))).toBeVisible()
}

async function scegliPrimaOpzione(page: Page, combobox = 0) {
  await page.getByRole('combobox').nth(combobox).click()
  const opzioni = page.getByRole('option')
  await expect(opzioni.first()).toBeVisible()
  // La prima voce è "Non ancora indicato": il cliente vero è quello dopo.
  await opzioni.nth(1).click()
  await expect(opzioni.first()).toBeHidden()
}

/** Aggiunge una voce alla proposta aperta. */
async function aggiungiVoce(
  page: Page,
  { descrizione, costo, prezzo }: { descrizione: string; costo: string; prezzo: string },
) {
  const primaVoce = page.getByRole('button', { name: 'Aggiungi la prima voce' })
  if ((await primaVoce.count()) > 0) await primaVoce.first().click()
  else await page.getByRole('button', { name: 'Aggiungi una voce' }).first().click()

  await page.locator('input[name="description"]').fill(descrizione)
  await page.locator('input[name="unit_cost"]').fill(costo)
  await page.locator('input[name="unit_price"]').fill(prezzo)
  await page.getByRole('button', { name: 'Aggiungi la voce' }).click()
  await expect(page.getByText(descrizione).filter({ visible: true }).first()).toBeVisible()
}

/**
 * Preventivo inviato con una proposta consigliata da 1.500 €, e il suo
 * collegamento pubblico.
 */
async function preventivoInviato(page: Page, destinazione: string): Promise<string> {
  await page.goto('/preventivi/nuovo')
  await scegliPrimaOpzione(page)
  await page.locator('input[name="title"]').fill('Proposta di prova')
  await page.locator('input[name="destination"]').fill(destinazione)
  await page.locator('input[name="departure_date"]').fill('2030-11-04')
  await page.locator('input[name="return_date"]').fill('2030-11-11')
  await page.locator('input[name="pax_count"]').fill('2')
  await page.getByRole('button', { name: 'Crea il preventivo' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(destinazione, {
    timeout: 20_000,
  })

  await aggiungiVoce(page, {
    descrizione: 'Volo di linea a/r',
    costo: '400,00',
    prezzo: '600,00',
  })
  await aggiungiVoce(page, {
    descrizione: 'Hotel quattro stelle',
    costo: '600,00',
    prezzo: '900,00',
  })

  await page.getByRole('button', { name: 'Segna come inviato' }).click()
  await expect(page.getByText(/il collegamento è attivo/)).toBeVisible()

  await page.getByRole('button', { name: 'Copia il collegamento' }).click()
  const collegamento = page.getByText(/\/preventivo\//).filter({ visible: true }).first()
  await expect(collegamento).toBeVisible()
  const testo = (await collegamento.textContent()) ?? ''
  const trovato = testo.match(/\/preventivo\/[0-9a-f-]{36}/i)
  expect(trovato, 'il collegamento pubblico deve comparire a schermo').not.toBeNull()
  return trovato?.[0] ?? ''
}

test.describe('Elenco dei preventivi', () => {
  test('mostra le proposte con stato e importo, e filtra per stato', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/preventivi')
    await attendiElenco(page, 'Nessun preventivo')

    await expect(page.getByRole('heading', { name: 'Preventivi', level: 1 })).toBeVisible()
    const quante = await righe(page).count()
    expect(quante).toBeGreaterThan(0)

    // Lo stato non è mai solo un colore: accanto c'è sempre la parola.
    await expect(page.getByText('Inviato').filter({ visible: true }).first()).toBeVisible()

    await page.goto('/preventivi?stato=accettato')
    await attendiElenco(page, 'Nessun preventivo')
    await expect(page.getByText('Inviato').filter({ visible: true })).toHaveCount(0)
  })

  test('la voce Preventivi è raggiungibile dalla navigazione', async ({ page }) => {
    await accedi(page, 'titolare')
    const voce = page.getByRole('link', { name: 'Preventivi' }).filter({ visible: true })
    if ((await voce.count()) === 0) {
      // Su telefono la navigazione è un pannello: va aperto.
      await page.getByRole('button', { name: 'Apri il menu' }).first().click()
    }
    await page.getByRole('link', { name: 'Preventivi' }).filter({ visible: true }).first().click()
    await page.waitForURL(/\/preventivi/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Preventivi', level: 1 })).toBeVisible()
  })
})

test.describe('Dal preventivo alla pratica', () => {
  test('il cliente accetta dal collegamento e la proposta diventa una pratica', async ({
    page,
    browser,
  }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Lisbona')
    const collegamento = await preventivoInviato(page, destinazione)

    // Il totale della proposta è 1.500,00 e il margine 500,00: si vedono nella
    // scheda, e il cliente vedrà solo il primo.
    await expect(page.getByText('1.500,00 €').filter({ visible: true }).first()).toBeVisible()

    // --- La parte pubblica: un contesto senza sessione, come un cliente vero.
    const contesto = await browser.newContext()
    const pubblica = await contesto.newPage()
    try {
      await pubblica.goto(collegamento)
      await expect(pubblica.getByRole('heading', { level: 1 })).toContainText('Proposta di prova')
      await expect(pubblica.getByText(destinazione).first()).toBeVisible()
      await expect(pubblica.getByText('1.500,00 €').first()).toBeVisible()

      // Nessun costo e nessun margine attraversano il confine.
      await expect(pubblica.getByText('400,00 €')).toHaveCount(0)
      await expect(pubblica.getByText(/Margine/i)).toHaveCount(0)

      await pubblica.getByRole('button', { name: /Accetto la consigliata/ }).click()
      await pubblica.locator('input[name="name"]').fill('Marco Rossi')
      await pubblica.getByRole('button', { name: 'Confermo' }).click()

      // La conferma resta a schermo un attimo, poi la pagina si ricarica da
      // sola: l'esito che conta è quello che il cliente trova dopo, quindi si
      // aspetta quello e non il messaggio di passaggio.
      await expect(pubblica.getByText('Proposta accettata: Consigliata')).toBeVisible({
        timeout: 20_000,
      })
      await expect(pubblica.getByRole('button', { name: /Accetto la/ })).toHaveCount(0)
    } finally {
      await contesto.close()
    }

    // --- Di nuovo in agenzia: la risposta è arrivata.
    await page.reload()
    await expect(page.getByText('Marco Rossi').filter({ visible: true }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Accettato').filter({ visible: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Converti in pratica' }).click()
    await page.getByRole('button', { name: 'Apri la pratica' }).click()
    await expect(page.getByText(/Pratica .* creata/)).toBeVisible({ timeout: 20_000 })

    // La pratica esiste, cita il preventivo e ne ha le righe.
    await expect(page.getByText('Diventato la pratica').filter({ visible: true })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('link', { name: /^\d{4}\/\d+$/ }).first().click()
    await page.waitForURL(/\/pratiche\//, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(destinazione)
  })

  test('un collegamento inventato non apre nulla', async ({ browser }) => {
    // Nessuna sessione, nessun preventivo: indovinare il token non deve
    // raccontare niente, nemmeno che quel preventivo esiste.
    const contesto = await browser.newContext()
    const pubblica = await contesto.newPage()
    try {
      await pubblica.goto('/preventivo/00000000-0000-4000-8000-000000000000')
      await expect(pubblica.getByText(/non trovata|non esiste|404/i).first()).toBeVisible()
      await expect(pubblica.getByRole('button', { name: /Accetto la/ })).toHaveCount(0)
    } finally {
      await contesto.close()
    }
  })
})

test.describe('Documenti scaricabili', () => {
  test('il PDF del preventivo si scarica ed è un PDF vero', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/preventivi')
    await attendiElenco(page, 'Nessun preventivo')
    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/preventivi\/[0-9a-f-]{36}/, { timeout: 20_000 })

    const url = `${page.url().split('?')[0]}/pdf`
    const risposta = await page.request.get(url)
    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-type']).toContain('application/pdf')

    const corpo = await risposta.body()
    expect(corpo.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // Un PDF di poche centinaia di byte sarebbe una pagina vuota.
    expect(corpo.byteLength).toBeGreaterThan(3_000)
  })

  test('l’esportazione CSV rispetta i filtri dell’elenco', async ({ page }) => {
    await accedi(page, 'titolare')
    const risposta = await page.request.get('/preventivi/esporta?stato=accettato')
    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-disposition']).toContain('preventivi-')

    const testo = await risposta.text()
    const righeCsv = testo.trim().split('\r\n')
    expect(righeCsv[0]).toContain('Numero')
    expect(righeCsv[0]).toContain('Accettata da')
    expect(righeCsv.length).toBeGreaterThan(1)
    // Il filtro è passato al file: nessun preventivo in bozza fra le righe.
    expect(righeCsv.slice(1).every((riga) => !riga.includes(';Bozza;'))).toBe(true)
  })
})

test.describe('Permessi sui preventivi', () => {
  test('chi ha la sola lettura non crea né invia preventivi', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/preventivi')
    await attendiElenco(page, 'Nessun preventivo')

    await expect(page.getByRole('link', { name: 'Nuovo preventivo' })).toHaveCount(0)

    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/preventivi\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Modifica' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Segna come inviato' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Converti in pratica' })).toHaveCount(0)
  })
})
