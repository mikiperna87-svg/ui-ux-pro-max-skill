import { describe, expect, it } from 'vitest'
import { attribuisciIncassi } from '@/lib/scadenze'

/**
 * Attribuzione degli incassi alle scadenze: è il calcolo che dice all'operatore
 * quale rata è coperta e quale no.
 */
const rate = [
  { due_date: '2026-01-10', amount_cents: 30_000 },
  { due_date: '2026-03-10', amount_cents: 70_000 },
]

describe('attribuzione degli incassi alle scadenze', () => {
  it('senza incassi nessuna rata è coperta', () => {
    const esito = attribuisciIncassi(0, rate, '2026-01-01')
    expect(esito.map((riga) => riga.stato)).toEqual(['attesa', 'attesa'])
  })

  it('il primo incasso copre la prima scadenza', () => {
    const esito = attribuisciIncassi(30_000, rate, '2026-01-01')
    expect(esito[0]?.stato).toBe('saldata')
    expect(esito[1]?.stato).toBe('attesa')
  })

  it('un incasso parziale resta parziale, con l’importo attribuito', () => {
    const esito = attribuisciIncassi(12_345, rate, '2026-01-01')
    expect(esito[0]?.stato).toBe('parziale')
    expect(esito[0]?.coperto).toBe(12_345)
    expect(esito[0]?.label).toContain('123,45')
  })

  it('l’eccedenza scende sulla scadenza successiva', () => {
    const esito = attribuisciIncassi(55_000, rate, '2026-01-01')
    expect(esito[0]?.stato).toBe('saldata')
    expect(esito[1]?.stato).toBe('parziale')
    expect(esito[1]?.coperto).toBe(25_000)
  })

  it('una rata non coperta e già scaduta è in ritardo, non semplicemente attesa', () => {
    const esito = attribuisciIncassi(0, rate, '2026-02-01')
    expect(esito[0]?.stato).toBe('scaduta')
    expect(esito[1]?.stato).toBe('attesa')
  })

  it('una rata coperta non diventa scaduta anche a data passata', () => {
    const esito = attribuisciIncassi(100_000, rate, '2026-06-01')
    expect(esito.map((riga) => riga.stato)).toEqual(['saldata', 'saldata'])
  })

  it('un incasso superiore al dovuto non genera coperture negative', () => {
    const esito = attribuisciIncassi(500_000, rate, '2026-01-01')
    expect(esito[1]?.coperto).toBe(70_000)
  })

  it('un importo incassato negativo viene trattato come zero', () => {
    const esito = attribuisciIncassi(-5_000, rate, '2026-01-01')
    expect(esito.every((riga) => riga.coperto === 0)).toBe(true)
  })
})
