import { expect, type Page } from '@playwright/test'

/** La soglia `sm` del design system: sotto, i filtri stanno chiusi. */
const LARGHEZZA_SM = 640

/**
 * Gesti comuni agli elenchi del gestionale.
 *
 * Da schermo stretto i filtri stanno chiusi dietro il comando "Filtri": un
 * test che li cerca direttamente non trova niente, e racconta un difetto che
 * non c'è. Questa funzione li apre lì, e su schermo grande non fa nulla —
 * decidendolo dalla larghezza della finestra, non dalla presenza del comando,
 * che a pagina appena caricata potrebbe non essere ancora a schermo.
 */
export async function apriFiltri(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? LARGHEZZA_SM) >= LARGHEZZA_SM) return

  const comando = page.getByRole('button', { name: /^Filtri/ })
  await expect(comando).toBeVisible()
  if ((await comando.getAttribute('aria-expanded')) === 'true') return
  await comando.click()
  await expect(comando).toHaveAttribute('aria-expanded', 'true')
}
