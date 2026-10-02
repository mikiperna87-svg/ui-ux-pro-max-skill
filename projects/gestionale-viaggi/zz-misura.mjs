import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'https://gestionale-viaggi-nu.vercel.app'
const PAGINE = ['/', '/pratiche', '/scadenzario', '/fatture', '/clienti', '/report?periodo=anno', '/agenda']

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [`--ignore-certificate-errors-spki-list=${process.env.PROXY_SPKI}`, '--no-sandbox'],
})
const page = await browser.newPage()

try {
  await page.goto(`${BASE}/accedi`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('input[name="email"]:visible').fill('titolare@orizzontiviaggi.it')
  await page.locator('input[name="password"]:visible').fill('Gestionale2026!')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 60_000 })

  console.log('pagina                 TTFB   completo   regione')
  for (const url of PAGINE) {
    const misure = []
    let regione = '?'
    // Tre giri: il primo paga l'avvio a freddo, si tiene il migliore.
    for (let giro = 0; giro < 3; giro++) {
      const risposta = await page.goto(`${BASE}${url}`, { waitUntil: 'load', timeout: 60_000 })
      regione = (risposta?.headers()['x-vercel-id'] ?? '?').split('::')[0]
      const t = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0]
        return { ttfb: n.responseStart - n.startTime, load: n.loadEventEnd - n.startTime }
      })
      misure.push(t)
    }
    const min = (campo) => Math.round(Math.min(...misure.map((m) => m[campo])))
    console.log(`${url.padEnd(22)} ${String(min('ttfb')).padStart(5)}ms ${String(min('load')).padStart(7)}ms   ${regione}`)
  }
} finally {
  await browser.close()
}
