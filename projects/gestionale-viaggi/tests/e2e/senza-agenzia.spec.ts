import pg from 'pg'
import { expect, test } from '@playwright/test'

/**
 * Un account autenticato che non ha (piu') un'agenzia deve poter arrivare al
 * modulo di creazione. Prima non ci arrivava: il middleware rimbalzava su `/`
 * chiunque fosse autenticato e aprisse `/registrati`, e `/` lo rispediva su
 * `/registrati` perche' la sessione applicativa non c'era. Due redirect che si
 * rilanciavano a vicenda, e al posto di una risposta una pagina bianca.
 *
 * Il caso non e' teorico: ci finisce chi viene invitato, chi conferma
 * l'indirizzo e non completa la registrazione, e chi aveva un'agenzia poi
 * cancellata.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

async function cancellaAgenzia(nome: string): Promise<number> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const esito = await client.query(
      'update public.agencies set deleted_at = now() where name = $1 and deleted_at is null',
      [nome],
    )
    return esito.rowCount ?? 0
  } finally {
    await client.end()
  }
}

test('chi resta senza agenzia arriva al modulo, non a una pagina bianca', async ({ page }, info) => {
  const marca = `${Date.now()}-${info.project.name}`
  const nomeAgenzia = `Agenzia Orfana ${marca}`

  await page.goto('/registrati')
  await page.fill('input[name="agencyName"]', nomeAgenzia)
  await page.fill('input[name="fullName"]', 'Utente Orfano')
  await page.fill('input[name="email"]', `orfano.${marca}@example.com`)
  await page.fill('input[name="password"]', 'ProvaOrfano2026')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })

  expect(await cancellaAgenzia(nomeAgenzia)).toBe(1)

  // La sessione di autenticazione resta valida: e' l'agenzia a non esserci piu'.
  await page.goto('/')
  await expect(page).toHaveURL(/\/registrati/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Crea la tua agenzia' })).toBeVisible()
})
