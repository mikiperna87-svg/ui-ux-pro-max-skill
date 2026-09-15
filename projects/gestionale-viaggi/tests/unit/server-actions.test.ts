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
