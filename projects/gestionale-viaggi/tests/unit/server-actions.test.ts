import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Next impone che un file marcato 'use server' esporti soltanto funzioni
 * asincrone: una costante o un oggetto esportato da lì compila senza errori e
 * poi fa fallire ogni richiesta a runtime con un 500.
 *
 * È già capitato due volte durante lo sviluppo: questo test lo rende
 * impossibile una terza.
 */
const ACTIONS_DIR = path.resolve(process.cwd(), 'src/server/actions')

async function serverFiles(): Promise<string[]> {
  const entries = await readdir(ACTIONS_DIR)
  return entries.filter((entry) => entry.endsWith('.ts')).map((entry) => path.join(ACTIONS_DIR, entry))
}

describe('file "use server"', () => {
  it('esistono e sono tutti marcati', async () => {
    const files = await serverFiles()
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      expect(source.trimStart().startsWith("'use server'"), `${path.basename(file)} non è marcato`).toBe(
        true,
      )
    }
  })

  it('esportano soltanto funzioni asincrone', async () => {
    const files = await serverFiles()
    const offenders: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const lines = source.split('\n')

      lines.forEach((line, index) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('export ')) return
        // I tipi vengono cancellati in compilazione: non arrivano a runtime.
        if (/^export (type|interface) /.test(trimmed)) return
        if (/^export \{/.test(trimmed) || /^export \* /.test(trimmed)) return
        if (/^export async function /.test(trimmed)) return

        offenders.push(`${path.basename(file)}:${index + 1} → ${trimmed.slice(0, 70)}`)
      })
    }

    expect(offenders, 'Sposta questi export fuori dal file "use server"').toEqual([])
  })
})

describe('argomenti delle Server Action', () => {
  it('ogni azione che riceve un identificativo lo verifica', async () => {
    // Una Server Action è un endpoint HTTP: chiunque può chiamarla con quello
    // che vuole. Chi accetta un uuid deve controllarlo, non fidarsi del tipo
    // TypeScript, che a runtime non esiste più.
    const file = await readFile(path.join(ACTIONS_DIR, 'pratiche.ts'), 'utf8')
    const azioniConId = [
      'confirmBookingAction',
      'updateBookingStatusAction',
      'deleteBookingServiceAction',
      'removeBookingPassengerAction',
      'deleteViewAction',
    ]

    for (const azione of azioniConId) {
      const inizio = file.indexOf(`export async function ${azione}`)
      expect(inizio, `${azione} non trovata`).toBeGreaterThan(-1)
      const corpo = file.slice(inizio, inizio + 900)
      expect(corpo, `${azione} non controlla i suoi argomenti`).toMatch(/isUuid|STATI_AMMESSI/)
    }
  })

  it('anche le azioni sul denaro verificano i loro identificativi', async () => {
    const file = await readFile(path.join(ACTIONS_DIR, 'incassi.ts'), 'utf8')
    const azioniConId = ['deleteInstallmentAction', 'syncPayoutsAction', 'markPayoutsAction']

    for (const azione of azioniConId) {
      const inizio = file.indexOf(`export async function ${azione}`)
      expect(inizio, `${azione} non trovata`).toBeGreaterThan(-1)
      const corpo = file.slice(inizio, inizio + 900)
      expect(corpo, `${azione} non controlla i suoi argomenti`).toMatch(/isUuid|isStatoPagamento/)
    }
  })

  it('ogni azione sul denaro pretende il permesso contabile', async () => {
    // Un operatore vede le pratiche ma non muove denaro: il controllo sta sul
    // server, non nel fatto che l'interfaccia non mostri il bottone.
    const file = await readFile(path.join(ACTIONS_DIR, 'incassi.ts'), 'utf8')
    const azioni = file.matchAll(/export async function (\w+)\(/g)

    for (const azione of azioni) {
      const inizio = file.indexOf(`export async function ${azione[1]}`)
      const corpo = file.slice(inizio, inizio + 400)
      expect(corpo, `${azione[1]} non chiede il permesso`).toContain("requirePermission('accounting')")
    }
  })

  it('lo stato della pratica non si può portare ad "annullata" da un comando diretto', async () => {
    // L'annullamento pretende un motivo e passa da cancel_booking.
    const file = await readFile(path.join(ACTIONS_DIR, 'pratiche.ts'), 'utf8')
    const elenco = file.match(/const STATI_AMMESSI = \[([^\]]+)\]/)?.[1] ?? ''
    expect(elenco).not.toContain('annullata')
    expect(elenco).toContain('confermata')
  })
})
