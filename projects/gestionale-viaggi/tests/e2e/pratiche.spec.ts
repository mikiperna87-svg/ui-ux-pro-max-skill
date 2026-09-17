import { expect, type Page, test } from '@playwright/test'

/**
 * Percorsi delle pratiche: elenco, viste salvate, scheda, righe di servizio,
 * conferma con generazione delle scadenze, annullamento e documenti.
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

/** Etichetta irripetibile, così i test possono girare più volte di fila. */
function unico(prefisso: string): string {
  return `${prefisso}-${Date.now().toString(36)}`
}

/** Le righe dell’elenco: tabella su schermo largo, schede su telefono. */
function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

/**
 * Apre una pratica nuova con una riga di servizio e restituisce il suo codice.
 * Serve ai test che devono partire da una pratica loro, senza dipendere dallo
 * stato lasciato da un’esecuzione precedente.
 */
async function scegliPrimaOpzione(page: Page, combobox = 0) {
  // La tendina di Radix monta l'elenco dopo il clic: aspettarlo evita che il
  // clic successivo cada nel vuoto quando la macchina è sotto carico.
  await page.getByRole('combobox').nth(combobox).click()
  const opzioni = page.getByRole('option')
  await expect(opzioni.first()).toBeVisible()
  await opzioni.first().click()
  await expect(opzioni.first()).toBeHidden()
}

async function apriPratica(page: Page, destinazione: string): Promise<string> {
  await page.goto('/pratiche/nuova')
  await scegliPrimaOpzione(page)
  await page.locator('input[name="title"]').fill('Viaggio di collaudo')
  await page.locator('input[name="destination"]').fill(destinazione)
  await page.locator('input[name="departure_date"]').fill('2030-07-01')
  await page.locator('input[name="return_date"]').fill('2030-07-10')
  await page.locator('input[name="pax_count"]').fill('2')
  await page.getByRole('button', { name: 'Apri la pratica' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText(destinazione, {
    timeout: 20_000,
  })
  const titolo = await page.getByRole('heading', { level: 1 }).innerText()
  return titolo.split(' · ')[0]?.trim() ?? ''
}

async function aggiungiRiga(page: Page, descrizione: string, costo: string, prezzo: string) {
  await page.getByRole('tab', { name: /Servizi e costi/ }).click()
  const primaRiga = page.getByRole('button', { name: 'Aggiungi la prima riga' })
  if ((await primaRiga.count()) > 0) {
    await primaRiga.click()
  } else {
    await page.getByRole('button', { name: 'Aggiungi una riga' }).click()
  }
  await page.locator('input[name="description"]').fill(descrizione)
  await page.locator('input[name="quantity"]').fill('2')
  await page.locator('input[name="unit_cost"]').fill(costo)
  await page.locator('input[name="unit_price"]').fill(prezzo)
  await page.getByRole('button', { name: 'Aggiungi la riga' }).click()
  await expect(page.getByText(descrizione).filter({ visible: true }).first()).toBeVisible()
}

test.describe('Elenco pratiche', () => {
  test('mostra le pratiche con stato e quadro economico', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche')

    await expect(page.getByRole('heading', { name: 'Pratiche', level: 1 })).toBeVisible()
    await expect(righe(page).first()).toBeVisible()
    await expect(page.getByText(/di\s+\d+/)).toBeVisible()
  })

  test('il filtro sullo stato resta nell’indirizzo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche?stato=confermata')

    await expect(righe(page).first()).toBeVisible()
    await expect(righe(page).first()).toContainText('Confermata')
  })

  test('il filtro sul pagamento trova le pratiche in ritardo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche?pagamento=in_ritardo')

    // Prima si aspetta che l'elenco abbia finito di caricare: contare le righe
    // troppo presto significa contare zero e leggere uno stato vuoto che non c'è.
    const elenco = righe(page)
    const vuoto = page.getByText('Nessuna pratica corrisponde ai filtri')
    await expect(elenco.first().or(vuoto)).toBeVisible()

    if ((await elenco.count()) > 0) {
      await expect(elenco.first()).toContainText('In ritardo')
    } else {
      await expect(vuoto).toBeVisible()
    }
  })

  test('la ricerca trova una pratica per cognome del cliente', async ({ page }) => {
    await accedi(page, 'titolare')

    // Il cognome del cliente non sta nella pratica: la ricerca deve arrivarci
    // comunque, perché è la prima cosa che un operatore ricorda.
    await page.goto('/pratiche?q=bianchi')
    await expect(righe(page).first()).toContainText('Bianchi')
  })

  test('la ricerca digitata resta nell’indirizzo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche')

    await page.getByRole('searchbox').fill('taormina')
    await expect(page).toHaveURL(/q=taormina/)
    await expect(righe(page).first()).toContainText('Taormina')
  })

  test('la ricerca trova una pratica per destinazione', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche?q=taormina')

    await expect(righe(page).first()).toContainText('Taormina')
  })

  test('l’esportazione scarica ciò che è filtrato', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche?stato=confermata')

    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: /^Esporta$/ }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^pratiche-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

test.describe('Viste salvate', () => {
  test('salva i filtri con un nome e li richiama', async ({ page }) => {
    await accedi(page, 'titolare')
    const nome = unico('Vista')

    await page.goto('/pratiche?stato=confermata&pagamento=saldata')
    await page.getByRole('button', { name: /Salva vista|Salva questa vista/ }).click()
    await page.locator('input[name="name"]').fill(nome)
    await page.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText(/Vista salvata/)).toBeVisible()

    // Tornando all'elenco senza filtri, la vista li rimette
    await page.goto('/pratiche')
    await page.getByRole('button', { name: /Viste/ }).click()
    await page.getByRole('menuitem', { name: nome }).click()
    await expect(page).toHaveURL(/stato=confermata/)
    await expect(page).toHaveURL(/pagamento=saldata/)
  })
})

test.describe('Creazione e gestione di una pratica', () => {
  test('apre una pratica, aggiunge un servizio e vede il margine', async ({ page }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Lofoten')

    await apriPratica(page, destinazione)
    await aggiungiRiga(page, 'Pacchetto completo', '700,00', '1.000,00')

    // Il quadro economico si aggiorna: venduto 2.000, costo 1.400, margine 600
    await expect(page.getByText('2.000,00').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('600,00').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(/30,00% sul venduto/)).toBeVisible()
  })

  test('la conferma genera acconto, saldo e controllo documenti', async ({ page }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Azzorre')

    await apriPratica(page, destinazione)
    await aggiungiRiga(page, 'Pacchetto Azzorre', '700,00', '1.000,00')

    await page.getByRole('button', { name: 'Conferma' }).click()
    await expect(page.getByText(/scadenze e controllo documenti creati/)).toBeVisible()

    await page.getByRole('tab', { name: /Incassi e scadenze/ }).click()
    // Su schermo largo le scadenze sono una tabella, su telefono un elenco di
    // schede: si cerca ciò che si vede, non il markup di uno dei due.
    await expect(page.getByText('Acconto').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('Saldo').filter({ visible: true }).first()).toBeVisible()

    // Acconto e saldo insieme fanno il venduto: è la regola, e resta vera
    // qualunque percentuale abbia impostato l'agenzia.
    const importi = await page
      .locator('[data-rata="importo"]')
      .filter({ visible: true })
      .allInnerTexts()
    const centesimi = importi.map((testo) =>
      Number(testo.replace(/[^\d,]/g, '').replace('.', '').replace(',', '')),
    )
    expect(centesimi).toHaveLength(2)
    expect(centesimi[0]! + centesimi[1]!).toBe(200_000)

    await page.getByRole('tab', { name: 'Riepilogo' }).click()
    await expect(page.getByText(/Verifica i documenti di viaggio/)).toBeVisible()
  })

  test('non si conferma una pratica senza importi', async ({ page }) => {
    await accedi(page, 'titolare')
    await apriPratica(page, unico('Vuota'))

    await page.getByRole('button', { name: 'Conferma' }).click()
    await expect(page.getByText(/almeno una riga di servizio/)).toBeVisible()
  })

  test('l’annullamento pretende un motivo e registra la penale', async ({ page }) => {
    await accedi(page, 'titolare')
    const destinazione = unico('Madeira')

    const codice = await apriPratica(page, destinazione)
    await aggiungiRiga(page, 'Pacchetto Madeira', '400,00', '600,00')

    await page.getByRole('button', { name: 'Altre azioni' }).click()
    await page.getByRole('menuitem', { name: /Annulla la pratica/ }).click()

    // Senza motivo non si procede
    await page.getByRole('button', { name: 'Annulla la pratica' }).click()
    await expect(page.getByText(/Indica il motivo/)).toBeVisible()

    await page.locator('textarea[name="reason"]').fill('Rinuncia del cliente')
    await page.locator('input[name="penalty"]').fill('150,00')
    await page.getByRole('button', { name: 'Annulla la pratica' }).click()

    // L'avviso nella scheda, non il messaggio del toast che dice la stessa cosa.
    // Il separatore fra numero e simbolo è uno spazio unificatore: si cerca il
    // testo, non la formattazione.
    const avviso = page.locator('#contenuto').getByRole('status').first()
    await expect(avviso).toContainText('Pratica annullata')
    await expect(avviso).toContainText('Rinuncia del cliente')
    await expect(avviso).toContainText('penale trattenuta')
    await expect(avviso).toContainText('150,00')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(codice)
  })

  test('una riga di servizio si modifica e si elimina', async ({ page }) => {
    await accedi(page, 'titolare')
    await apriPratica(page, unico('Creta'))
    await aggiungiRiga(page, 'Volo per Creta', '200,00', '300,00')

    await page.getByRole('button', { name: /Modifica Volo per Creta/ }).click()
    await page.locator('input[name="unit_price"]').fill('350,00')
    await page.getByRole('button', { name: 'Salva la riga' }).click()
    await expect(page.getByText('700,00').filter({ visible: true }).first()).toBeVisible()

    await page.getByRole('button', { name: /Elimina Volo per Creta/ }).click()
    await page.getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText('Nessun servizio inserito')).toBeVisible()
  })

  test('rifiuta un importo che non è un importo', async ({ page }) => {
    await accedi(page, 'titolare')
    await apriPratica(page, unico('Errore'))

    await page.getByRole('tab', { name: /Servizi e costi/ }).click()
    await page.getByRole('button', { name: /Aggiungi la prima riga/ }).click()
    await page.locator('input[name="description"]').fill('Riga sbagliata')
    await page.locator('input[name="unit_price"]').fill('mille euro')
    await page.getByRole('button', { name: 'Aggiungi la riga' }).click()

    await expect(page.getByText(/importo non valido/)).toBeVisible()
    // Il dato digitato non va perso
    await expect(page.locator('input[name="description"]')).toHaveValue('Riga sbagliata')
  })

  test('rifiuta un rientro precedente alla partenza', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche/nuova')

    await scegliPrimaOpzione(page)
    await page.locator('input[name="title"]').fill('Date invertite')
    await page.locator('input[name="destination"]').fill('Ovunque')
    await page.locator('input[name="departure_date"]').fill('2030-07-10')
    await page.locator('input[name="return_date"]').fill('2030-07-01')
    await page.getByRole('button', { name: 'Apri la pratica' }).click()

    await expect(page.getByText(/non può precedere la partenza/)).toBeVisible()
    await expect(page.locator('input[name="destination"]')).toHaveValue('Ovunque')
  })
})

test.describe('Passeggeri della pratica', () => {
  test('collega un passeggero e ne mostra lo stato del documento', async ({ page }) => {
    await accedi(page, 'titolare')
    await apriPratica(page, unico('Creta'))

    await page.getByRole('tab', { name: /Passeggeri/ }).click()
    await page.getByRole('button', { name: /Aggiungi il primo passeggero/ }).click()
    await scegliPrimaOpzione(page)
    await page.getByRole('button', { name: 'Aggiungi', exact: true }).click()

    await expect(page.getByText(/Passeggero aggiunto/)).toBeVisible()
    // Lo stato del documento c'è in entrambe le rese: cella su schermo largo,
    // etichetta sulla scheda su telefono.
    await expect(
      page
        .getByText(/In regola|Documento assente|Documento scaduto|Senza scadenza|Scade prima del rientro/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
  })
})

test.describe('Documenti della pratica', () => {
  test('allega un documento e lo riapre con un collegamento firmato', async ({ page }) => {
    await accedi(page, 'titolare')
    await apriPratica(page, unico('Documenti'))

    await page.getByRole('tab', { name: /Documenti/ }).click()
    await page.getByRole('button', { name: /Allega il primo documento/ }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'voucher.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 voucher di prova', 'utf8'),
    })
    await page.locator('input[name="notes"]').fill('Voucher hotel')
    await page.getByRole('button', { name: 'Allega' }).click()

    await expect(page.getByText('voucher.pdf')).toBeVisible()
    await expect(page.getByText(/Voucher hotel/)).toBeVisible()
  })
})

test.describe('Permessi sulle pratiche', () => {
  test('la sola lettura non vede i comandi di modifica', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/pratiche')

    await expect(page.getByRole('link', { name: 'Nuova pratica' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Esporta$/ })).toBeVisible()
  })

  test('la sola lettura non può aprire la pagina di creazione', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/pratiche/nuova')
    await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible()
  })

  test('l’operatore vede meno pratiche del titolare', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/pratiche')
    const totaleTitolare = await page.getByText(/di\s+\d+/).innerText()

    await page.getByRole('button', { name: /Profilo di/ }).click()
    await page.getByRole('menuitem', { name: 'Esci', exact: true }).click()
    await page.waitForURL(/\/accedi/)

    await accedi(page, 'operatore')
    await page.goto('/pratiche')
    const totaleOperatore = await page.getByText(/di\s+\d+/).innerText()

    const numero = (testo: string) => Number(testo.match(/di\s+([\d.]+)/)?.[1]?.replace('.', '') ?? '0')
    expect(numero(totaleOperatore)).toBeLessThan(numero(totaleTitolare))
  })
})
