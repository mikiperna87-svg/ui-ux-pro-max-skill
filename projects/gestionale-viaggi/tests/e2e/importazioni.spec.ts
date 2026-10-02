import { expect, type Page, test } from '@playwright/test'

/**
 * Il trasloco da un altro gestionale: pratiche, preventivi e documenti
 * pregressi.
 *
 * Ogni prova passa dall'interfaccia come farebbe un'agenzia il primo giorno:
 * scarica il modello, lo compila, lo carica, guarda l'anteprima e conferma. È
 * l'unico modo di accorgersi che il modello che consegniamo non si lascia
 * reimportare, che è il difetto più costoso di questa funzione.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
  operatore: { email: 'operatore@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

async function accedi(page: Page, chi: keyof typeof CREDENZIALI) {
  const { email, password } = CREDENZIALI[chi]
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

/**
 * Le righe dell'elenco: tabella da tablet in su, schede su telefono. Entrambe
 * portano `data-riga` e stanno nel DOM insieme, quindi conta solo la visibile.
 */
const righe = (page: Page) => page.locator('[data-riga]:visible')

async function carica(page: Page, nome: string, elenco: readonly string[]) {
  await page.locator('input[type="file"]').setInputFiles({
    name: nome,
    mimeType: 'text/csv',
    buffer: Buffer.from(elenco.join('\n'), 'utf8'),
  })
  await expect(page.getByRole('heading', { name: 'Anteprima' })).toBeVisible()
}

const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

/**
 * Il cliente su cui agganciare tutto il resto, creato dalla prova stessa.
 *
 * Importarlo invece di cercarne uno in archivio fa due cose in una: dà un
 * riferimento che non dipende dai dati dimostrativi, e ripercorre l'ordine che
 * le pagine raccomandano — prima i clienti, poi quello che li cita.
 */
async function clienteImportato(page: Page, m: string): Promise<string> {
  const email = `trasloco.${m}@example.it`
  await page.goto('/clienti/importa')
  await carica(page, 'clienti.csv', [
    'Cognome;Nome;Email;Città;Provincia;Consenso privacy',
    `Trasloco-${m};Giulia;${email};Varese;VA;Sì`,
  ])
  await page.getByRole('button', { name: 'Importa 1 riga' }).click()
  await expect(page.locator('#contenuto').getByText(/1 riga importate?/)).toBeVisible()
  return email
}

test.describe('Importazione delle pratiche', () => {
  test('importa le pratiche con il loro importo e scarta quelle senza cliente', async ({ page }) => {
    await accedi(page, 'titolare')
    const m = marca()
    const cliente = await clienteImportato(page, m)

    await page.goto('/pratiche/importa')
    await carica(page, 'pratiche.csv', [
      'Cliente;Titolo;Destinazione;Partenza;Passeggeri;Tipo di vendita;Stato;Servizio;Importo;Costo',
      `${cliente};Trasloco ${m};Lisbona;29/12/2026;2;Pacchetto;Prenotata;Volo e hotel;1.840,00;1.420,00`,
      `Nessuno Che Esista ${m};Scartata ${m};Vienna;10/05/2027;1;Biglietteria;Confermata;Volo;180,00;`,
    ])

    await expect(page.getByText('2 righe pronte')).toBeVisible()
    await page.getByRole('button', { name: 'Importa 2 righe' }).click()

    const esito = page.locator('#contenuto')
    await expect(esito.getByText(/1 pratica importate/)).toBeVisible()
    await expect(esito.getByText(/Nessun cliente corrisponde/)).toBeVisible()

    // La ricerca per titolo trova la pratica; la verifica si appoggia a
    // destinazione e stato, che compaiono sia nella tabella sia nelle schede
    // che la sostituiscono su telefono — dove il titolo non c'è.
    await page.goto(`/pratiche?q=trasloco+${m}`)
    await expect(righe(page)).toHaveCount(1)
    const riga = righe(page).first()
    await expect(riga).toContainText('Lisbona')
    await expect(riga).toContainText('Confermata')
    await expect(riga).toContainText('1.840,00')
  })

  test('reimportare lo stesso file non duplica le pratiche', async ({ page }) => {
    await accedi(page, 'titolare')
    const m = marca()
    const cliente = await clienteImportato(page, m)
    const file = [
      'Cliente;Titolo;Destinazione;Partenza;Importo',
      `${cliente};Doppione ${m};Atene;01/06/2027;900,00`,
    ]

    for (const giro of [1, 2]) {
      await page.goto('/pratiche/importa')
      await carica(page, 'pratiche.csv', file)
      await page.getByRole('button', { name: 'Importa 1 riga' }).click()
      if (giro === 1) {
        await expect(page.locator('#contenuto').getByText(/1 pratica importate/)).toBeVisible()
      } else {
        await expect(
          page.locator('#contenuto').getByText(/1 riga già in archivio/),
        ).toBeVisible()
      }
    }

    await page.goto(`/pratiche?q=doppione+${m}`)
    await expect(righe(page)).toHaveCount(1)
  })
})

test.describe('Importazione dei preventivi', () => {
  test('importa i preventivi e conserva il numero di origine nelle note', async ({ page }) => {
    await accedi(page, 'titolare')
    const m = marca()
    const cliente = await clienteImportato(page, m)

    await page.goto('/preventivi/importa')
    await carica(page, 'preventivi.csv', [
      'Cliente;Titolo;Destinazione;Partenza;Passeggeri;Stato;Numero di origine;Servizio;Importo;Costo',
      `${cliente};Proposta ${m};Siviglia;12/04/2027;2;Spedito;PREV-2026-${m};Volo e hotel;1.200,00;900,00`,
    ])

    await page.getByRole('button', { name: 'Importa 1 riga' }).click()
    await expect(page.locator('#contenuto').getByText(/1 preventivo importati/)).toBeVisible()

    // La ricerca dei preventivi guarda anche le note: il numero di origine si
    // ritrova da lì, che è il motivo per cui ci finisce.
    await page.goto(`/preventivi?q=PREV-2026-${m}`)
    await expect(righe(page)).toHaveCount(1)
    const riga = righe(page).first()
    await expect(riga).toContainText('Siviglia')
    await expect(riga).toContainText('Inviato')
    await expect(riga).toContainText('1.200,00')
  })
})

test.describe('Importazione dei documenti pregressi', () => {
  test('conserva il numero, raggruppa le righe e non si lascia ritrasmettere', async ({ page }) => {
    await accedi(page, 'titolare')
    const cliente = await clienteImportato(page, marca())
    // Un numero alto e irripetibile: la numerazione dell'agenzia dimostrativa
    // non deve scontrarsi con quella della prova.
    const numero = 900_000 + (Date.now() % 90_000)

    await page.goto('/fatture/importa')
    await carica(page, 'fatture.csv', [
      'Numero;Tipo di documento;Cliente;Data di emissione;Scadenza;Stato;Regime IVA;Codice;Descrizione;Quantità;Importo;Costo del viaggio;Aliquota IVA',
      `${numero};Fattura;${cliente};14/11/2025;14/12/2025;Pagata;Margine;FT-2025/${numero};Pacchetto Lisbona;1;1.840,00;1.420,00;22`,
      `${numero};Fattura;${cliente};14/11/2025;14/12/2025;Pagata;Margine;FT-2025/${numero};Assicurazione;2;45,00;30,00;22`,
    ])

    // Due righe del file, un documento solo.
    await expect(page.getByText('2 righe pronte')).toBeVisible()
    await page.getByRole('button', { name: 'Importa 2 righe' }).click()
    await expect(page.locator('#contenuto').getByText(/1 documento importati/)).toBeVisible()

    await page.goto(`/fatture?q=FT-2025%2F${numero}`)
    const riga = righe(page).first()
    await expect(riga).toContainText(`FT-2025/${numero}`)
    await riga.locator('a').first().click()

    // La scheda dice da dove viene e perché non si trasmette.
    await expect(page.getByText(/importato da un gestionale precedente/i)).toBeVisible()
    // Il pannello della trasmissione non c'è: non ci sarebbe niente da fare.
    await expect(page.getByRole('button', { name: /Prepara il file/i })).toHaveCount(0)

    // E il file XML non si scarica nemmeno da indirizzo diretto.
    const indirizzo = page.url()
    const risposta = await page.request.get(`${indirizzo.replace(/\/$/, '')}/xml`)
    expect(risposta.status()).toBe(409)
    expect(await risposta.text()).toContain('non si ritrasmette')
  })

  test('rifiuta un numero che non è un numero e lo spiega', async ({ page }) => {
    await accedi(page, 'titolare')
    const cliente = await clienteImportato(page, marca())

    await page.goto('/fatture/importa')
    await carica(page, 'fatture.csv', [
      'Numero;Cliente;Data di emissione;Descrizione;Importo',
      `FT-2025/0417;${cliente};14/11/2025;Pacchetto;100,00`,
    ])

    await expect(page.getByText(/1.*da correggere/)).toBeVisible()
    await expect(page.getByText(/colonna «Codice»/)).toBeVisible()
  })

  // Importare documenti fiscali non è «scrivere»: un operatore non deve nemmeno
  // vedere la pagina.
  test('non è accessibile a chi non tiene la contabilità', async ({ page }) => {
    await accedi(page, 'operatore')
    await page.goto('/fatture/importa')
    await expect(page.getByText(/Pagina non trovata/i)).toBeVisible()
  })
})

test.describe('I modelli scaricabili', () => {
  for (const [entita, intestazione] of [
    ['pratiche', 'Tipo di vendita'],
    ['preventivi', 'Numero di origine'],
    ['fatture', 'Costo del viaggio'],
  ] as const) {
    test(`il modello di ${entita} porta le intestazioni che l’importazione riconosce`, async ({
      page,
    }) => {
      await accedi(page, 'titolare')
      const risposta = await page.request.get(`/${entita}/modello`)
      expect(risposta.status()).toBe(200)
      const testo = await risposta.text()
      expect(testo).toContain(intestazione)
      expect(risposta.headers()['content-disposition']).toContain(`modello-${entita}.csv`)
    })
  }
})
