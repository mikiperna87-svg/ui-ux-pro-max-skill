import { expect, type Page, test } from '@playwright/test'

/**
 * Incassi e scadenze: registrazione di un incasso sulla pratica, effetto sul
 * quadro economico, scadenzario con i due elenchi e i suoi filtri, permessi.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
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

function unico(prefisso: string): string {
  return `${prefisso}-${Date.now().toString(36)}`
}

function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

/**
 * Gli elenchi arrivano in streaming: contare le righe appena dopo il goto
 * risponde zero anche quando la pagina è piena.
 */
async function attendiElenco(page: Page, messaggioVuoto: string) {
  await expect(righe(page).first().or(page.getByText(messaggioVuoto))).toBeVisible()
}

async function scegliPrimaOpzione(page: Page, combobox = 0) {
  await page.getByRole('combobox').nth(combobox).click()
  const opzioni = page.getByRole('option')
  await expect(opzioni.first()).toBeVisible()
  await opzioni.first().click()
  await expect(opzioni.first()).toBeHidden()
}

/** Pratica confermata con una riga da 1.000 € x2: acconto 600, saldo 1.400. */
async function praticaConfermata(page: Page, destinazione: string): Promise<void> {
  await page.goto('/pratiche/nuova')
  await scegliPrimaOpzione(page)
  await page.locator('input[name="title"]').fill('Pratica incassi')
  await page.locator('input[name="destination"]').fill(destinazione)
  await page.locator('input[name="departure_date"]').fill('2030-09-01')
  await page.locator('input[name="return_date"]').fill('2030-09-10')
  await page.locator('input[name="pax_count"]').fill('2')
  await page.getByRole('button', { name: 'Apri la pratica' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(destinazione, {
    timeout: 20_000,
  })

  await page.getByRole('tab', { name: /Servizi e costi/ }).click()
  const primaRiga = page.getByRole('button', { name: 'Aggiungi la prima riga' })
  if ((await primaRiga.count()) > 0) await primaRiga.click()
  else await page.getByRole('button', { name: 'Aggiungi una riga' }).click()
  await page.locator('input[name="description"]').fill('Pacchetto completo')
  await page.locator('input[name="quantity"]').fill('2')
  await page.locator('input[name="unit_cost"]').fill('700,00')
  await page.locator('input[name="unit_price"]').fill('1.000,00')
  await page.getByRole('button', { name: 'Aggiungi la riga' }).click()
  await expect(page.getByText('Pacchetto completo').filter({ visible: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Conferma' }).click()
  await expect(page.getByText(/scadenze e controllo documenti creati/)).toBeVisible()
}

test.describe('Incassi sulla pratica', () => {
  test('registrare un incasso copre l’acconto e riduce il residuo', async ({ page }) => {
    await accedi(page, 'titolare')
    await praticaConfermata(page, unico('Reykjavik'))

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await expect(page.getByText('Acconto').filter({ visible: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Registra un incasso' }).click()
    // L'importo proposto è il residuo della prima scadenza aperta: si accetta.
    await page.getByRole('button', { name: 'Registra l’incasso' }).click()
    await expect(page.getByText(/Incasso di .*registrato/)).toBeVisible()

    // L'acconto è 600,00 su un venduto di 2.000,00: dopo l'incasso è saldato.
    // La tabella resta nel DOM anche su telefono, nascosta: va cercato ciò che
    // si vede davvero, altrimenti si verifica il layout sbagliato.
    await expect(page.getByText('Saldata').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(/Restano .*da incassare/)).toBeVisible()
  })

  test('un incasso senza importo viene rifiutato', async ({ page }) => {
    await accedi(page, 'titolare')
    await praticaConfermata(page, unico('Tromso'))

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await page.getByRole('button', { name: 'Registra un incasso' }).click()
    await page.locator('input[name="amount"]').fill('zero euro')
    await page.getByRole('button', { name: 'Registra l’incasso' }).click()

    await expect(page.getByText(/importo non valido/i)).toBeVisible()
  })

  test('lo storno pretende un motivo e riapre il residuo', async ({ page }) => {
    await accedi(page, 'titolare')
    await praticaConfermata(page, unico('Bergen'))

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await page.getByRole('button', { name: 'Registra un incasso' }).click()
    await page.locator('input[name="amount"]').fill('600,00')
    await page.getByRole('button', { name: 'Registra l’incasso' }).click()
    await expect(page.getByText(/Incasso di .*registrato/)).toBeVisible()

    await page.getByRole('button', { name: /Storna l’incasso di/ }).first().click()
    // "Storna" senza exact prenderebbe anche il bottone della riga, che si
    // chiama "Storna l'incasso di ...".
    await page.getByRole('button', { name: 'Storna', exact: true }).click()
    await expect(page.getByText(/Scrivi il motivo/)).toBeVisible()

    await page.locator('textarea[name="reason"]').fill('Bonifico tornato indietro')
    await page.getByRole('button', { name: 'Storna', exact: true }).click()
    await expect(page.getByText('Incasso stornato.')).toBeVisible()
  })

  test('una scadenza si aggiunge a mano', async ({ page }) => {
    await accedi(page, 'titolare')
    await praticaConfermata(page, unico('Narvik'))

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await page.getByRole('button', { name: 'Aggiungi una scadenza' }).click()
    await page.locator('input[name="due_date"]').fill('2030-08-01')
    await page.locator('input[name="amount"]').fill('250,00')
    await page.getByRole('button', { name: 'Salva', exact: true }).click()

    await expect(page.getByText('Scadenza aggiunta.')).toBeVisible()
    await expect(page.getByText('Rata', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('i pagamenti ai fornitori nascono dalle righe di servizio', async ({ page }) => {
    await accedi(page, 'titolare')
    await praticaConfermata(page, unico('Alesund'))

    // La riga di servizio creata non ha fornitore: senza fornitore non nasce
    // nessun pagamento, ed è giusto che l'allineamento lo dica.
    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await page.getByRole('button', { name: 'Allinea dai servizi' }).click()
    await expect(page.getByText(/allineati|già allineati/i)).toBeVisible()
  })
})

test.describe('Scadenzario', () => {
  test('mostra i totali e le due sezioni', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/scadenzario')

    await expect(page.getByRole('heading', { name: 'Scadenzario' })).toBeVisible()
    await expect(page.getByText('Da incassare', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Incassi in ritardo')).toBeVisible()
    await expect(page.getByText('Pagamenti in ritardo')).toBeVisible()

    await attendiElenco(page, 'Nessuna scadenza')
    expect(await righe(page).count()).toBeGreaterThan(0)
  })

  test('la sezione dei pagamenti resta nell’indirizzo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/scadenzario')

    await page.getByRole('link', { name: 'Da pagare' }).click()
    await expect(page).toHaveURL(/sezione=pagamenti/)
    await attendiElenco(page, 'Nessun pagamento')
  })

  test('il filtro sul ritardo resta nell’indirizzo e mostra solo gli scaduti', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/scadenzario?sezione=incassi&quando=in_ritardo')
    await attendiElenco(page, 'Nessuna scadenza corrisponde ai filtri')

    const quante = await righe(page).count()
    if (quante > 0) {
      await expect(righe(page).first()).toContainText(/ritardo/)
    } else {
      await expect(page.getByText('Nessuna scadenza corrisponde ai filtri')).toBeVisible()
    }
  })

  test('la ricerca trova una scadenza per destinazione', async ({ page }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Svalbard')
    await praticaConfermata(page, destinazione)

    await page.goto(`/scadenzario?q=${destinazione}`)
    await attendiElenco(page, 'Nessuna scadenza corrisponde ai filtri')
    await expect(righe(page).first()).toContainText(destinazione)
  })

  test('«Incassa» porta sulla pratica con il modulo già aperto', async ({ page }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Kirkenes')
    await praticaConfermata(page, destinazione)

    await page.goto(`/scadenzario?q=${destinazione}`)
    await attendiElenco(page, 'Nessuna scadenza corrisponde ai filtri')
    await page.getByRole('link', { name: /Registra l’incasso della scadenza/ }).first().click()

    await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}\?scheda=incassi/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Registra un incasso' })).toBeVisible()
  })

  test('l’esportazione scarica ciò che è filtrato', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/scadenzario?sezione=incassi&stato=aperte')

    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Esporta' }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(/^scadenzario-incassi-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

test.describe('Permessi su incassi e pagamenti', () => {
  test('l’operatore non vede i comandi di incasso', async ({ page }) => {
    await accedi(page, 'operatore')
    await page.goto('/pratiche')
    await attendiElenco(page, 'Nessuna pratica')
    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}$/, { timeout: 20_000 })

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    await expect(page.getByRole('button', { name: 'Registra un incasso' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aggiungi una scadenza' })).toHaveCount(0)
  })

  test('la sola lettura apre lo scadenzario senza poter incassare', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/scadenzario')

    await expect(page.getByRole('heading', { name: 'Scadenzario' })).toBeVisible()
    await attendiElenco(page, 'Nessuna scadenza')
    await expect(page.getByRole('link', { name: /Registra l’incasso della scadenza/ })).toHaveCount(
      0,
    )
  })
})
