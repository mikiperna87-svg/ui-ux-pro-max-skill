import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Un `loading.tsx` dentro `src/app` crea un confine Suspense sopra le pagine.
 * Insieme al layout che attende a ogni richiesta e alle azioni server che
 * rinnovano il cookie di sessione e chiamano `revalidatePath`, quel confine
 * innesca un difetto del router di Next 15: la transizione resta sospesa e
 * l'interfaccia non applica mai la risposta, lasciando il bottone fermo su
 * "Salvataggio..." con il dato già salvato.
 *
 * Misurato: 16 creazioni bloccate su 40 con il file, 0 su 40 senza.
 * Il motivo per esteso è nella decisione 35 di DECISIONI.md.
 */
const APP_DIR = path.resolve(process.cwd(), 'src/app')

async function loadingFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const trovati: string[] = []

  for (const entry of entries) {
    const completo = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      trovati.push(...(await loadingFiles(completo)))
    } else if (/^loading\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      trovati.push(path.relative(process.cwd(), completo))
    }
  }

  return trovati
}

describe('confini di caricamento delle rotte', () => {
  it('nessun loading.tsx: lo scheletro sta dentro le pagine', async () => {
    expect(await loadingFiles(APP_DIR)).toEqual([])
  })
})
