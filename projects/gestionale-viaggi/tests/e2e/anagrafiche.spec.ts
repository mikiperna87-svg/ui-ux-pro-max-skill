import { expect, type Page, test } from '@playwright/test'

/**
 * Percorsi delle anagrafiche: elenco, ricerca, ordinamento, scheda, creazione,
 * validazione fiscale e importazione da CSV.
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

/**
 * Le righe dell’elenco. Da tablet in su sono le righe della tabella, su
 * telefono le schede che la sostituiscono: entrambe portano data-riga, così la
 * stessa prova vale su tutte e due le rese.
 */
function righe(page: Page) {
  return page.locator('[data-riga]:visible')
}

/**
 * Le griglie arrivano in streaming dentro il loro `<Suspense>`: contare le
 * righe appena dopo il `goto` risponde zero anche quando l'elenco è pieno, e il
 * test finisce per cercare uno stato vuoto che non esiste. Qui si aspetta che
 * la pagina abbia deciso: o la prima riga, o il messaggio di elenco vuoto.
 */
async function attendiElenco(page: Page, messaggioVuoto: string) {
  await expect(righe(page).first().or(page.getByText(messaggioVuoto))).toBeVisible()
}

/** Il collegamento alla scheda dentro la prima riga dell’elenco. */
function primaScheda(page: Page, entita: string) {
  return righe(page).first().locator(`a[href^="/${entita}/"]`).first()
}

/**
 * Apre la scheda della prima riga e aspetta di esserci davvero.
 *
 * Senza l'attesa sull'indirizzo un'asserzione poteva passare su una parola
 * della pagina di elenco — "valore generato" compare anche nella sua
 * descrizione — facendo credere superata una prova mai eseguita.
 */
async function apriPrimaScheda(page: Page, entita: string) {
  await primaScheda(page, entita).click()
  await page.waitForURL(new RegExp(`/${entita}/[0-9a-f-]{36}$`), { timeout: 20_000 })
}

test.describe('Elenco clienti', () => {
  test('mostra le righe e il totale', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti')

    await expect(page.getByRole('heading', { name: 'Clienti', level: 1 })).toBeVisible()
    await expect(righe(page).first()).toBeVisible()
    // Il conteggio arriva dal database, non dalla lunghezza della pagina
    await expect(page.getByText(/di\s+\d+/)).toBeVisible()
  })

  test('la ricerca filtra e resta nell’indirizzo', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti')

    const primo = await primaScheda(page, 'clienti').innerText()
    const cognome = primo.trim().split(' ')[0] ?? ''

    await page.getByRole('searchbox').fill(cognome)
    await expect(page).toHaveURL(new RegExp(`q=${cognome}`, 'i'))
    await expect(righe(page).first()).toContainText(cognome)
  })

  test('la ricerca ignora accenti e maiuscole', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti?q=VARESE')
    await expect(righe(page).first()).toBeVisible()
  })

  test('l’ordinamento per valore mette in cima il cliente migliore', async ({ page, isMobile }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti')

    // Su schermo largo si ordina dall’intestazione della tabella, su telefono
    // dal comando "Ordina": l’elenco a schede non ha intestazioni.
    const ordinaPerValore = async () => {
      if (isMobile) {
        await page.getByRole('button', { name: 'Ordina' }).click()
        await page.getByRole('menuitem', { name: /^Valore/ }).click()
      } else {
        await page.getByRole('button', { name: /^Valore/ }).click()
      }
    }

    await ordinaPerValore()
    await expect(page).toHaveURL(/ordina=lifetime_value_cents/)

    // Il primo comando ordina crescente, il secondo decrescente
    await ordinaPerValore()
    await expect(page).toHaveURL(/verso=desc/)

    // La navigazione ricarica l’elenco lato server: senza attendere la fine si
    // leggerebbero le celle dello scheletro di caricamento.
    await expect(righe(page).first()).toBeVisible()

    // Gli importi si leggono dalle celle della tabella, che esiste solo da
    // tablet in su; l’ordine è comunque deciso dal server, uguale per entrambe.
    if (isMobile) return

    const importi = await page
      .locator('table tbody tr td[data-column="lifetime_value_cents"]')
      .allInnerTexts()
      .then((valori) =>
        valori.map((valore) => Number(valore.replace(/[^\d,]/g, '').replace(',', '.'))),
      )

    expect(importi.length).toBeGreaterThan(2)
    expect(importi[0]).toBeGreaterThanOrEqual(importi[1] ?? 0)
  })

  test('un filtro senza risultati spiega come uscirne', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti?q=zzzznessuno')

    await expect(page.getByText('Nessun cliente corrisponde ai filtri')).toBeVisible()
    await page.getByRole('link', { name: 'Azzera i filtri' }).click()
    await expect(page).toHaveURL(/\/clienti$/)
  })

  test('la paginazione cambia pagina restando nei filtri', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti?per=25')

    await page.getByRole('button', { name: 'Pagina successiva' }).click()
    await expect(page).toHaveURL(/pagina=2/)
    await expect(page).toHaveURL(/per=25/)
  })
})

test.describe('Scheda cliente', () => {
  test('riporta valore, margine e schede di dettaglio', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti?ordina=lifetime_value_cents&verso=desc')

    await apriPrimaScheda(page, 'clienti')
    await expect(page.getByText('Valore generato')).toBeVisible()
    await expect(page.getByText('Margine generato')).toBeVisible()

    await page.getByRole('tab', { name: /Viaggi/ }).click()
    await expect(page.getByRole('columnheader', { name: 'Pratica' })).toBeVisible()

    await page.getByRole('tab', { name: /Cronologia/ }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  })

  test('offre l’esportazione dei dati per il GDPR', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti')
    await apriPrimaScheda(page, 'clienti')

    await page.getByRole('button', { name: 'Altre azioni' }).click()
    const voce = page.getByRole('menuitem', { name: /Esporta i dati/ })
    // La voce di menu e’ essa stessa il collegamento: DropdownMenuItem usa asChild.
    await expect(voce).toBeVisible()
    await expect(voce).toHaveAttribute('href', /\/dati$/)
  })
})

test.describe('Creazione e modifica di un cliente', () => {
  test('crea un privato e lo ritrova nell’elenco', async ({ page }) => {
    await accedi(page, 'titolare')
    const cognome = unico('Collaudo')

    await page.goto('/clienti/nuovo')
    await page.locator('input[name="last_name"]').fill(cognome)
    await page.locator('input[name="first_name"]').fill('Mario')
    await page.locator('input[name="email"]').fill('mario.collaudo@example.it')
    await page.locator('input[name="city"]').fill('Varese')
    await page.locator('input[name="province"]').fill('VA')
    await page.getByRole('button', { name: 'Crea il cliente' }).click()

    await expect(page.getByRole('heading', { name: new RegExp(cognome) })).toBeVisible()
    await expect(page.getByText('mario.collaudo@example.it')).toBeVisible()

    await page.goto(`/clienti?q=${cognome}`)
    await expect(righe(page).first()).toContainText(cognome)
  })

  test('rifiuta una partita IVA con la cifra di controllo sbagliata', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti/nuovo')

    await page.locator('input[name="last_name"]').fill('Prova')
    await page.locator('input[name="vat_number"]').fill('00743110158')
    await page.getByRole('button', { name: 'Crea il cliente' }).click()

    await expect(page.getByText(/Partita IVA non valida/)).toBeVisible()
    // Il dato digitato non va perso quando la validazione fallisce
    await expect(page.locator('input[name="last_name"]')).toHaveValue('Prova')
  })

  test('accetta un identificativo fiscale estero', async ({ page }) => {
    await accedi(page, 'titolare')
    const nome = unico('Estero')

    await page.goto('/clienti/nuovo')
    await page.getByRole('radio', { name: 'Azienda o ente' }).click()
    await page.locator('input[name="company_name"]').fill(nome)
    await page.locator('input[name="vat_number"]').fill('ES-B12345678')
    await page.getByRole('button', { name: 'Crea il cliente' }).click()

    await expect(page.getByRole('heading', { name: new RegExp(nome) })).toBeVisible()
    await expect(page.getByText('Azienda o ente · P. IVA ES-B12345678')).toBeVisible()
  })

  test('modifica un cliente esistente', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/clienti?q=collaudo')
    await attendiElenco(page, 'Nessun cliente corrisponde ai filtri')

    const quante = await righe(page).count()
    test.skip(quante === 0, 'Nessun cliente di collaudo da modificare')

    await apriPrimaScheda(page, 'clienti')
    await page.getByRole('link', { name: 'Modifica' }).click()

    const nuovoTelefono = `0332 ${Math.floor(100000 + Math.random() * 899999)}`
    await page.locator('input[name="phone"]').fill(nuovoTelefono)
    await page.getByRole('button', { name: 'Salva le modifiche' }).click()

    await expect(page.getByText(nuovoTelefono)).toBeVisible()
  })
})

test.describe('Passeggeri', () => {
  test('il filtro sui documenti trova chi non è in regola', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/passeggeri?documento=insufficiente')
    await attendiElenco(page, 'Nessun passeggero corrisponde ai filtri')

    const elenco = righe(page)
    const quante = await elenco.count()
    if (quante > 0) {
      await expect(elenco.first()).toContainText('Scade prima del rientro')
    } else {
      await expect(page.getByText('Nessun passeggero corrisponde ai filtri')).toBeVisible()
    }
  })

  test('crea un passeggero con documento e lo collega a un cliente', async ({ page }) => {
    await accedi(page, 'titolare')
    const cognome = unico('Passeggero')

    await page.goto('/passeggeri/nuovo')
    await page.locator('input[name="last_name"]').fill(cognome)
    await page.locator('input[name="first_name"]').fill('Anna')
    await page.locator('input[name="document_number"]').fill('YA1234567')
    await page.locator('input[name="document_expires_at"]').fill('2035-01-01')
    await page.getByRole('button', { name: 'Crea il passeggero' }).click()

    await expect(page.getByRole('heading', { name: new RegExp(cognome) })).toBeVisible()
    await expect(page.getByText('YA1234567')).toBeVisible()
  })

  test('rifiuta una scadenza documento anteriore al rilascio', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/passeggeri/nuovo')

    await page.locator('input[name="last_name"]').fill('Prova')
    await page.locator('input[name="first_name"]').fill('Data')
    await page.locator('input[name="document_number"]').fill('YA0000001')
    await page.locator('input[name="document_issued_at"]').fill('2026-06-01')
    await page.locator('input[name="document_expires_at"]').fill('2026-01-01')
    await page.getByRole('button', { name: 'Crea il passeggero' }).click()

    await expect(page.getByText(/non può precedere il rilascio/)).toBeVisible()
  })
})

test.describe('Fornitori', () => {
  test('la scheda mostra condizioni, scadenzario e servizi', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/fornitori?ordina=cost_cents&verso=desc')

    await apriPrimaScheda(page, 'fornitori')
    await expect(page.getByText('Acquistato')).toBeVisible()
    await expect(page.getByText('Dilazione di pagamento')).toBeVisible()

    await page.getByRole('tab', { name: /Scadenzario/ }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()

    await page.getByRole('tab', { name: /Servizi/ }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
  })

  test('disattiva e riattiva un fornitore', async ({ page }) => {
    await accedi(page, 'titolare')
    const nome = unico('Disattivabile')

    // Il fornitore lo crea il test: così parte sempre da attivo, anche se una
    // esecuzione precedente si è interrotta a metà.
    await page.goto('/fornitori/nuovo')
    await page.locator('input[name="name"]').fill(nome)
    await page.getByRole('button', { name: 'Crea il fornitore' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(nome) })).toBeVisible()

    await page.getByRole('button', { name: 'Disattiva' }).click()
    // Il testo completo distingue l’avviso nella scheda dal messaggio del toast.
    await expect(page.getByText(/Fornitore disattivato: resta nello storico/)).toBeVisible()

    await page.getByRole('button', { name: 'Riattiva' }).click()
    await expect(page.getByText(/Fornitore riattivato/)).toBeVisible()
  })

  test('crea un fornitore con commissione e IBAN', async ({ page }) => {
    await accedi(page, 'titolare')
    const nome = unico('Fornitore')

    await page.goto('/fornitori/nuovo')
    await page.locator('input[name="name"]').fill(nome)
    await page.locator('input[name="payment_terms_days"]').fill('45')
    await page.locator('input[name="default_commission_percent"]').fill('14.5')
    await page.locator('input[name="iban"]').fill('IT60X0542811101000000123456')
    await page.getByRole('button', { name: 'Crea il fornitore' }).click()

    await expect(page.getByRole('heading', { name: new RegExp(nome) })).toBeVisible()
    await expect(page.getByText('14,50%')).toBeVisible()
    await expect(page.getByText('Dilazione 45 giorni')).toBeVisible()
  })

  test('rifiuta un IBAN non valido', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/fornitori/nuovo')

    await page.locator('input[name="name"]').fill('Prova IBAN')
    await page.locator('input[name="iban"]').fill('IT60X0542811101000000123457')
    await page.getByRole('button', { name: 'Crea il fornitore' }).click()

    await expect(page.getByText('IBAN non valido')).toBeVisible()
  })
})

test.describe('Importazione da CSV', () => {
  test('mostra l’anteprima, segnala le righe da correggere e importa le valide', async ({ page }) => {
    await accedi(page, 'titolare')
    const marca = Date.now().toString(36)

    await page.goto('/clienti/importa')

    const csv = [
      'Cognome;Nome;Email;Città;Provincia;Partita IVA;Consenso privacy',
      `Importato-${marca};Luigi;luigi.${marca}@example.it;Varese;VA;;Sì`,
      `Secondo-${marca};Anna;anna.${marca}@example.it;Como;CO;;No`,
      `Scartato-${marca};Errore;non-una-email;Milano;MI;00743110158;No`,
    ].join('\n')

    const carica = async () => {
      await page.locator('input[type="file"]').setInputFiles({
        name: 'clienti.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      })
    }

    await carica()

    await expect(page.getByRole('heading', { name: 'Anteprima' })).toBeVisible()
    await expect(page.getByText('2 righe pronte')).toBeVisible()
    await expect(page.getByText(/1.*da correggere/)).toBeVisible()
    // La riga con la partita IVA sbagliata è quella scartata
    await expect(page.getByText(/Partita IVA non valida/)).toBeVisible()

    await page.getByRole('button', { name: 'Importa 2 righe' }).click()
    await expect(page.locator('#contenuto').getByText(/2 righe importate/)).toBeVisible()

    await page.goto(`/clienti?q=importato-${marca}`)
    await expect(righe(page).first()).toContainText(`Importato-${marca}`)
  })

  test('reimportare lo stesso file non duplica le anagrafiche', async ({ page }) => {
    await accedi(page, 'titolare')
    const marca = Date.now().toString(36)
    const csv = [
      'Cognome;Nome;Email',
      `Doppione-${marca};Carla;carla.${marca}@example.it`,
    ].join('\n')

    const carica = async () => {
      await page.goto('/clienti/importa')
      await page.locator('input[type="file"]').setInputFiles({
        name: 'clienti.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      })
      await expect(page.getByRole('heading', { name: 'Anteprima' })).toBeVisible()
      await page.getByRole('button', { name: 'Importa 1 riga' }).click()
    }

    await carica()
    await expect(page.locator('#contenuto').getByText(/1 riga importate?/)).toBeVisible()

    await carica()
    await expect(page.locator('#contenuto').getByText(/1 riga già in archivio/)).toBeVisible()
    await expect(page.locator('#contenuto').getByText(/Email già presente in anagrafica/)).toBeVisible()

    await page.goto(`/clienti?q=doppione-${marca}`)
    await expect(righe(page)).toHaveCount(1)
  })

  test('rifiuta un file senza le colonne obbligatorie', async ({ page }) => {
    await accedi(page, 'titolare')
    await page.goto('/passeggeri/importa')

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sbagliato.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Colonna;Altra\nvalore;altro', 'utf8'),
    })

    await expect(page.getByText(/mancano le colonne obbligatorie/)).toBeVisible()
  })

  test('il modello scaricabile contiene le intestazioni riconosciute', async ({ page }) => {
    await accedi(page, 'titolare')
    const risposta = await page.request.get('/clienti/modello')

    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-disposition']).toContain('modello-clienti.csv')

    const testo = await risposta.text()
    expect(testo).toContain('Cognome')
    expect(testo).toContain('Partita IVA')
    expect(testo).toContain('Consenso privacy')
  })
})

test.describe('Ricerca globale', () => {
  test('la tavolozza dei comandi trova un cliente e apre la sua scheda', async ({ page }) => {
    await accedi(page, 'titolare')

    await page.getByRole('button', { name: /Cerca o esegui un comando|Apri la ricerca/ }).click()
    await page.getByRole('combobox').fill('bianchi')

    const risultato = page.getByRole('option', { name: /Bianchi/ }).first()
    await expect(risultato).toBeVisible()
    await risultato.click()

    await expect(page).toHaveURL(/\/clienti\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: /Bianchi/, level: 1 })).toBeVisible()
  })

  test('cerca anche per email e non solo per nome', async ({ page }) => {
    await accedi(page, 'titolare')

    await page.getByRole('button', { name: /Cerca o esegui un comando|Apri la ricerca/ }).click()
    await page.getByRole('combobox').fill('silvia.bianchi11@example.it')

    // La stessa email appartiene al cliente e al passeggero collegato: la
    // ricerca attraversa tutte le anagrafiche, non solo quella dei clienti.
    await expect(page.getByRole('option', { name: /Bianchi Silvia/ })).toHaveCount(2)
  })
})

test.describe('Esportazione', () => {
  test('esporta l’elenco clienti con i filtri applicati', async ({ page }) => {
    await accedi(page, 'titolare')
    const risposta = await page.request.get('/clienti/esporta?tipo=azienda')

    expect(risposta.status()).toBe(200)
    expect(risposta.headers()['content-type']).toContain('text/csv')

    const testo = await risposta.text()
    const righe = testo.trim().split('\r\n')
    expect(righe[0]).toContain('Denominazione')
    expect(righe[0]).toContain('Valore generato')
    // Solo aziende: nessuna riga marcata come privato
    expect(righe.slice(1).every((riga) => riga.startsWith('Azienda'))).toBe(true)
  })
})

test.describe('Permessi', () => {
  test('la sola lettura non vede i comandi di modifica', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/clienti')

    await expect(page.getByRole('link', { name: 'Nuovo cliente' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Importa$/ })).toHaveCount(0)
    // L'esportazione resta disponibile: è una lettura
    await expect(page.getByRole('link', { name: /^Esporta$/ })).toBeVisible()
  })

  test('la sola lettura non può aprire la pagina di creazione', async ({ page }) => {
    await accedi(page, 'lettura')
    await page.goto('/clienti/nuovo')
    await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible()
  })
})
