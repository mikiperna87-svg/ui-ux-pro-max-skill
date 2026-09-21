import { expect, type Page, test } from '@playwright/test'

/**
 * Agenda, attività e posta in uscita, dal lato di chi li usa.
 *
 * Le cose che contano qui sono tre: che un'attività creata compaia davvero in
 * agenda e si possa chiudere; che un'attività nata dentro una pratica resti
 * legata a quella pratica; e che un invio lasci sempre una riga nella coda
 * della posta — anche quando non c'è un fornitore collegato, perché è proprio
 * il caso in cui sarebbe facile far finta che sia partito qualcosa.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
  lettore: { email: 'revisore@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

async function accedi(page: Page, chi: keyof typeof CREDENZIALI) {
  const { email, password } = CREDENZIALI[chi]
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

/** Le righe di un elenco davvero a schermo: tabella e schede convivono nel DOM. */
function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

/** Il testo davvero a schermo, per la stessa ragione. */
function visibile(page: Page, testo: string | RegExp) {
  return page.getByText(testo).filter({ visible: true })
}

/** Attende il corpo sospeso dell'agenda: gli indicatori sono i primi ad arrivare. */
async function attendiAgenda(page: Page) {
  await expect(page.getByText('Attività aperte', { exact: true }).first()).toBeVisible()
}

/** Un titolo diverso a ogni esecuzione: la suite gira su un database che resta. */
function titoloUnico(prefisso: string): string {
  return `${prefisso} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

test.describe('Agenda', () => {
  test('mostra le scadenze del periodo e i filtri le restringono', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/agenda?finestra=mese')
    await attendiAgenda(page)

    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
    await expect(page.getByText('In ritardo', { exact: true }).first()).toBeVisible()

    // Filtrando per tipo restano soltanto le voci di quel tipo: la spunta è
    // che il filtro finisca nell'indirizzo e che la pagina si ricomponga.
    await page.getByRole('link', { name: 'Partenze', exact: true }).click()
    await page.waitForURL(/tipo=partenza/, { timeout: 20_000 })
    await attendiAgenda(page)
    await expect(page.getByRole('link', { name: 'Partenze', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    )

    // Tornando a "Tutto" il periodo scelto non si perde per strada.
    await page.getByRole('link', { name: 'Tutto', exact: true }).click()
    await page.waitForURL(/finestra=mese/, { timeout: 20_000 })
    await expect(page).not.toHaveURL(/tipo=/)
  })

  test('crea un’attività, la trova in agenda e la completa', async ({ page }) => {
    const titolo = titoloUnico('Richiamare la signora Bianchi')

    await accedi(page, 'titolare')
    await page.goto('/agenda?finestra=mese')
    await attendiAgenda(page)

    await page.getByRole('button', { name: 'Nuova attività' }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText('Nuova attività')).toBeVisible()

    await dialogo.getByLabel('Che cosa c’è da fare').fill(titolo)
    // Domani alle 9:30: dentro la finestra dei 30 giorni, e con un'ora vera,
    // perché la conversione al fuso dell'agenzia passa proprio di qui.
    const domani = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await dialogo.getByLabel('Scadenza').fill(`${domani}T09:30`)
    await dialogo.getByRole('button', { name: 'Crea l’attività' }).click()

    await expect(dialogo).toBeHidden()
    await attendiAgenda(page)
    await expect(visibile(page, titolo).first()).toBeVisible()

    // Completata, sparisce dall'agenda: l'agenda è ciò che resta da fare.
    const riga = page.locator('li').filter({ hasText: titolo }).first()
    await riga.getByRole('button', { name: /Completa/ }).click()
    await expect(visibile(page, titolo)).toHaveCount(0, { timeout: 20_000 })
  })

  test('un’attività aperta dalla pratica resta legata alla pratica', async ({ page }) => {
    const titolo = titoloUnico('Verificare i passaporti')

    await accedi(page, 'titolare')
    await page.goto('/pratiche')
    await expect(righe(page).first()).toBeVisible()
    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/pratiche\/[0-9a-f-]{36}/, { timeout: 20_000 })

    // Il titolo della scheda è "2030/0016 · Taormina": all'agenda serve il solo
    // codice, che è la parte che la riga dell'attività porta con sé.
    const titoloPratica = await page.getByRole('heading', { level: 1 }).first().innerText()
    const codice = titoloPratica.trim().split('·')[0]?.trim() ?? ''
    expect(codice).not.toBe('')

    await page.getByRole('button', { name: 'Nuova attività' }).first().click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Che cosa c’è da fare').fill(titolo)
    const fra3giorni = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await dialogo.getByLabel('Scadenza').fill(`${fra3giorni}T10:00`)
    await dialogo.getByRole('button', { name: 'Crea l’attività' }).click()
    await expect(dialogo).toBeHidden()

    // Compare nella pratica...
    await expect(visibile(page, titolo).first()).toBeVisible()

    // ...e in agenda, dove porta con sé il codice della pratica.
    await page.goto('/agenda?finestra=mese')
    await attendiAgenda(page)
    const riga = page.locator('li').filter({ hasText: titolo }).first()
    await expect(riga).toBeVisible()
    await expect(riga).toContainText(codice)
  })

  test('chi è in sola lettura vede l’agenda ma non può aggiungere niente', async ({ page }) => {
    await accedi(page, 'lettore')
    await page.goto('/agenda?finestra=settimana')
    await attendiAgenda(page)

    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nuova attività' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Completa/ })).toHaveCount(0)
  })
})

test.describe('Posta in uscita', () => {
  test('la prova di invio lascia una riga nella coda, anche senza fornitore', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/impostazioni')
    await page.getByRole('tab', { name: 'Posta' }).click()

    await expect(page.getByRole('heading', { name: 'Stato della posta' })).toBeVisible()
    // Il titolo, non il testo: "Prova di invio" compare anche come oggetto dei
    // messaggi già in coda, più sotto nella stessa pagina.
    await expect(page.getByRole('heading', { name: 'Prova di invio' })).toBeVisible()

    const indirizzo = `collaudo.${Date.now().toString(36)}@orizzontiviaggi.it`
    await page.getByLabel('Indirizzo di prova').fill(indirizzo)
    await page.getByRole('button', { name: 'Invia la prova' }).click()

    // Il messaggio compare nell'elenco comunque: inviato se il fornitore c'è,
    // in coda se non c'è. Quello che non deve succedere è che sparisca.
    await expect(visibile(page, new RegExp(`A ${indirizzo.replace('.', '\\.')}`)).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Nessun messaggio')).toHaveCount(0)
  })

  test('l’invio di un preventivo chiede conferma e registra il messaggio', async ({ page }) => {
    await accedi(page, 'titolare')
    // Solo una bozza o un preventivo già inviato si possono mandare al cliente:
    // uno accettato, rifiutato o convertito non ha quel comando. Si prova prima
    // fra le bozze e poi fra gli inviati, perché la suite stessa consuma le
    // bozze — un test che dipende da quante ne restano fallisce alla seconda
    // esecuzione sullo stesso database.
    let trovato = false
    for (const stato of ['bozza', 'inviato']) {
      await page.goto(`/preventivi?stato=${stato}`)
      await expect(righe(page).first().or(page.getByText('Nessun preventivo'))).toBeVisible()
      if ((await righe(page).count()) > 0) {
        trovato = true
        break
      }
    }
    expect(trovato, 'nessun preventivo inviabile nei dati di prova').toBe(true)

    await righe(page).first().getByRole('link').first().click()
    await page.waitForURL(/\/preventivi\/[0-9a-f-]{36}/, { timeout: 20_000 })

    // "Invia al cliente" su una bozza, "Rimanda al cliente" su uno già inviato.
    await page.getByRole('button', { name: /^(Invia|Rimanda) al cliente$/ }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText(/Inviare il preventivo/)).toBeVisible()

    // L'indirizzo arriva già compilato dal cliente della pratica: è il dato che
    // rende l'invio un gesto solo invece di un copia e incolla.
    const destinatario = dialogo.getByLabel('Indirizzo del cliente')
    await expect(destinatario).not.toHaveValue('')

    await dialogo.getByRole('button', { name: 'Invia', exact: true }).click()
    await expect(dialogo).toBeHidden({ timeout: 20_000 })

    // Il messaggio è nella coda: è lì che si controlla che cosa è uscito.
    await page.goto('/impostazioni')
    await page.getByRole('tab', { name: 'Posta' }).click()
    await expect(visibile(page, 'Preventivo').first()).toBeVisible({ timeout: 20_000 })
  })

  test('senza permesso la pagina delle impostazioni non esiste', async ({ page }) => {
    await accedi(page, 'lettore')
    await page.goto('/impostazioni')

    // Non un pannello disabilitato: la pagina proprio non c'è. Le impostazioni
    // sono del titolare, e mostrarne una versione spenta a chi non può usarla
    // sarebbe solo un invito a chiedersi perché.
    await expect(page.getByRole('heading', { name: 'Stato della posta' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Posta' })).toHaveCount(0)
  })
})
