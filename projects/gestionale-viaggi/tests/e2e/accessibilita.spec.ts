import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * L'accessibilità, misurata invece che dichiarata.
 *
 * axe-core passa su ogni pagina del gestionale, nei due temi, su schermo
 * grande e su telefono. Non sostituisce una prova con un lettore di schermo —
 * nessuno strumento automatico la sostituisce — ma coglie le cose che si
 * rompono in silenzio a ogni modifica: un contrasto sceso sotto la soglia, un
 * comando a sola icona rimasto senza nome, un campo senza etichetta, un
 * titolo saltato.
 *
 * È un test permanente, non un controllo fatto una volta: la regressione di
 * accessibilità è esattamente il tipo di difetto che nessuno segnala.
 */
const CREDENZIALI = {
  titolare: { email: 'titolare@orizzontiviaggi.it', password: 'Gestionale2026!' },
}

/** Le regole che contano: WCAG 2.1 fino ad AA, più le buone pratiche di axe. */
const REGOLE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

const THEME_COOKIE = 'gv-tema'

async function accedi(page: Page) {
  const { email, password } = CREDENZIALI.titolare
  await page.goto('/accedi')
  await page.locator('input[name="email"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
}

/** Il tema si sceglie con il cookie che il server legge per servire la pagina già giusta. */
async function impostaTema(page: Page, tema: 'light' | 'dark') {
  const url = new URL(page.url())
  await page.context().addCookies([
    { name: THEME_COOKIE, value: tema, domain: url.hostname, path: '/' },
  ])
}

/**
 * Analizza la pagina corrente e restituisce le violazioni in forma leggibile.
 *
 * Il rapporto grezzo di axe è enorme; qui resta ciò che serve per correggere:
 * la regola, quanto è grave, e il primo elemento che la infrange.
 */
async function violazioni(page: Page) {
  const esito = await new AxeBuilder({ page }).withTags(REGOLE).analyze()
  return esito.violations.map((v) => ({
    regola: v.id,
    gravita: v.impact,
    descrizione: v.help,
    elementi: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }))
}

/**
 * Attende che il corpo sospeso della pagina sia arrivato.
 *
 * Il filtro sulla visibilità non è un dettaglio: tabella e schede convivono
 * nel DOM, e senza filtro l'attesa si accontenta della copia nascosta —
 * riuscendo prima che la pagina sia davvero a schermo, o non riuscendo mai.
 */
async function attendiCorpo(page: Page, atteso: string | RegExp) {
  await expect(page.getByText(atteso).filter({ visible: true }).first()).toBeVisible({
    timeout: 20_000,
  })
}

interface Pagina {
  readonly nome: string
  readonly url: string
  /** Un testo che compare solo quando il corpo è stato caricato davvero. */
  readonly atteso: string | RegExp
}

const PAGINE: readonly Pagina[] = [
  { nome: 'Panoramica', url: '/', atteso: 'Venduto' },
  { nome: 'Agenda', url: '/agenda?finestra=mese', atteso: 'Attività aperte' },
  { nome: 'Pratiche', url: '/pratiche', atteso: /di\s+\d+/ },
  { nome: 'Preventivi', url: '/preventivi', atteso: /di\s+\d+/ },
  { nome: 'Scadenzario', url: '/scadenzario', atteso: /Da incassare|Nessuna rata/ },
  { nome: 'Fatture', url: '/fatture', atteso: /di\s+\d+|Nessuna fattura/ },
  { nome: 'Registro IVA', url: '/registri', atteso: /Imponibile|Nessun documento/ },
  { nome: 'Report', url: '/report?periodo=anno', atteso: 'Venduto' },
  { nome: 'Clienti', url: '/clienti', atteso: /di\s+\d+/ },
  { nome: 'Passeggeri', url: '/passeggeri', atteso: /di\s+\d+|Nessun passeggero/ },
  { nome: 'Fornitori', url: '/fornitori', atteso: /di\s+\d+|Nessun fornitore/ },
  { nome: 'Impostazioni', url: '/impostazioni', atteso: 'Dati fiscali' },
]

for (const tema of ['light', 'dark'] as const) {
  test.describe(`Accessibilità (tema ${tema === 'light' ? 'chiaro' : 'scuro'})`, () => {
    test(`le pagine pubbliche non hanno violazioni`, async ({ page }) => {
      await page.goto('/accedi')
      await impostaTema(page, tema)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible()
      expect(await violazioni(page)).toEqual([])

      await page.goto('/recupera-password')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await violazioni(page)).toEqual([])

      await page.goto('/registrati')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await violazioni(page)).toEqual([])
    })

    test(`le pagine del gestionale non hanno violazioni`, async ({ page }) => {
      test.slow()
      await accedi(page)
      await impostaTema(page, tema)

      const problemi: Record<string, unknown> = {}
      for (const pagina of PAGINE) {
        await page.goto(pagina.url)
        await attendiCorpo(page, pagina.atteso)
        const trovate = await violazioni(page)
        if (trovate.length > 0) problemi[pagina.nome] = trovate
      }
      expect(problemi).toEqual({})
    })

    test(`le schede di dettaglio non hanno violazioni`, async ({ page }) => {
      test.slow()
      await accedi(page)
      await impostaTema(page, tema)

      const problemi: Record<string, unknown> = {}
      const schede: ReadonlyArray<[string, string]> = [
        ['Pratica', '/pratiche'],
        ['Preventivo', '/preventivi'],
        ['Cliente', '/clienti'],
        ['Fornitore', '/fornitori'],
      ]

      for (const [nome, elenco] of schede) {
        await page.goto(elenco)
        const riga = page.locator('[data-riga]:visible').first()
        await expect(riga).toBeVisible({ timeout: 20_000 })
        await riga.getByRole('link').first().click()
        await page.waitForURL(/\/[0-9a-f-]{36}/, { timeout: 20_000 })
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const trovate = await violazioni(page)
        if (trovate.length > 0) problemi[nome] = trovate
      }
      expect(problemi).toEqual({})
    })

    test(`le finestre di dialogo non hanno violazioni`, async ({ page }) => {
      await accedi(page)
      await impostaTema(page, tema)

      // Una finestra modale è il punto in cui l'accessibilità si rompe più
      // facilmente: focus, titolo, descrizione, e la via d'uscita.
      await page.goto('/agenda?finestra=mese')
      await attendiCorpo(page, 'Attività aperte')
      await page.getByRole('button', { name: 'Nuova attività' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await violazioni(page)).toEqual([])
      await page.keyboard.press('Escape')

      // La tavolozza dei comandi: si apre da tastiera e si usa da tastiera.
      await page.keyboard.press('ControlOrMeta+k')
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await violazioni(page)).toEqual([])
    })
  })
}
