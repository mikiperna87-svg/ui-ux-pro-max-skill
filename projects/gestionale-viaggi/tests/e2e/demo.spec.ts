import { expect, test } from '@playwright/test'

/**
 * L'ingresso nella demo, dalla pagina di accesso.
 *
 * Chi valuta un gestionale non copia a mano un'email e una password: ogni
 * passaggio in più è gente che non arriva in fondo. Questo test verifica che
 * il percorso sia davvero un clic, e soprattutto che porti dentro un account
 * di sola lettura — una demo che si lascia modificare dura un pomeriggio.
 */
const CONFIGURATA = Boolean(process.env.NEXT_PUBLIC_DEMO_EMAIL ?? 'revisore@orizzontiviaggi.it')

test.describe('demo pubblica', () => {
  test.skip(!CONFIGURATA, 'Demo non configurata su questa installazione')

  test('si entra con un clic e si atterra nella panoramica', async ({ page }) => {
    await page.goto('/accedi')
    const invito = page.getByText('Vuoi solo vedere com’è fatto?')
    await expect(invito).toBeVisible()

    await page.getByRole('button', { name: 'Entra nella demo' }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('la demo è in sola lettura', async ({ page }) => {
    await page.goto('/accedi')
    await page.getByRole('button', { name: 'Entra nella demo' }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })

    await page.goto('/pratiche')
    // I dati ci sono: una demo vuota non dimostra niente.
    await expect(page.getByRole('link', { name: /Nuova pratica/ })).toHaveCount(0)

    // E la pagina di creazione non esiste nemmeno per indirizzo diretto.
    const risposta = await page.goto('/pratiche/nuova')
    expect(risposta?.status()).toBe(404)
  })

  test('le credenziali si possono leggere, per rientrare domani', async ({ page }) => {
    await page.goto('/accedi')
    await page.getByRole('button', { name: 'Mostra le credenziali della demo' }).click()
    await expect(page.getByText('revisore@orizzontiviaggi.it')).toBeVisible()
  })
})
